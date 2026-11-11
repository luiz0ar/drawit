import { describe, it, expect } from 'vitest';
import {
  hitTestElement,
  hitTestArrowHandle,
  getDefaultCurveControlPoint,
} from '../hitTest';
import { CanvasElement } from '../types';
import { ViewportTransform } from '../coordinates';
import { exportToSvgString } from '../../export/imageExporter';

describe('Arrow Excalidraw Behavior', () => {
  const viewport: ViewportTransform = { panX: 0, panY: 0, zoom: 1 };

  const straightArrow: CanvasElement = {
    id: 'arrow-1',
    type: 'arrow',
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    rotation: 0,
    zIndex: 1,
    groupIds: [],
    locked: false,
    style: {
      strokeColor: '#2563eb',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: 'solid',
      opacity: 100,
      effect: { type: 'none', intensity: 0 },
    },
    version: 1,
    points: [
      { x: 100, y: 100 },
      { x: 300, y: 200 },
    ],
    routing: 'straight',
  } as any;

  it('detects hits along straight arrow segments', () => {
    // Exact midpoint of segment [100, 100] to [300, 200] is [200, 150]
    expect(hitTestElement({ x: 200, y: 150 }, straightArrow)).toBe(true);
    expect(hitTestElement({ x: 200, y: 180 }, straightArrow)).toBe(false);
  });

  it('hit tests start, end, and midpoint handles of selected arrow', () => {
    // Start handle at (100, 100)
    expect(hitTestArrowHandle({ x: 100, y: 100 }, straightArrow, viewport)).toBe('arrow-start');
    // End handle at (300, 200)
    expect(hitTestArrowHandle({ x: 300, y: 200 }, straightArrow, viewport)).toBe('arrow-end');
    // Mid handle at (200, 150)
    expect(hitTestArrowHandle({ x: 200, y: 150 }, straightArrow, viewport)).toBe('arrow-mid');
    // Away from any handle
    expect(hitTestArrowHandle({ x: 50, y: 50 }, straightArrow, viewport)).toBeNull();
  });

  it('calculates natural default curve control point', () => {
    const cp = getDefaultCurveControlPoint({ x: 100, y: 100 }, { x: 300, y: 100 });
    // Midpoint x is 200, y is shifted perpendicularly
    expect(cp.x).toBeCloseTo(200, 1);
    expect(cp.y).not.toBe(100);
  });

  it('detects hits along curved arrow path', () => {
    const curvedArrow: CanvasElement = {
      ...straightArrow,
      id: 'arrow-curved',
      routing: 'curved',
      controlPoint: { x: 200, y: 50 },
    } as any;

    // At t=0.5 on quadratic curve: (100,100), (200, 50), (300, 200):
    // x = 0.25*100 + 0.5*200 + 0.25*300 = 200
    // y = 0.25*100 + 0.5*50 + 0.25*200 = 100
    expect(hitTestElement({ x: 200, y: 100 }, curvedArrow)).toBe(true);
  });

  it('exports Excalidraw chevron arrowheads in SVG', () => {
    const svg = exportToSvgString([straightArrow]);
    expect(svg).toContain('<path');
    expect(svg).toContain('stroke="#2563eb"');
  });
});

