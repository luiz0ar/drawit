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

export type Tool =
  | 'select'
  | 'hand'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'line';

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

  public deleteSelected() {
    if (this.selectedIds.size === 0) return;
    this.elements = this.elements.filter((el) => !this.selectedIds.has(el.id));
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

    // Handle high DPI display
    const dpr = window.devicePixelRatio || 1;
    if (
      this.canvas.width !== width * dpr ||
      this.canvas.height !== height * dpr
    ) {
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
      this.ctx.scale(dpr, dpr);
    }

    // 1. Clear & Background Grid
    this.renderer.clearAndRenderGrid(this.viewport, width, height, this.theme);

    // 2. Render Elements
    this.renderer.applyViewport(this.viewport);
    for (const el of this.elements) {
      this.renderer.renderElement(el);
    }

    // 3. Render Selection Bounding Box
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

    // Prevent Windows middle-click autoscroll
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

    // Zoom via mouse wheel without Ctrl
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

    // Check if middle click or Hand tool or Spacebar is active -> Pan
    if (e.button === 1 || this.activeTool === 'hand' || this.isSpacePressed) {
      this.isPanning = true;
      return;
    }

    if (e.button !== 0) return; // Left click only for drawing/selecting

    if (this.activeTool === 'select') {
      // Find element under cursor (top-most in reverse order)
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

    // Creating new geometric shape
    if (
      this.activeTool === 'rectangle' ||
      this.activeTool === 'ellipse' ||
      this.activeTool === 'diamond' ||
      this.activeTool === 'triangle' ||
      this.activeTool === 'line'
    ) {
      this.isCreatingElement = true;
      const strokeColor = this.theme === 'dark' ? '#f3f4f6' : '#1f2937';
      const fillColor = 'transparent';

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
          fillColor,
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
    if (!this.isPointerDown) return;

    const rect = this.canvas.getBoundingClientRect();
    const screenPoint: ScreenPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const deltaScreenX = screenPoint.x - this.lastScreenPoint.x;
    const deltaScreenY = screenPoint.y - this.lastScreenPoint.y;
    this.lastScreenPoint = screenPoint;

    // Pan mode
    if (this.isPanning) {
      this.viewport.panX += deltaScreenX;
      this.viewport.panY += deltaScreenY;
      this.isDirty = true;
      this.callbacks.onViewportChange?.(this.viewport);
      return;
    }

    const currentWorld = screenToWorld(screenPoint, this.viewport);

    // Creating element mode
    if (this.isCreatingElement && this.activeElement) {
      this.activeElement.width = currentWorld.x - this.startWorldPoint.x;
      this.activeElement.height = currentWorld.y - this.startWorldPoint.y;
      this.isDirty = true;
      return;
    }

    // Dragging selected elements mode
    if (this.isDraggingElement) {
      const deltaWorldX = deltaScreenX / this.viewport.zoom;
      const deltaWorldY = deltaScreenY / this.viewport.zoom;

      for (const el of this.elements) {
        if (this.selectedIds.has(el.id)) {
          el.x += deltaWorldX;
          el.y += deltaWorldY;
        }
      }
      this.isDirty = true;
      return;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.isPointerDown) return;

    try {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore lost capture
    }

    this.isPointerDown = false;
    this.isPanning = false;

    if (this.isCreatingElement) {
      this.isCreatingElement = false;

      // Normalize negative width/height
      if (this.activeElement) {
        if (this.activeElement.width < 0) {
          this.activeElement.x += this.activeElement.width;
          this.activeElement.width = Math.abs(this.activeElement.width);
        }
        if (this.activeElement.height < 0) {
          this.activeElement.y += this.activeElement.height;
          this.activeElement.height = Math.abs(this.activeElement.height);
        }

        // Avoid accidental single-pixel clicks
        if (this.activeElement.width < 5 && this.activeElement.height < 5) {
          this.activeElement.width = 100;
          this.activeElement.height = 60;
        }

        this.callbacks.onElementsChange?.(this.elements);
        this.activeElement = null;
      }

      // Switch back to select tool after creating element
      this.activeTool = 'select';
    }

    if (this.isDraggingElement) {
      this.isDraggingElement = false;
      this.callbacks.onElementsChange?.(this.elements);
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    // Avoid triggering canvas hotkeys when typing in form inputs
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

    // Keyboard Shortcuts
    if (e.key === 'v' || e.key === 'V') this.activeTool = 'select';
    if (e.key === 'h' || e.key === 'H') this.activeTool = 'hand';
    if (e.key === 'r' || e.key === 'R') this.activeTool = 'rectangle';
    if (e.key === 'o' || e.key === 'O') this.activeTool = 'ellipse';
    if (e.key === 'd' || e.key === 'D') this.activeTool = 'diamond';
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      this.isSpacePressed = false;
    }
  };
}

