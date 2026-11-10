import { CanvasElement } from './types';
import {
  ViewportTransform,
  ScreenPoint,
  WorldPoint,
  screenToWorld,
  zoomAtPoint,
  normalizeWheelDelta,
} from './coordinates';
import { hitTestElement } from './hitTest';
import { CanvasRenderer } from './renderer';
import { findClosestAnchor, computeAnchorWorldPosition, AnchorPosition } from './anchors';
import { IT_COMPONENTS } from './components';

export type Tool =
  | 'select'
  | 'hand'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'text'
  | 'database'
  | 'server'
  | 'browser'
  | 'queue'
  | 'cloud';

export interface CanvasEngineCallbacks {
  onSelectionChange?: (selectedIds: string[]) => void;
  onElementsChange?: (elements: CanvasElement[]) => void;
  onViewportChange?: (viewport: ViewportTransform) => void;
}

export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer: CanvasRenderer;

  private elements: CanvasElement[] = [];
  private selectedIds: Set<string> = new Set();

  private activeTool: Tool = 'select';
  private viewport: ViewportTransform = { panX: 0, panY: 0, zoom: 1.0 };

  // Pointer & Interaction state
  private isPointerDown = false;
  private isPanning = false;
  private isDraggingElement = false;
  private isCreatingElement = false;
  private isSpacePressed = false;

  private hoveredAnchor: { elementId: string; anchor: AnchorPosition; point: WorldPoint } | null = null;

  private lastScreenPoint: ScreenPoint = { x: 0, y: 0 };
  private startWorldPoint: WorldPoint = { x: 0, y: 0 };
  private activeElement: CanvasElement | null = null;

  private callbacks: CanvasEngineCallbacks;
  private animationFrameId: number | null = null;
  private isDirty = true;
  private theme: 'light' | 'dark' = 'light';

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: CanvasEngineCallbacks = {}
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context not available');
    this.ctx = context;
    this.renderer = new CanvasRenderer(context);
    this.callbacks = callbacks;

    this.setupEventListeners();
    this.startRenderLoop();
  }

  public setTheme(theme: 'light' | 'dark') {
    this.theme = theme;
    this.isDirty = true;
  }

  public setTool(tool: Tool) {
    this.activeTool = tool;
  }

  public getTool(): Tool {
    return this.activeTool;
  }

  public setViewport(viewport: ViewportTransform) {
    this.viewport = viewport;
    this.isDirty = true;
    this.callbacks.onViewportChange?.(this.viewport);
  }

  public getViewport(): ViewportTransform {
    return this.viewport;
  }

  public setElements(elements: CanvasElement[]) {
    this.elements = elements;
    this.isDirty = true;
  }

  public getElements(): CanvasElement[] {
    return this.elements;
  }

  public getSelectedElements(): CanvasElement[] {
    return this.elements.filter((el) => this.selectedIds.has(el.id));
  }

  /**
   * Clean Detachment: When elements are deleted, arrows connected to them are detached
   * and frozen at their world anchor point rather than deleted.
   */
  public deleteSelected() {
    if (this.selectedIds.size === 0) return;

    const deletedIds = this.selectedIds;
    const deletedMap = new Map<string, CanvasElement>();
    for (const el of this.elements) {
      if (deletedIds.has(el.id)) {
        deletedMap.set(el.id, el);
      }
    }

    // Update arrows that had bindings to deleted elements
    for (const el of this.elements) {
      if (el.type === 'arrow') {
        const arrow = el as any;
        if (arrow.startBinding && deletedMap.has(arrow.startBinding.elementId)) {
          const shape = deletedMap.get(arrow.startBinding.elementId)!;
          const pos = computeAnchorWorldPosition(shape, arrow.startBinding.anchor);
          arrow.points[0] = { x: pos.x, y: pos.y };
          arrow.startBinding = undefined;
        }
        if (arrow.endBinding && deletedMap.has(arrow.endBinding.elementId)) {
          const shape = deletedMap.get(arrow.endBinding.elementId)!;
          const pos = computeAnchorWorldPosition(shape, arrow.endBinding.anchor);
          arrow.points[arrow.points.length - 1] = { x: pos.x, y: pos.y };
          arrow.endBinding = undefined;
        }
      }
    }

    this.elements = this.elements.filter((el) => !deletedIds.has(el.id));
    this.selectedIds.clear();
    this.isDirty = true;
    this.callbacks.onSelectionChange?.([]);
    this.callbacks.onElementsChange?.(this.elements);
  }

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.removeEventListeners();
  }

  private startRenderLoop() {
    const loop = () => {
      if (this.isDirty) {
        this.render();
        this.isDirty = false;
      }
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private render() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    const dpr = window.devicePixelRatio || 1;
    if (
      this.canvas.width !== width * dpr ||
      this.canvas.height !== height * dpr
    ) {
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
      this.ctx.scale(dpr, dpr);
    }

    // 1. Background Grid
    this.renderer.clearAndRenderGrid(this.viewport, width, height, this.theme);

    // 2. Elements
    this.renderer.applyViewport(this.viewport);
    for (const el of this.elements) {
      this.renderer.renderElement(el);
    }

    // 3. Magnetic Anchors on hovered target
    if (this.hoveredAnchor) {
      const targetEl = this.elements.find((el) => el.id === this.hoveredAnchor?.elementId);
      if (targetEl) {
        this.renderer.renderMagneticAnchors(targetEl, this.hoveredAnchor.anchor);
      }
    }

    // 4. Bounding Box for Selection
    for (const el of this.elements) {
      if (this.selectedIds.has(el.id)) {
        this.renderer.renderSelectionBox(el, this.viewport);
      }
    }
  }

  private setupEventListeners() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('auxclick', this.onAuxClick);
  }

  private removeEventListeners() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('auxclick', this.onAuxClick);
  }

  private onAuxClick = (e: MouseEvent) => {
    if (e.button === 1) e.preventDefault();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const screenPoint: ScreenPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const normalizedDelta = normalizeWheelDelta(e);
    const zoomFactor = Math.pow(0.999, normalizedDelta);
    const targetZoom = this.viewport.zoom * zoomFactor;

    this.viewport = zoomAtPoint(screenPoint, this.viewport, targetZoom);
    this.isDirty = true;
    this.callbacks.onViewportChange?.(this.viewport);
  };

  private onPointerDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    this.isPointerDown = true;

    const rect = this.canvas.getBoundingClientRect();
    const screenPoint: ScreenPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    this.lastScreenPoint = screenPoint;
    this.startWorldPoint = screenToWorld(screenPoint, this.viewport);

    // Pan with middle click, hand tool or space
    if (e.button === 1 || this.activeTool === 'hand' || this.isSpacePressed) {
      this.isPanning = true;
      return;
    }

    if (e.button !== 0) return;

    if (this.activeTool === 'select') {
      let hit: CanvasElement | null = null;
      for (let i = this.elements.length - 1; i >= 0; i--) {
        if (hitTestElement(this.startWorldPoint, this.elements[i])) {
          hit = this.elements[i];
          break;
        }
      }

      if (hit) {
        if (!e.shiftKey) {
          this.selectedIds.clear();
        }
        this.selectedIds.add(hit.id);
        this.isDraggingElement = true;
      } else {
        if (!e.shiftKey) {
          this.selectedIds.clear();
        }
      }

      this.isDirty = true;
      this.callbacks.onSelectionChange?.(Array.from(this.selectedIds));
      return;
    }

    // Creating arrow connector
    if (this.activeTool === 'arrow') {
      this.isCreatingElement = true;
      const strokeColor = this.theme === 'dark' ? '#93c5fd' : '#2563eb';

      // Check if starting snapped to an anchor
      const startAnchor = findClosestAnchor(this.startWorldPoint, this.elements);
      const startPt = startAnchor ? startAnchor.point : this.startWorldPoint;

      this.activeElement = {
        id: `arrow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'arrow',
        x: startPt.x,
        y: startPt.y,
        width: 0,
        height: 0,
        rotation: 0,
        zIndex: this.elements.length + 1,
        groupIds: [],
        locked: false,
        style: {
          strokeColor,
          fillColor: 'transparent',
          strokeWidth: 2,
          strokeStyle: 'solid',
          opacity: 100,
          effect: { type: 'none', intensity: 0 },
        },
        version: 1,
        points: [{ x: startPt.x, y: startPt.y }, { x: startPt.x, y: startPt.y }],
        startBinding: startAnchor
          ? { elementId: startAnchor.elementId, anchor: startAnchor.anchor }
          : undefined,
        routing: 'straight',
      } as any;

      this.elements.push(this.activeElement!);
      this.selectedIds.clear();
      this.selectedIds.add(this.activeElement!.id);
      this.isDirty = true;
      return;
    }

    // Creating native IT Component
    if (
      this.activeTool === 'database' ||
      this.activeTool === 'server' ||
      this.activeTool === 'browser' ||
      this.activeTool === 'queue' ||
      this.activeTool === 'cloud'
    ) {
      const compDef = IT_COMPONENTS[this.activeTool];
      const strokeColor = this.theme === 'dark' ? '#e2e8f0' : '#1e293b';

      const newComp: CanvasElement = {
        id: `comp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'component',
        componentKey: this.activeTool,
        label: compDef.name,
        x: this.startWorldPoint.x - compDef.defaultWidth / 2,
        y: this.startWorldPoint.y - compDef.defaultHeight / 2,
        width: compDef.defaultWidth,
        height: compDef.defaultHeight,
        rotation: 0,
        zIndex: this.elements.length + 1,
        groupIds: [],
        locked: false,
        style: {
          strokeColor,
          fillColor: this.theme === 'dark' ? '#0f172a' : '#ffffff',
          strokeWidth: 2,
          strokeStyle: 'solid',
          opacity: 100,
          effect: { type: 'none', intensity: 0 },
        },
        version: 1,
      } as any;

      this.elements.push(newComp);
      this.selectedIds.clear();
      this.selectedIds.add(newComp.id);
      this.activeTool = 'select';
      this.isDirty = true;
      this.callbacks.onElementsChange?.(this.elements);
      this.callbacks.onSelectionChange?.(Array.from(this.selectedIds));
      return;
    }

    // Creating standard geometric shape
    if (
      this.activeTool === 'rectangle' ||
      this.activeTool === 'ellipse' ||
      this.activeTool === 'diamond' ||
      this.activeTool === 'triangle' ||
      this.activeTool === 'line'
    ) {
      this.isCreatingElement = true;
      const strokeColor = this.theme === 'dark' ? '#f3f4f6' : '#1f2937';

      this.activeElement = {
        id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: this.activeTool,
        x: this.startWorldPoint.x,
        y: this.startWorldPoint.y,
        width: 1,
        height: 1,
        rotation: 0,
        zIndex: this.elements.length + 1,
        groupIds: [],
        locked: false,
        style: {
          strokeColor,
          fillColor: 'transparent',
          strokeWidth: 2,
          strokeStyle: 'solid',
          opacity: 100,
          effect: { type: 'none', intensity: 0 },
        },
        version: 1,
      };

      this.elements.push(this.activeElement);
      this.selectedIds.clear();
      this.selectedIds.add(this.activeElement.id);
      this.isDirty = true;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const screenPoint: ScreenPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const deltaScreenX = screenPoint.x - this.lastScreenPoint.x;
    const deltaScreenY = screenPoint.y - this.lastScreenPoint.y;
    this.lastScreenPoint = screenPoint;

    const currentWorld = screenToWorld(screenPoint, this.viewport);

    // Update magnetic anchor highlight while creating arrows
    if (this.activeTool === 'arrow') {
      const snap = findClosestAnchor(currentWorld, this.elements, this.activeElement?.id);
      if (snap) {
        this.hoveredAnchor = snap;
      } else {
        this.hoveredAnchor = null;
      }
      this.isDirty = true;
    }

    if (!this.isPointerDown) return;

    if (this.isPanning) {
      this.viewport.panX += deltaScreenX;
      this.viewport.panY += deltaScreenY;
      this.isDirty = true;
      this.callbacks.onViewportChange?.(this.viewport);
      return;
    }

    // Creating arrow
    if (this.isCreatingElement && this.activeElement && this.activeElement.type === 'arrow') {
      const arrow = this.activeElement as any;
      let targetPt = currentWorld;

      if (this.hoveredAnchor) {
        targetPt = this.hoveredAnchor.point;
        arrow.endBinding = {
          elementId: this.hoveredAnchor.elementId,
          anchor: this.hoveredAnchor.anchor,
        };
      } else {
        arrow.endBinding = undefined;
      }

      arrow.points[arrow.points.length - 1] = { x: targetPt.x, y: targetPt.y };
      this.isDirty = true;
      return;
    }

    // Creating geometric shape
    if (this.isCreatingElement && this.activeElement) {
      this.activeElement.width = currentWorld.x - this.startWorldPoint.x;
      this.activeElement.height = currentWorld.y - this.startWorldPoint.y;
      this.isDirty = true;
      return;
    }

    // Dragging selected elements & dynamically recalculating arrow bindings
    if (this.isDraggingElement) {
      const deltaWorldX = deltaScreenX / this.viewport.zoom;
      const deltaWorldY = deltaScreenY / this.viewport.zoom;

      for (const el of this.elements) {
        if (this.selectedIds.has(el.id)) {
          el.x += deltaWorldX;
          el.y += deltaWorldY;
        }
      }

      // Re-anchor any attached arrows
      this.recalculateArrowBindings();

      this.isDirty = true;
      return;
    }
  };

  /**
   * Recalculates end/start positions of arrows connected to moved elements.
   */
  private recalculateArrowBindings() {
    const elementMap = new Map<string, CanvasElement>();
    for (const el of this.elements) {
      elementMap.set(el.id, el);
    }

    for (const el of this.elements) {
      if (el.type === 'arrow') {
        const arrow = el as any;
        if (arrow.startBinding && elementMap.has(arrow.startBinding.elementId)) {
          const shape = elementMap.get(arrow.startBinding.elementId)!;
          const pos = computeAnchorWorldPosition(shape, arrow.startBinding.anchor);
          arrow.points[0] = { x: pos.x, y: pos.y };
        }
        if (arrow.endBinding && elementMap.has(arrow.endBinding.elementId)) {
          const shape = elementMap.get(arrow.endBinding.elementId)!;
          const pos = computeAnchorWorldPosition(shape, arrow.endBinding.anchor);
          arrow.points[arrow.points.length - 1] = { x: pos.x, y: pos.y };
        }
      }
    }
  }

  private onPointerUp = (e: PointerEvent) => {
    if (!this.isPointerDown) return;

    try {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignored
    }

    this.isPointerDown = false;
    this.isPanning = false;
    this.hoveredAnchor = null;

    if (this.isCreatingElement) {
      this.isCreatingElement = false;

      if (this.activeElement) {
        if (this.activeElement.type !== 'arrow') {
          if (this.activeElement.width < 0) {
            this.activeElement.x += this.activeElement.width;
            this.activeElement.width = Math.abs(this.activeElement.width);
          }
          if (this.activeElement.height < 0) {
            this.activeElement.y += this.activeElement.height;
            this.activeElement.height = Math.abs(this.activeElement.height);
          }

          if (this.activeElement.width < 5 && this.activeElement.height < 5) {
            this.activeElement.width = 100;
            this.activeElement.height = 60;
          }
        }

        this.callbacks.onElementsChange?.(this.elements);
        this.activeElement = null;
      }

      this.activeTool = 'select';
    }

    if (this.isDraggingElement) {
      this.isDraggingElement = false;
      this.callbacks.onElementsChange?.(this.elements);
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (e.code === 'Space' && !this.isSpacePressed) {
      this.isSpacePressed = true;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelected();
    }

    if (e.key === 'v' || e.key === 'V') this.activeTool = 'select';
    if (e.key === 'h' || e.key === 'H') this.activeTool = 'hand';
    if (e.key === 'r' || e.key === 'R') this.activeTool = 'rectangle';
    if (e.key === 'o' || e.key === 'O') this.activeTool = 'ellipse';
    if (e.key === 'd' || e.key === 'D') this.activeTool = 'diamond';
    if (e.key === 'a' || e.key === 'A') this.activeTool = 'arrow';
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      this.isSpacePressed = false;
    }
  };
}
