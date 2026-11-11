import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasEngine, CanvasEngineCallbacks } from '../CanvasEngine';
import { CanvasElement } from '../types';

// JSDOM PointerEvent polyfill
if (typeof (globalThis as any).PointerEvent === 'undefined') {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: any = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  (globalThis as any).PointerEvent = MockPointerEvent;
  (window as any).PointerEvent = MockPointerEvent;
}

describe('Board Shortcuts: Select All (Ctrl+A) and Shift+Scroll Pan', () => {
  let canvas: HTMLCanvasElement;
  let callbacks: CanvasEngineCallbacks;
  let engine: CanvasEngine;

  const baseStyle = {
    strokeColor: '#000000',
    fillColor: 'transparent',
    strokeWidth: 2,
    strokeStyle: 'solid' as const,
    opacity: 100,
    effect: { type: 'none' as const, intensity: 0 },
  };

  const sampleRect1: CanvasElement = {
    id: 'rect-1',
    type: 'rectangle',
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    rotation: 0,
    zIndex: 1,
    groupIds: [],
    locked: false,
    version: 1,
    style: baseStyle,
  };

  const sampleRect2: CanvasElement = {
    id: 'rect-2',
    type: 'rectangle',
    x: 400,
    y: 200,
    width: 100,
    height: 80,
    rotation: 0,
    zIndex: 2,
    groupIds: [],
    locked: false,
    version: 1,
    style: baseStyle,
  };

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 1200,
      bottom: 800,
      width: 1200,
      height: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      setTransform: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      measureText: vi.fn(() => ({ width: 50 })),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
    };

    vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as any);
    callbacks = {
      onSelectionChange: vi.fn(),
      onViewportChange: vi.fn(),
      onElementsChange: vi.fn(),
      onToolChange: vi.fn(),
    };
    engine = new CanvasEngine(canvas, callbacks);
    engine.setViewport({ panX: 0, panY: 0, zoom: 1 });
  });

  describe('Ctrl + A / Cmd + A (Select All)', () => {
    it('selects all elements on the canvas when Ctrl+A is pressed', () => {
      engine.setElements([sampleRect1, sampleRect2]);

      // Initially no elements selected
      expect(engine.getSelectedElements()).toHaveLength(0);

      // Trigger Ctrl + A
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);

      expect(engine.getSelectedElements()).toHaveLength(2);
      expect(engine.getSelectedElements().map((el) => el.id)).toEqual(
        expect.arrayContaining(['rect-1', 'rect-2'])
      );
      expect(callbacks.onSelectionChange).toHaveBeenCalledWith(
        expect.arrayContaining(['rect-1', 'rect-2']),
        expect.arrayContaining([sampleRect1, sampleRect2])
      );
      expect(engine.getTool()).toBe('select');
    });

    it('works with metaKey (Cmd+A on macOS)', () => {
      engine.setElements([sampleRect1, sampleRect2]);

      const event = new KeyboardEvent('keydown', {
        key: 'A',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);

      expect(engine.getSelectedElements()).toHaveLength(2);
    });

    it('does not intercept Ctrl+A when user is typing in an INPUT or TEXTAREA', () => {
      engine.setElements([sampleRect1, sampleRect2]);

      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: input, writable: false });

      window.dispatchEvent(event);

      // Canvas selection should remain unchanged
      expect(engine.getSelectedElements()).toHaveLength(0);

      document.body.removeChild(input);
    });

    it('selectAll() method does nothing if canvas is empty', () => {
      engine.setElements([]);
      const fn = vi.fn();
      const emptyEngine = new CanvasEngine(canvas, { onSelectionChange: fn });

      emptyEngine.selectAll();
      expect(emptyEngine.getSelectedElements()).toHaveLength(0);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('Normal Scroll (Vertical Pan: Up / Down)', () => {
    it('pans canvas down when scrolling down (deltaY > 0)', () => {
      engine.setViewport({ panX: 100, panY: 200, zoom: 1 });

      const wheelDown = new WheelEvent('wheel', {
        deltaY: 50,
        bubbles: true,
        cancelable: true,
      });
      canvas.dispatchEvent(wheelDown);

      expect(engine.getViewport().panY).toBe(150); // 200 - 50 = 150
      expect(engine.getViewport().panX).toBe(100); // unchanged
      expect(engine.getViewport().zoom).toBe(1); // unchanged
      expect(callbacks.onViewportChange).toHaveBeenCalledWith(engine.getViewport());
    });

    it('pans canvas up when scrolling up (deltaY < 0)', () => {
      engine.setViewport({ panX: 100, panY: 200, zoom: 1 });

      const wheelUp = new WheelEvent('wheel', {
        deltaY: -50,
        bubbles: true,
        cancelable: true,
      });
      canvas.dispatchEvent(wheelUp);

      expect(engine.getViewport().panY).toBe(250); // 200 - (-50) = 250
      expect(engine.getViewport().panX).toBe(100); // unchanged
      expect(engine.getViewport().zoom).toBe(1); // unchanged
      expect(callbacks.onViewportChange).toHaveBeenCalledWith(engine.getViewport());
    });

    it('pans canvas with deltaMode lines (mode 1)', () => {
      engine.setViewport({ panX: 0, panY: 0, zoom: 1 });

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 2,
        deltaMode: 1, // 2 lines * 20 = 40px
        bubbles: true,
        cancelable: true,
      });
      canvas.dispatchEvent(wheelEvent);

      expect(engine.getViewport().panY).toBe(-40);
      expect(engine.getViewport().zoom).toBe(1);
    });
  });

  describe('Ctrl + Scroll / Cmd + Scroll (Zoom In / Zoom Out)', () => {
    it('zooms in when scrolling up with Ctrl (deltaY < 0)', () => {
      engine.setViewport({ panX: 0, panY: 0, zoom: 1 });

      const zoomInEvent = new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        clientX: 600,
        clientY: 400,
        bubbles: true,
        cancelable: true,
      });
      canvas.dispatchEvent(zoomInEvent);

      expect(engine.getViewport().zoom).toBeGreaterThan(1.0);
      expect(callbacks.onViewportChange).toHaveBeenCalledWith(engine.getViewport());
    });

    it('zooms out when scrolling down with Ctrl (deltaY > 0)', () => {
      engine.setViewport({ panX: 0, panY: 0, zoom: 1 });

      const zoomOutEvent = new WheelEvent('wheel', {
        deltaY: 100,
        ctrlKey: true,
        clientX: 600,
        clientY: 400,
        bubbles: true,
        cancelable: true,
      });
      canvas.dispatchEvent(zoomOutEvent);

      expect(engine.getViewport().zoom).toBeLessThan(1.0);
      expect(callbacks.onViewportChange).toHaveBeenCalledWith(engine.getViewport());
    });

    it('supports metaKey (Cmd + Scroll on macOS)', () => {
      engine.setViewport({ panX: 0, panY: 0, zoom: 1 });

      const metaZoomEvent = new WheelEvent('wheel', {
        deltaY: -100,
        metaKey: true,
        clientX: 600,
        clientY: 400,
        bubbles: true,
        cancelable: true,
      });
      canvas.dispatchEvent(metaZoomEvent);

      expect(engine.getViewport().zoom).toBeGreaterThan(1.0);
    });
  });

  describe('Shift + Scroll (Horizontal Pan)', () => {
    it('pans canvas to the right when scrolling down (deltaY > 0)', () => {
      engine.setViewport({ panX: 100, panY: 50, zoom: 1 });

      // Wheel down with Shift: Baixo -> moves view right -> panX decreases
      const wheelDownEvent = new WheelEvent('wheel', {
        deltaY: 100,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      canvas.dispatchEvent(wheelDownEvent);

      expect(engine.getViewport().panX).toBe(0); // 100 - 100 = 0
      expect(engine.getViewport().panY).toBe(50); // unchanged
      expect(engine.getViewport().zoom).toBe(1); // unchanged
      expect(callbacks.onViewportChange).toHaveBeenCalledWith(engine.getViewport());
    });

    it('pans canvas to the left when scrolling up (deltaY < 0)', () => {
      engine.setViewport({ panX: 100, panY: 50, zoom: 1 });

      // Wheel up with Shift: Cima -> moves view left -> panX increases
      const wheelUpEvent = new WheelEvent('wheel', {
        deltaY: -100,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      canvas.dispatchEvent(wheelUpEvent);

      expect(engine.getViewport().panX).toBe(200); // 100 - (-100) = 200
      expect(engine.getViewport().panY).toBe(50); // unchanged
      expect(engine.getViewport().zoom).toBe(1); // unchanged
      expect(callbacks.onViewportChange).toHaveBeenCalledWith(engine.getViewport());
    });

    it('handles Firefox deltaMode lines (mode 1) with Shift', () => {
      engine.setViewport({ panX: 0, panY: 0, zoom: 1 });

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 3,
        deltaMode: 1, // 3 lines * 20 = 60px
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      canvas.dispatchEvent(wheelEvent);

      expect(engine.getViewport().panX).toBe(-60);
      expect(engine.getViewport().zoom).toBe(1);
    });

    it('handles trackpads reporting deltaX when Shift is pressed', () => {
      engine.setViewport({ panX: 100, panY: 0, zoom: 1 });

      const wheelEvent = new WheelEvent('wheel', {
        deltaX: 40,
        deltaY: 0,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      canvas.dispatchEvent(wheelEvent);

      expect(engine.getViewport().panX).toBe(60); // 100 - 40 = 60
    });
  });
});
