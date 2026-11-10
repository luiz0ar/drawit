import { describe, it, expect } from 'vitest';
import { hitTestElement } from '../hitTest';
import { CanvasElement } from '../types';

describe('Hit Testing Engine', () => {
  const baseElement: CanvasElement = {
    id: 'el-1',
    type: 'rectangle',
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    rotation: 0,
    zIndex: 1,
    groupIds: [],
    locked: false,
    style: {
      strokeColor: '#000',
      fillColor: '#fff',
      strokeWidth: 2,
      strokeStyle: 'solid',
      opacity: 100,
      effect: { type: 'none', intensity: 0 },
    },
    version: 1,
  };

  it('correctly detects hits inside a filled rectangle', () => {
    expect(hitTestElement({ x: 150, y: 150 }, baseElement)).toBe(true);
    expect(hitTestElement({ x: 50, y: 50 }, baseElement)).toBe(false);
    expect(hitTestElement({ x: 350, y: 250 }, baseElement)).toBe(false);
  });

  it('correctly tests rotated elements using inverse affine transformation', () => {
    const rotatedElement: CanvasElement = {
      ...baseElement,
      rotation: Math.PI / 2, // 90 degrees
    };

    // Center is at (200, 150). With 90 deg rotation, width (200) expands vertically.
    expect(hitTestElement({ x: 200, y: 150 }, rotatedElement)).toBe(true);
    expect(hitTestElement({ x: 200, y: 240 }, rotatedElement)).toBe(true);
  });

  it('tests diamond via L1 norm', () => {
    const diamond: CanvasElement = {
      ...baseElement,
      type: 'diamond',
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    };

    // Center is (150, 150)
    expect(hitTestElement({ x: 150, y: 150 }, diamond)).toBe(true);
    // Outer corner (105, 105) is outside diamond boundary
    expect(hitTestElement({ x: 105, y: 105 }, diamond)).toBe(false);
  });

  it('tests triangle via barycentric coordinates', () => {
    const triangle: CanvasElement = {
      ...baseElement,
      type: 'triangle',
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    };

    // Near bottom center (inside)
    expect(hitTestElement({ x: 150, y: 180 }, triangle)).toBe(true);
    // Top-left corner (outside)
    expect(hitTestElement({ x: 110, y: 110 }, triangle)).toBe(false);
  });
});

