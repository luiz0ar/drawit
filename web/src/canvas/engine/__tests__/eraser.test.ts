import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasElement } from '../types';
import { WorldPoint } from '../coordinates';
import { hitTestSegmentVsElement, detachBoundArrows } from '../eraser';
import { CanvasEngine } from '../CanvasEngine';

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

describe('Eraser Engine: Segment Collision and Detachment', () => {
  const baseStyle = {
    strokeColor: '#000000',
    fillColor: 'transparent',
    strokeWidth: 2,
    strokeStyle: 'solid' as const,
    opacity: 100,
    effect: { type: 'none' as const, intensity: 0 },
  };

  const baseElementProps = {
    rotation: 0,
    zIndex: 1,
    groupIds: [],
    locked: false,
    version: 1,
  };

  const sampleRect: CanvasElement = {
    ...baseElementProps,
    id: 'rect-1',
    type: 'rectangle',
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    style: baseStyle,
  };

  const sampleEllipse: CanvasElement = {
    ...baseElementProps,
    id: 'ellipse-1',
    type: 'ellipse',
    x: 500,
    y: 500,
    width: 100,
    height: 100,
    style: baseStyle,
  };

  const sampleArrow: CanvasElement = {
    ...baseElementProps,
    id: 'arrow-1',
    type: 'arrow',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    style: baseStyle,
    points: [
      { x: 100, y: 100 },
      { x: 300, y: 300 },
    ],
  } as any;

  describe('hitTestSegmentVsElement', () => {
    it('detects hit when segment directly crosses a rectangle', () => {
      const p1: WorldPoint = { x: 50, y: 150 };
      const p2: WorldPoint = { x: 350, y: 150 };

      expect(hitTestSegmentVsElement(p1, p2, sampleRect)).toBe(true);
    });

    it('detects hit when segment endpoints are inside the element', () => {
      const p1: WorldPoint = { x: 120, y: 120 };
      const p2: WorldPoint = { x: 140, y: 140 };

      expect(hitTestSegmentVsElement(p1, p2, sampleRect)).toBe(true);
    });

    it('detects hit during fast mouse sweep across an element', () => {
      // Rapid swipe leaping right over the shape
      const p1: WorldPoint = { x: 50, y: 175 };
      const p2: WorldPoint = { x: 400, y: 175 };

      expect(hitTestSegmentVsElement(p1, p2, sampleRect)).toBe(true);
    });

    it('returns false when segment is far outside element bounding box', () => {
      const p1: WorldPoint = { x: 0, y: 0 };
      const p2: WorldPoint = { x: 50, y: 50 };

      expect(hitTestSegmentVsElement(p1, p2, sampleRect)).toBe(false);
    });

    it('detects hit when sweeping across an arrow line', () => {
      // Arrow runs from (100,100) to (300,300)
      // Perpendicular cut from (150, 250) to (250, 150) crossing at (200, 200)
      const p1: WorldPoint = { x: 150, y: 250 };
      const p2: WorldPoint = { x: 250, y: 150 };

      expect(hitTestSegmentVsElement(p1, p2, sampleArrow)).toBe(true);
    });

    it('detects hit when sweeping across an ellipse', () => {
      const p1: WorldPoint = { x: 450, y: 550 };
      const p2: WorldPoint = { x: 650, y: 550 };

      expect(hitTestSegmentVsElement(p1, p2, sampleEllipse)).toBe(true);
    });

    it('ignores locked elements', () => {
      const lockedRect: CanvasElement = {
        ...sampleRect,
        locked: true,
      };
      const p1: WorldPoint = { x: 50, y: 150 };
      const p2: WorldPoint = { x: 350, y: 150 };

      expect(hitTestSegmentVsElement(p1, p2, lockedRect)).toBe(false);
    });
  });

  describe('detachBoundArrows', () => {
    it('detaches arrows bound to erased elements without moving their anchor positions', () => {
      const nodeA: CanvasElement = {
        ...baseElementProps,
        id: 'node-a',
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        style: baseStyle,
      };

      const arrowWithBinding: CanvasElement = {
        ...baseElementProps,
        id: 'arrow-binding-1',
        type: 'arrow',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        style: baseStyle,
        points: [
          { x: 200, y: 150 }, // right anchor of nodeA (100 + 100, 100 + 50)
          { x: 400, y: 150 },
        ],
        startBinding: {
          elementId: 'node-a',
          anchor: 'right',
        },
      } as any;

      const elements = [nodeA, arrowWithBinding];
      const deletedIds = new Set(['node-a']);

      detachBoundArrows(elements, deletedIds);

      const updatedArrow = elements.find((e) => e.id === 'arrow-binding-1') as any;
      expect(updatedArrow.startBinding).toBeUndefined();
      expect(updatedArrow.points[0]).toEqual({ x: 200, y: 150 });
    });
  });

  describe('CanvasEngine Eraser Interaction Lifecycle (Excalidraw Parity)', () => {
    let canvas: HTMLCanvasElement;
    let engine: CanvasEngine;

    beforeEach(() => {
      canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 800;
      canvas.setPointerCapture = vi.fn();
      canvas.releasePointerCapture = vi.fn();
      canvas.hasPointerCapture = vi.fn(() => false);
      canvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 1000,
        bottom: 800,
        width: 1000,
        height: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      const mockCtx: any = {
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

      vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx);
      engine = new CanvasEngine(canvas);
      engine.setViewport({ panX: 0, panY: 0, zoom: 1 });
    });

    it('erases a single element on single click and allows undo', () => {
      const rect1: CanvasElement = { ...sampleRect, id: 'rect-1' };
      engine.setElements([rect1]);
      engine.setTool('eraser');

      // Click at (150, 150) inside rect1
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 150, clientY: 150, button: 0, pointerId: 1 })
      );
      window.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 150, clientY: 150, button: 0, pointerId: 1 })
      );

      // Element should be deleted
      expect(engine.getElements()).toHaveLength(0);

      // Undo restores it in a single step
      engine.undo();
      expect(engine.getElements()).toHaveLength(1);
      expect(engine.getElements()[0].id).toBe('rect-1');
    });

    it('erases multiple elements in a single sweep with atomic undo/redo', () => {
      const rect1: CanvasElement = {
        ...sampleRect,
        id: 'rect-1',
        x: 100,
        y: 100,
        width: 100,
        height: 100,
      };
      const rect2: CanvasElement = {
        ...sampleRect,
        id: 'rect-2',
        x: 300,
        y: 100,
        width: 100,
        height: 100,
      };
      const rect3: CanvasElement = {
        ...sampleRect,
        id: 'rect-3',
        x: 500,
        y: 100,
        width: 100,
        height: 100,
      };

      engine.setElements([rect1, rect2, rect3]);
      engine.setTool('eraser');

      // Continuous drag starting before rect1 and sweeping across rect1 and rect2
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 50, clientY: 150, button: 0, pointerId: 1 })
      );
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 150, clientY: 150, pointerId: 1 })
      );
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 350, clientY: 150, pointerId: 1 })
      );
      window.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 350, clientY: 150, button: 0, pointerId: 1 })
      );

      // rect-1 and rect-2 were swept; rect-3 was untouched
      const remaining = engine.getElements();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('rect-3');

      // Atomic Undo: single undo restores BOTH swept elements!
      engine.undo();
      expect(engine.getElements()).toHaveLength(3);
      expect(engine.getElements().map((e) => e.id)).toEqual(['rect-1', 'rect-2', 'rect-3']);

      // Atomic Redo: deletes both again in 1 step!
      engine.redo();
      expect(engine.getElements()).toHaveLength(1);
      expect(engine.getElements()[0].id).toBe('rect-3');
    });

    it('cancels erase gesture when Escape is pressed mid-drag', () => {
      const rect1: CanvasElement = { ...sampleRect, id: 'rect-1' };
      engine.setElements([rect1]);
      engine.setTool('eraser');

      // Start drag over rect1
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 150, clientY: 150, button: 0, pointerId: 1 })
      );
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 200, clientY: 150, pointerId: 1 })
      );

      // User hits Escape to abort
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      // Release mouse
      window.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 200, clientY: 150, button: 0, pointerId: 1 })
      );

      // Nothing should have been deleted!
      expect(engine.getElements()).toHaveLength(1);
      expect(engine.getElements()[0].id).toBe('rect-1');
    });
  });
});
