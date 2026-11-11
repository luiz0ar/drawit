import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CanvasEngine } from '../CanvasEngine';
import { CanvasElement } from '../types';

function createMockContext2D(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    fillRect: vi.fn(),
    setLineDash: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    measureText: vi.fn((text: string) => ({
      width: (text || '').length * 10,
    })),
    canvas: {} as any,
  } as unknown as CanvasRenderingContext2D;
}

describe('Text Editing & Proportional Sizing', () => {
  let canvas: HTMLCanvasElement;
  let mockCtx: CanvasRenderingContext2D;

  beforeEach(() => {
    mockCtx = createMockContext2D();
    canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 800;
    Object.defineProperty(canvas, 'clientWidth', { value: 1000, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 800, configurable: true });
    vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx);
  });

  it('measures text dimensions based on font size and lines', () => {
    const engine = new CanvasEngine(canvas);
    const dims1 = engine.measureTextDimensions('Hello World', 20, 'sans');
    const dims2 = engine.measureTextDimensions('Hello World', 40, 'sans');

    expect(dims2.height).toBeGreaterThan(dims1.height);

    const multilineDims = engine.measureTextDimensions('Line 1\nLine 2\nLine 3', 20, 'sans');
    expect(multilineDims.height).toBeGreaterThanOrEqual(dims1.height * 2.5);
  });

  it('updates element text and recomputes width/height based on font size', () => {
    const engine = new CanvasEngine(canvas);
    const textEl: CanvasElement = {
      id: 'text-1',
      type: 'text',
      text: 'Short',
      label: 'Short',
      fontFamily: 'sans',
      fontSize: 24,
      textAlign: 'left',
      x: 100,
      y: 100,
      width: 50,
      height: 20,
      rotation: 0,
      zIndex: 1,
      groupIds: [],
      locked: false,
      style: {
        strokeColor: '#000000',
        fillColor: 'transparent',
        strokeWidth: 2,
        strokeStyle: 'solid',
        opacity: 100,
        effect: { type: 'none', intensity: 0 },
      },
      version: 1,
    };

    engine.setElements([textEl]);
    const initWidth = textEl.width;

    engine.updateElementText('text-1', 'A much longer title and description that spans multiple words');
    const updated = engine.getElements().find((el) => el.id === 'text-1')!;

    expect((updated as any).text).toContain('A much longer title');
    expect(updated.width).toBeGreaterThan(initWidth);
  });

  it('updates selected font size and scales dimensions proportionally', () => {
    const engine = new CanvasEngine(canvas);
    const textEl: CanvasElement = {
      id: 'text-2',
      type: 'text',
      text: 'Architecture Title',
      label: 'Architecture Title',
      fontFamily: 'sans',
      fontSize: 16,
      textAlign: 'left',
      x: 50,
      y: 50,
      width: 100,
      height: 25,
      rotation: 0,
      zIndex: 1,
      groupIds: [],
      locked: false,
      style: {
        strokeColor: '#000000',
        fillColor: 'transparent',
        strokeWidth: 2,
        strokeStyle: 'solid',
        opacity: 100,
        effect: { type: 'none', intensity: 0 },
      },
      version: 1,
    };

    engine.setElements([textEl]);
    // Select element
    (engine as any).selectedIds = new Set(['text-2']);

    engine.updateSelectedFontSize(36);
    const updated = engine.getElements().find((el) => el.id === 'text-2')!;

    expect((updated as any).fontSize).toBe(36);
    expect(updated.height).toBeGreaterThan(35);
  });

  it('triggers inline text editing without modal on element edit', () => {
    let editedElement: CanvasElement | null = null;
    let isNewFlag: boolean | undefined = undefined;

    const engine = new CanvasEngine(canvas, {
      onEditElementText: (el, isNew) => {
        editedElement = el;
        isNewFlag = isNew;
      },
    });

    const compEl: CanvasElement = {
      id: 'comp-1',
      type: 'component',
      componentKey: 'apiGateway',
      label: 'API Gateway',
      x: 100,
      y: 100,
      width: 120,
      height: 80,
      rotation: 0,
      zIndex: 1,
      groupIds: [],
      locked: false,
      style: {
        strokeColor: '#000000',
        fillColor: '#ffffff',
        strokeWidth: 2,
        strokeStyle: 'solid',
        opacity: 100,
        effect: { type: 'none', intensity: 0 },
      },
      version: 1,
    } as any;

    engine.setElements([compEl]);

    // Simulate double-click on component
    const dblClickEvent = new MouseEvent('dblclick', { clientX: 120, clientY: 120 });
    (engine as any).onDoubleClick(dblClickEvent);

    expect(editedElement).not.toBeNull();
    expect(editedElement!.id).toBe('comp-1');
    expect(isNewFlag).toBe(false);
  });

  it('removes newly created empty text elements when cancelled or empty', () => {
    const engine = new CanvasEngine(canvas);
    const newTextEl: CanvasElement = {
      id: 'text-empty-1',
      type: 'text',
      text: '',
      label: '',
      fontFamily: 'sans',
      fontSize: 20,
      textAlign: 'left',
      x: 100,
      y: 100,
      width: 100,
      height: 30,
      rotation: 0,
      zIndex: 1,
      groupIds: [],
      locked: false,
      style: {
        strokeColor: '#000000',
        fillColor: 'transparent',
        strokeWidth: 2,
        strokeStyle: 'solid',
        opacity: 100,
        effect: { type: 'none', intensity: 0 },
      },
      version: 1,
    };

    engine.setElements([newTextEl]);
    expect(engine.getElements()).toHaveLength(1);

    engine.removeElementIfEmpty('text-empty-1');
    expect(engine.getElements()).toHaveLength(0);
  });
});
