import { CanvasElement, ElementStyle } from './types';
import {
  ViewportTransform,
  ScreenPoint,
  WorldPoint,
  screenToWorld,
  zoomAtPoint,
  normalizeWheelDelta,
} from './coordinates';
import {
  hitTestElement,
  hitTestSelectionHandle,
  elementIntersectsMarquee,
  ResizeHandle,
} from './hitTest';
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
  | 'sticky'
  | 'freehand'
  | 'eraser'
  | keyof typeof IT_COMPONENTS;

export interface CanvasEngineCallbacks {
  onSelectionChange?: (selectedIds: string[], selectedElements: CanvasElement[]) => void;
  onElementsChange?: (elements: CanvasElement[]) => void;
  onViewportChange?: (viewport: ViewportTransform) => void;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  onEditElementText?: (element: CanvasElement) => void;
}

const MAX_HISTORY = 50;

function cloneElements(elements: CanvasElement[]): CanvasElement[] {
  return JSON.parse(JSON.stringify(elements));
}

export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer: CanvasRenderer;

  private elements: CanvasElement[] = [];
  private selectedIds: Set<string> = new Set();
  private clipboard: CanvasElement[] = [];

  // 50-level Undo/Redo Snapshot Stack (RF-E08)
  private undoStack: CanvasElement[][] = [];
  private redoStack: CanvasElement[][] = [];

  private activeTool: Tool = 'select';
  private viewport: ViewportTransform = { panX: 0, panY: 0, zoom: 1.0 };

  // Pointer & Interaction state
  private isPointerDown = false;
  private isPanning = false;
  private isDraggingElement = false;
  private isCreatingElement = false;
  private isResizingElement = false;
  private isMarqueeSelecting = false;
  private marqueeBox: { startX: number; startY: number; currentX: number; currentY: number } | null = null;
  private activeResizeHandle: ResizeHandle | null = null;
  private resizeInitialElement: CanvasElement | null = null;
  private isSpacePressed = false;

  private hoveredAnchor: { elementId: string; anchor: AnchorPosition; point: WorldPoint } | null =
    null;
  private alignmentGuides: Array<{ orientation: 'horizontal' | 'vertical'; pos: number }> = [];

  private lastScreenPoint: ScreenPoint = { x: 0, y: 0 };
  private startWorldPoint: WorldPoint = { x: 0, y: 0 };
  private activeElement: CanvasElement | null = null;

  private callbacks: CanvasEngineCallbacks;
  private animationFrameId: number | null = null;
  private isDirty = true;
  private theme: 'light' | 'dark' = 'light';

  constructor(canvas: HTMLCanvasElement, callbacks: CanvasEngineCallbacks = {}) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context not available');
    this.ctx = context;
    this.renderer = new CanvasRenderer(context);
    this.callbacks = callbacks;

    this.setupEventListeners();
    this.startRenderLoop();
  }

  private pushHistorySnapshot() {
    this.undoStack.push(cloneElements(this.elements));
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.callbacks.onHistoryChange?.(this.canUndo(), this.canRedo());
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo() {
    if (this.undoStack.length === 0) return;
    const prev = this.undoStack.pop()!;
    this.redoStack.push(cloneElements(this.elements));
    this.elements = prev;
    this.selectedIds.clear();
    this.isDirty = true;
    this.notifySelectionChange();
    this.callbacks.onElementsChange?.(this.elements);
    this.callbacks.onHistoryChange?.(this.canUndo(), this.canRedo());
  }

  public redo() {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop()!;
    this.undoStack.push(cloneElements(this.elements));
    this.elements = next;
    this.selectedIds.clear();
    this.isDirty = true;
    this.notifySelectionChange();
    this.callbacks.onElementsChange?.(this.elements);
    this.callbacks.onHistoryChange?.(this.canUndo(), this.canRedo());
  }

  private notifySelectionChange() {
    this.callbacks.onSelectionChange?.(
      Array.from(this.selectedIds),
      this.getSelectedElements()
    );
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

  public setElements(elements: CanvasElement[], resetHistory = true) {
    this.elements = elements;
    if (resetHistory) {
      this.undoStack = [];
      this.redoStack = [];
      this.callbacks.onHistoryChange?.(false, false);
    }
    this.isDirty = true;
  }

  public getElements(): CanvasElement[] {
    return this.elements;
  }

  public getSelectedElements(): CanvasElement[] {
    return this.elements.filter((el) => this.selectedIds.has(el.id));
  }

  /**
   * Updates style properties of all selected elements.
   */
  public updateSelectedStyle(partialStyle: Partial<ElementStyle>) {
    if (this.selectedIds.size === 0) return;
    this.pushHistorySnapshot();
    for (const el of this.elements) {
      if (this.selectedIds.has(el.id)) {
        el.style = {
          ...el.style,
          ...partialStyle,
          effect: partialStyle.effect ? { ...el.style.effect, ...partialStyle.effect } : el.style.effect,
        };
      }
    }
    this.isDirty = true;
    this.notifySelectionChange();
    this.callbacks.onElementsChange?.(this.elements);
  }

  /**
   * Updates arrow routing mode ('straight' | 'orthogonal' | 'curved') on selected arrows.
   */
  public updateSelectedRouting(routing: 'straight' | 'orthogonal' | 'curved') {
    if (this.selectedIds.size === 0) return;
    this.pushHistorySnapshot();
    for (const el of this.elements) {
      if (this.selectedIds.has(el.id) && el.type === 'arrow') {
        (el as any).routing = routing;
      }
    }
    this.isDirty = true;
    this.notifySelectionChange();
    this.callbacks.onElementsChange?.(this.elements);
  }

  /**
   * Updates the text/label of a specific element (RF-E04).
   */
  public updateElementText(elementId: string, newText: string) {
    const target = this.elements.find((el) => el.id === elementId);
    if (!target) return;
    this.pushHistorySnapshot();
    if (target.type === 'text') {
      (target as any).text = newText;
      target.label = newText;
      const lines = newText.split('\n');
      const maxLen = Math.max(...lines.map((l) => l.length), 4);
      target.width = Math.max(80, maxLen * 9.5);
      target.height = Math.max(28, lines.length * 22);
    } else {
      target.label = newText;
    }
    this.isDirty = true;
    this.notifySelectionChange();
    this.callbacks.onElementsChange?.(this.elements);
  }

  /**
   * RF-E13: Toggle lock on selected elements
   */
  public toggleLockSelected() {
    if (this.selectedIds.size === 0) return;
    this.pushHistorySnapshot();
    const selected = this.getSelectedElements();
    const allLocked = selected.every((el) => el.locked);
    for (const el of this.elements) {
      if (this.selectedIds.has(el.id)) {
        el.locked = !allLocked;
      }
    }
    this.isDirty = true;
    this.notifySelectionChange();
    this.callbacks.onElementsChange?.(this.elements);
  }

  /**
   * RF-E10: Copy selected elements to internal clipboard
   */
  public copySelected() {
    const selected = this.getSelectedElements();
    if (selected.length === 0) return;
    this.clipboard = cloneElements(selected);
  }

  /**
   * RF-E10: Paste elements from internal clipboard with +20px offset
   */
  public pasteClipboard() {
    if (this.clipboard.length === 0) return;
    this.pushHistorySnapshot();
    const newIds: string[] = [];
    for (const item of this.clipboard) {
      const copy: CanvasElement = JSON.parse(JSON.stringify(item));
      copy.id = `${copy.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      copy.x += 20;
      copy.y += 20;
      if (copy.type === 'arrow' && Array.isArray((copy as any).points)) {
        (copy as any).points = (copy as any).points.map((pt: { x: number; y: number }) => ({
          x: pt.x + 20,
          y: pt.y + 20,
        }));
        (copy as any).startBinding = undefined;
        (copy as any).endBinding = undefined;
      }
      this.elements.push(copy);
      newIds.push(copy.id);
    }
    // Offset clipboard for subsequent pastes
    for (const item of this.clipboard) {
      item.x += 20;
      item.y += 20;
    }
    this.selectedIds = new Set(newIds);
    this.isDirty = true;
    this.notifySelectionChange();
    this.callbacks.onElementsChange?.(this.elements);
  }

  /**
   * Clean Detachment: When elements are deleted, arrows connected to them are detached
   * and frozen at their world anchor point rather than deleted.
   */
  public deleteSelected() {
    if (this.selectedIds.size === 0) return;

    this.pushHistorySnapshot();

    const deletedIds = this.selectedIds;
    const deletedMap = new Map<string, CanvasElement>();
    for (const el of this.elements) {
      if (deletedIds.has(el.id) && !el.locked) {
        deletedMap.set(el.id, el);
      }
    }

    if (deletedMap.size === 0) return;

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

    this.elements = this.elements.filter((el) => !deletedMap.has(el.id));
    this.selectedIds.clear();
    this.isDirty = true;
    this.notifySelectionChange();
    this.callbacks.onElementsChange?.(this.elements);
  }

  /**
   * RF-E11: Logical grouping of selected elements
   */
  public groupSelected() {
    if (this.selectedIds.size < 2) return;
    this.pushHistorySnapshot();
    const newGroupId = `grp_${Math.random().toString(36).substring(2, 9)}`;
    for (const el of this.elements) {
      if (this.selectedIds.has(el.id)) {
        if (!el.groupIds) el.groupIds = [];
        el.groupIds.push(newGroupId);
      }
    }
    this.isDirty = true;
    this.notifySelectionChange();
    this.callbacks.onElementsChange?.(this.elements);
  }

  /**
   * RF-E11: Ungroup selected elements
   */
  public ungroupSelected() {
    if (this.selectedIds.size === 0) return;
    this.pushHistorySnapshot();
    for (const el of this.elements) {
      if (this.selectedIds.has(el.id) && el.groupIds && el.groupIds.length > 0) {
        el.groupIds.pop();
      }
    }
    this.isDirty = true;
    this.notifySelectionChange();
    this.callbacks.onElementsChange?.(this.elements);
  }

  /**
   * RF-E12: Bring selected elements to top of z-order
   */
  public bringToFront() {
    if (this.selectedIds.size === 0) return;
    this.pushHistorySnapshot();
    const selected: CanvasElement[] = [];
    const unselected: CanvasElement[] = [];
    for (const el of this.elements) {
      if (this.selectedIds.has(el.id)) {
        selected.push(el);
      } else {
        unselected.push(el);
      }
    }
    this.elements = [...unselected, ...selected];
    this.isDirty = true;
    this.callbacks.onElementsChange?.(this.elements);
  }

  /**
   * RF-E12: Send selected elements to bottom of z-order
   */
  public sendToBack() {
    if (this.selectedIds.size === 0) return;
    this.pushHistorySnapshot();
    const selected: CanvasElement[] = [];
    const unselected: CanvasElement[] = [];
    for (const el of this.elements) {
      if (this.selectedIds.has(el.id)) {
        selected.push(el);
      } else {
        unselected.push(el);
      }
    }
    this.elements = [...selected, ...unselected];
    this.isDirty = true;
    this.callbacks.onElementsChange?.(this.elements);
  }

  public bringForward() {
    if (this.selectedIds.size === 0) return;
    this.pushHistorySnapshot();
    for (let i = this.elements.length - 2; i >= 0; i--) {
      if (
        this.selectedIds.has(this.elements[i].id) &&
        !this.selectedIds.has(this.elements[i + 1].id)
      ) {
        const temp = this.elements[i];
        this.elements[i] = this.elements[i + 1];
        this.elements[i + 1] = temp;
      }
    }
    this.isDirty = true;
    this.callbacks.onElementsChange?.(this.elements);
  }

  public sendBackward() {
    if (this.selectedIds.size === 0) return;
    this.pushHistorySnapshot();
    for (let i = 1; i < this.elements.length; i++) {
      if (
        this.selectedIds.has(this.elements[i].id) &&
        !this.selectedIds.has(this.elements[i - 1].id)
      ) {
        const temp = this.elements[i];
        this.elements[i] = this.elements[i - 1];
        this.elements[i - 1] = temp;
      }
    }
    this.isDirty = true;
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

    // 5. Dynamic Smart Alignment Guides
    this.renderer.renderAlignmentGuides(
      this.alignmentGuides,
      this.viewport,
      width,
      height
    );

    // 6. Area Selection Marquee Rectangle
    if (this.isMarqueeSelecting && this.marqueeBox) {
      this.renderer.renderMarquee(this.marqueeBox, this.viewport);
    }
  }

  private setupEventListeners() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('dblclick', this.onDoubleClick);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('auxclick', this.onAuxClick);
  }

  private removeEventListeners() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('auxclick', this.onAuxClick);
  }

  private onAuxClick = (e: MouseEvent) => {
    if (e.button === 1) e.preventDefault();
  };

  private onDoubleClick = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const screenPoint: ScreenPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    const worldPoint = screenToWorld(screenPoint, this.viewport);

    for (let i = this.elements.length - 1; i >= 0; i--) {
      if (hitTestElement(worldPoint, this.elements[i])) {
        const hit = this.elements[i];
        if (!hit.locked) {
          this.callbacks.onEditElementText?.(hit);
        }
        return;
      }
    }
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

    // Eraser tool: click to delete hit element
    if (this.activeTool === 'eraser') {
      for (let i = this.elements.length - 1; i >= 0; i--) {
        if (hitTestElement(this.startWorldPoint, this.elements[i])) {
          const hit = this.elements[i];
          if (!hit.locked) {
            this.selectedIds.clear();
            this.selectedIds.add(hit.id);
            this.deleteSelected();
          }
          break;
        }
      }
      return;
    }

    if (this.activeTool === 'select') {
      // 1. Check if user clicked on a resize/rotate handle of a single selected element
      if (this.selectedIds.size === 1) {
        const selectedEl = this.getSelectedElements()[0];
        if (selectedEl && !selectedEl.locked) {
          const handle = hitTestSelectionHandle(screenPoint, selectedEl, this.viewport);
          if (handle) {
            this.pushHistorySnapshot();
            this.isResizingElement = true;
            this.activeResizeHandle = handle;
            this.resizeInitialElement = JSON.parse(JSON.stringify(selectedEl));
            return;
          }
        }
      }

      // 2. Hit test elements from top to bottom
      let hit: CanvasElement | null = null;
      for (let i = this.elements.length - 1; i >= 0; i--) {
        if (hitTestElement(this.startWorldPoint, this.elements[i])) {
          hit = this.elements[i];
          break;
        }
      }

      if (hit) {
        if (!e.shiftKey && !this.selectedIds.has(hit.id)) {
          this.selectedIds.clear();
        }
        this.selectedIds.add(hit.id);

        // If element belongs to a logical group, also select group members (RF-E11)
        if (hit.groupIds && hit.groupIds.length > 0) {
          const topGroupId = hit.groupIds[hit.groupIds.length - 1];
          for (const el of this.elements) {
            if (el.groupIds && el.groupIds.includes(topGroupId)) {
              this.selectedIds.add(el.id);
            }
          }
        }

        if (!hit.locked) {
          this.pushHistorySnapshot();
          this.isDraggingElement = true;
        }
      } else {
        if (!e.shiftKey) {
          this.selectedIds.clear();
        }
        // Start marquee area selection on empty canvas
        this.isMarqueeSelecting = true;
        this.marqueeBox = {
          startX: this.startWorldPoint.x,
          startY: this.startWorldPoint.y,
          currentX: this.startWorldPoint.x,
          currentY: this.startWorldPoint.y,
        };
      }

      this.isDirty = true;
      this.notifySelectionChange();
      return;
    }

    // Creating Text node (RF-E04)
    if (this.activeTool === 'text') {
      this.pushHistorySnapshot();
      const strokeColor = this.theme === 'dark' ? '#f3f4f6' : '#1f2937';
      const newTextEl: CanvasElement = {
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'text',
        text: 'Text label',
        label: 'Text label',
        fontFamily: 'sans',
        fontSize: 16,
        textAlign: 'left',
        x: this.startWorldPoint.x,
        y: this.startWorldPoint.y,
        width: 110,
        height: 28,
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
      this.elements.push(newTextEl);
      this.selectedIds.clear();
      this.selectedIds.add(newTextEl.id);
      this.activeTool = 'select';
      this.isDirty = true;
      this.notifySelectionChange();
      this.callbacks.onElementsChange?.(this.elements);
      this.callbacks.onEditElementText?.(newTextEl);
      return;
    }

    // Creating Sticky Note (RF-E04)
    if (this.activeTool === 'sticky') {
      this.pushHistorySnapshot();
      const newSticky: CanvasElement = {
        id: `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'sticky',
        label: 'Sticky note',
        x: this.startWorldPoint.x - 75,
        y: this.startWorldPoint.y - 65,
        width: 150,
        height: 130,
        rotation: 0,
        zIndex: this.elements.length + 1,
        groupIds: [],
        locked: false,
        style: {
          strokeColor: '#ca8a04',
          fillColor: '#fef08a',
          strokeWidth: 1.5,
          strokeStyle: 'solid',
          opacity: 100,
          effect: { type: 'shadow', intensity: 10 },
        },
        version: 1,
      };
      this.elements.push(newSticky);
      this.selectedIds.clear();
      this.selectedIds.add(newSticky.id);
      this.activeTool = 'select';
      this.isDirty = true;
      this.notifySelectionChange();
      this.callbacks.onElementsChange?.(this.elements);
      return;
    }

    // Creating Freehand Stroke (RF-E05)
    if (this.activeTool === 'freehand') {
      this.pushHistorySnapshot();
      this.isCreatingElement = true;
      const strokeColor = this.theme === 'dark' ? '#f3f4f6' : '#1f2937';
      this.activeElement = {
        id: `free-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'freehand',
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
          strokeWidth: 3,
          strokeStyle: 'solid',
          opacity: 100,
          effect: { type: 'none', intensity: 0 },
        },
        version: 1,
        points: [[0, 0, e.pressure || 0.5]],
      };
      this.elements.push(this.activeElement);
      this.selectedIds.clear();
      this.selectedIds.add(this.activeElement.id);
      this.isDirty = true;
      return;
    }

    // Creating arrow connector
    if (this.activeTool === 'arrow') {
      this.pushHistorySnapshot();
      this.isCreatingElement = true;
      const strokeColor = this.theme === 'dark' ? '#93c5fd' : '#2563eb';

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
        points: [
          { x: startPt.x, y: startPt.y },
          { x: startPt.x, y: startPt.y },
        ],
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

    // Creating native IT Component (all 20 P0 IT components supported)
    if (this.activeTool in IT_COMPONENTS) {
      this.pushHistorySnapshot();
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
      this.notifySelectionChange();
      this.callbacks.onElementsChange?.(this.elements);
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
      this.pushHistorySnapshot();
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
      this.hoveredAnchor = snap || null;
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

    // Marquee area selection
    if (this.isMarqueeSelecting && this.marqueeBox) {
      this.marqueeBox.currentX = currentWorld.x;
      this.marqueeBox.currentY = currentWorld.y;

      const minX = Math.min(this.marqueeBox.startX, this.marqueeBox.currentX);
      const maxX = Math.max(this.marqueeBox.startX, this.marqueeBox.currentX);
      const minY = Math.min(this.marqueeBox.startY, this.marqueeBox.currentY);
      const maxY = Math.max(this.marqueeBox.startY, this.marqueeBox.currentY);

      if (!e.shiftKey) {
        this.selectedIds.clear();
      }

      for (const el of this.elements) {
        if (elementIntersectsMarquee(el, { minX, minY, maxX, maxY })) {
          this.selectedIds.add(el.id);
        }
      }

      this.isDirty = true;
      this.notifySelectionChange();
      return;
    }

    // Interactive 8-handle Resize & Rotation (RF-E09)
    if (this.isResizingElement && this.resizeInitialElement && this.activeResizeHandle) {
      const el = this.elements.find((item) => item.id === this.resizeInitialElement!.id);
      if (!el) return;

      const init = this.resizeInitialElement;
      const dx = currentWorld.x - this.startWorldPoint.x;
      const dy = currentWorld.y - this.startWorldPoint.y;

      if (this.activeResizeHandle === 'rotate') {
        const cx = init.x + init.width / 2;
        const cy = init.y + init.height / 2;
        el.rotation = Math.atan2(currentWorld.y - cy, currentWorld.x - cx) + Math.PI / 2;
      } else {
        const h = this.activeResizeHandle;
        if (h.includes('e')) {
          el.width = Math.max(16, init.width + dx);
        }
        if (h.includes('s')) {
          el.height = Math.max(16, init.height + dy);
        }
        if (h.includes('w')) {
          const newW = Math.max(16, init.width - dx);
          el.x = init.x + (init.width - newW);
          el.width = newW;
        }
        if (h.includes('n')) {
          const newH = Math.max(16, init.height - dy);
          el.y = init.y + (init.height - newH);
          el.height = newH;
        }
      }

      this.recalculateArrowBindings();
      this.isDirty = true;
      return;
    }

    // Creating freehand stroke
    if (this.isCreatingElement && this.activeElement && this.activeElement.type === 'freehand') {
      const fh = this.activeElement as any;
      const relX = currentWorld.x - fh.x;
      const relY = currentWorld.y - fh.y;
      fh.points.push([relX, relY, e.pressure || 0.5]);
      fh.width = Math.max(fh.width, Math.abs(relX));
      fh.height = Math.max(fh.height, Math.abs(relY));
      this.isDirty = true;
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
        if (this.selectedIds.has(el.id) && !el.locked) {
          el.x += deltaWorldX;
          el.y += deltaWorldY;
        }
      }

      // Smart alignment snapping (RF-C05, RF-E02)
      this.alignmentGuides = [];
      const SNAP_THRESHOLD = 6 / this.viewport.zoom;
      const draggedEl = this.elements.find(
        (el) => this.selectedIds.has(el.id) && el.type !== 'arrow' && !el.locked
      );

      if (draggedEl) {
        const draggedCenterX = draggedEl.x + draggedEl.width / 2;
        const draggedCenterY = draggedEl.y + draggedEl.height / 2;

        for (const other of this.elements) {
          if (this.selectedIds.has(other.id) || other.type === 'arrow') continue;
          const otherCenterX = other.x + other.width / 2;
          const otherCenterY = other.y + other.height / 2;

          if (Math.abs(draggedCenterY - otherCenterY) < SNAP_THRESHOLD) {
            const snapDeltaY = otherCenterY - draggedCenterY;
            for (const el of this.elements) {
              if (this.selectedIds.has(el.id) && !el.locked) el.y += snapDeltaY;
            }
            this.alignmentGuides.push({ orientation: 'horizontal', pos: otherCenterY });
          }

          if (Math.abs(draggedCenterX - otherCenterX) < SNAP_THRESHOLD) {
            const snapDeltaX = otherCenterX - draggedCenterX;
            for (const el of this.elements) {
              if (this.selectedIds.has(el.id) && !el.locked) el.x += snapDeltaX;
            }
            this.alignmentGuides.push({ orientation: 'vertical', pos: otherCenterX });
          }
        }
      }

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
    this.alignmentGuides = [];

    if (this.isMarqueeSelecting) {
      this.isMarqueeSelecting = false;
      this.marqueeBox = null;
      this.isDirty = true;
      this.notifySelectionChange();
    }

    if (this.isResizingElement) {
      this.isResizingElement = false;
      this.activeResizeHandle = null;
      this.resizeInitialElement = null;
      this.notifySelectionChange();
      this.callbacks.onElementsChange?.(this.elements);
      return;
    }

    if (this.isCreatingElement) {
      this.isCreatingElement = false;

      if (this.activeElement) {
        if (
          this.activeElement.type !== 'arrow' &&
          this.activeElement.type !== 'freehand'
        ) {
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

        this.notifySelectionChange();
        this.callbacks.onElementsChange?.(this.elements);
        this.activeElement = null;
      }

      this.activeTool = 'select';
    }

    if (this.isDraggingElement) {
      this.isDraggingElement = false;
      this.notifySelectionChange();
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

    // Undo / Redo / Copy / Paste / Grouping / Layer ordering shortcuts
    if (e.ctrlKey || e.metaKey) {
      if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        this.undo();
        return;
      }
      if (e.key === 'y' || e.key === 'Y' || ((e.key === 'z' || e.key === 'Z') && e.shiftKey)) {
        e.preventDefault();
        this.redo();
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        this.copySelected();
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        this.pasteClipboard();
        return;
      }
      if (e.key === 'g' && !e.shiftKey) {
        e.preventDefault();
        this.groupSelected();
        return;
      }
      if ((e.key === 'g' || e.key === 'G') && e.shiftKey) {
        e.preventDefault();
        this.ungroupSelected();
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        this.bringToFront();
        return;
      }
      if (e.key === '[') {
        e.preventDefault();
        this.sendToBack();
        return;
      }
      return;
    }

    if (e.key === 'v' || e.key === 'V') this.activeTool = 'select';
    if (e.key === 'h' || e.key === 'H') this.activeTool = 'hand';
    if (e.key === 'r' || e.key === 'R') this.activeTool = 'rectangle';
    if (e.key === 'o' || e.key === 'O') this.activeTool = 'ellipse';
    if (e.key === 'd' || e.key === 'D') this.activeTool = 'diamond';
    if (e.key === 'a' || e.key === 'A') this.activeTool = 'arrow';
    if (e.key === 't' || e.key === 'T') this.activeTool = 'text';
    if (e.key === 's' || e.key === 'S') this.activeTool = 'sticky';
    if (e.key === 'p' || e.key === 'P') this.activeTool = 'freehand';
    if (e.key === 'e' || e.key === 'E') this.activeTool = 'eraser';
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      this.isSpacePressed = false;
    }
  };
}
