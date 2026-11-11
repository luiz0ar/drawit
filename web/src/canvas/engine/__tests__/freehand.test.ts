import { describe, it, expect, beforeAll } from 'vitest';
import {
  getFreeDrawOptions,
  getFreeDrawStrokePoints,
  getFreeDrawPath2D,
  getFreeDrawSvgPath,
  normalizeFreehandPoints,
  scaleFreehandPoints,
  hitTestFreehand,
} from '../freehand';
import { FreehandElement } from '../types';
import { exportToSvgString } from '../../export/imageExporter';

class MockPath2D {
  ops: string[] = [];
  moveTo(x: number, y: number) { this.ops.push(`moveTo(${x},${y})`); }
  lineTo(x: number, y: number) { this.ops.push(`lineTo(${x},${y})`); }
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) { this.ops.push(`quadraticCurveTo(${cpx},${cpy},${x},${y})`); }
  closePath() { this.ops.push('closePath'); }
}

beforeAll(() => {
  if (typeof (globalThis as any).Path2D === 'undefined') {
    (globalThis as any).Path2D = MockPath2D;
  }
});

describe('Freehand Drawing Engine (Excalidraw faithful)', () => {
  it('calibrates freehand stroke options according to strokeWidth', () => {
    const thinOpts = getFreeDrawOptions(1, false);
    expect(thinOpts.size).toBeGreaterThanOrEqual(3.5);
    expect(thinOpts.thinning).toBe(0.6);
    expect(thinOpts.smoothing).toBe(0.55);
    expect(thinOpts.streamline).toBe(0.55);
    expect(thinOpts.simulatePressure).toBe(true);
    expect(thinOpts.last).toBe(false);

    const completeOpts = getFreeDrawOptions(4, true);
    expect(completeOpts.size).toBe(14);
    expect(completeOpts.last).toBe(true);
  });

  it('generates stroke outline points from raw input points', () => {
    const rawPoints: [number, number, number?][] = [
      [0, 0, 0.5],
      [10, 10, 0.6],
      [20, 25, 0.7],
      [35, 40, 0.5],
    ];

    const strokePoints = getFreeDrawStrokePoints(rawPoints, getFreeDrawOptions(2, true));
    expect(strokePoints.length).toBeGreaterThan(0);
    // Every stroke point should be an [x, y] vertex of the outline polygon
    for (const pt of strokePoints) {
      expect(pt).toHaveLength(2);
      expect(typeof pt[0]).toBe('number');
      expect(typeof pt[1]).toBe('number');
    }
  });

  it('creates Path2D and SVG path strings without errors', () => {
    const strokePoints = [
      [0, 0],
      [10, 5],
      [20, 10],
      [15, 20],
      [5, 15],
      [0, 0],
    ];

    const path = getFreeDrawPath2D(strokePoints);
    expect(path).toBeDefined();

    const svgPath = getFreeDrawSvgPath(strokePoints);
    expect(svgPath).toMatch(/^M \d+(\.\d+)? \d+(\.\d+)?/);
    expect(svgPath).toContain('Q');
    expect(svgPath.endsWith('Z')).toBe(true);
  });

  it('correctly normalizes points and updates bounding box on stroke completion', () => {
    // User started at (100, 100), drew upwards and to the left to (-50, -30), and down to (40, 60)
    const element: FreehandElement = {
      id: 'free-test',
      type: 'freehand',
      x: 100,
      y: 100,
      width: 1,
      height: 1,
      rotation: 0,
      zIndex: 1,
      groupIds: [],
      locked: false,
      style: {
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 2,
        strokeStyle: 'solid',
        opacity: 100,
        effect: { type: 'none', intensity: 0 },
      },
      version: 1,
      points: [
        [0, 0, 0.5],
        [-50, -30, 0.5],
        [40, 60, 0.5],
      ],
    };

    normalizeFreehandPoints(element);

    // minX was -50, minY was -30
    // So element.x should be 100 + (-50) = 50
    // element.y should be 100 + (-30) = 70
    expect(element.x).toBe(50);
    expect(element.y).toBe(70);
    expect(element.width).toBe(90); // 40 - (-50)
    expect(element.height).toBe(90); // 60 - (-30)

    // All normalized points should have x >= 0 and y >= 0
    for (const [px, py] of element.points) {
      expect(px).toBeGreaterThanOrEqual(0);
      expect(py).toBeGreaterThanOrEqual(0);
    }
  });

  it('scales stroke points proportionally when resized', () => {
    const initialElement: FreehandElement = {
      id: 'free-test',
      type: 'freehand',
      x: 50,
      y: 50,
      width: 100,
      height: 50,
      rotation: 0,
      zIndex: 1,
      groupIds: [],
      locked: false,
      style: {
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 2,
        strokeStyle: 'solid',
        opacity: 100,
        effect: { type: 'none', intensity: 0 },
      },
      version: 1,
      points: [
        [0, 0, 0.5],
        [50, 25, 0.5],
        [100, 50, 0.5],
      ],
    };

    const element: FreehandElement = JSON.parse(JSON.stringify(initialElement));
    // Resize to double width and height (200, 100)
    scaleFreehandPoints(element, initialElement, 200, 100);

    expect(element.width).toBe(200);
    expect(element.height).toBe(100);
    expect(element.points[1][0]).toBe(100); // 50 * 2
    expect(element.points[1][1]).toBe(50);  // 25 * 2
    expect(element.points[2][0]).toBe(200); // 100 * 2
    expect(element.points[2][1]).toBe(100); // 50 * 2
  });

  it('performs accurate proximity hit-testing (rejects empty space inside loops/curves)', () => {
    // A U-shaped curve in local coordinates
    const element: FreehandElement = {
      id: 'free-u',
      type: 'freehand',
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
      groupIds: [],
      locked: false,
      style: {
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 2,
        strokeStyle: 'solid',
        opacity: 100,
        effect: { type: 'none', intensity: 0 },
      },
      version: 1,
      points: [
        [0, 0, 0.5],
        [0, 100, 0.5],
        [100, 100, 0.5],
        [100, 0, 0.5],
      ],
    };

    // Clicking directly on the left segment: (100 + 0, 100 + 50) = (100, 150)
    expect(hitTestFreehand({ x: 102, y: 150 }, element)).toBe(true);

    // Clicking directly on the bottom segment: (100 + 50, 100 + 100) = (150, 200)
    expect(hitTestFreehand({ x: 150, y: 198 }, element)).toBe(true);

    // CRUCIAL: Clicking in the middle of the U-shape: (150, 130).
    // In rectangular hit testing this would be TRUE (a bug!).
    // In accurate freehand hit testing, it MUST BE FALSE!
    expect(hitTestFreehand({ x: 150, y: 130 }, element)).toBe(false);

    // Far away: (300, 300)
    expect(hitTestFreehand({ x: 300, y: 300 }, element)).toBe(false);
  });

  it('supports single-point clicks as circular dots', () => {
    const dotElement: FreehandElement = {
      id: 'free-dot',
      type: 'freehand',
      x: 200,
      y: 200,
      width: 1,
      height: 1,
      rotation: 0,
      zIndex: 1,
      groupIds: [],
      locked: false,
      style: {
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 2,
        strokeStyle: 'solid',
        opacity: 100,
        effect: { type: 'none', intensity: 0 },
      },
      version: 1,
      points: [[0, 0, 0.5]],
    };

    // Close to the dot (200, 200)
    expect(hitTestFreehand({ x: 202, y: 201 }, dotElement)).toBe(true);
    // Far from the dot
    expect(hitTestFreehand({ x: 250, y: 250 }, dotElement)).toBe(false);
  });

  it('exports freehand strokes to SVG correctly', () => {
    const element: FreehandElement = {
      id: 'free-export',
      type: 'freehand',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 0,
      zIndex: 1,
      groupIds: [],
      locked: false,
      style: {
        strokeColor: '#e11d48',
        fillColor: 'transparent',
        strokeWidth: 2,
        strokeStyle: 'solid',
        opacity: 100,
        effect: { type: 'none', intensity: 0 },
      },
      version: 1,
      points: [
        [0, 0, 0.5],
        [20, 15, 0.6],
        [50, 35, 0.7],
        [100, 50, 0.5],
      ],
    };

    const svg = exportToSvgString([element]);
    expect(svg).toContain('<svg');
    expect(svg).toContain('fill="#e11d48"');
    expect(svg).toContain('<path');
  });
});
