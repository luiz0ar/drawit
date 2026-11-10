import { describe, it, expect } from 'vitest';
import { hitTestElement, hitTestSelectionHandle } from '../hitTest';
import { IT_COMPONENTS } from '../components';
import { CanvasElement } from '../types';

describe('Hit Testing Engine & 20 P0 IT Components', () => {
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

    expect(hitTestElement({ x: 150, y: 150 }, diamond)).toBe(true);
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

    expect(hitTestElement({ x: 150, y: 180 }, triangle)).toBe(true);
    expect(hitTestElement({ x: 110, y: 110 }, triangle)).toBe(false);
  });

  it('detects 8 resize handles and rotation handle in screen space', () => {
    const vp = { panX: 0, panY: 0, zoom: 1.0 };
    expect(hitTestSelectionHandle({ x: 96, y: 96 }, baseElement, vp)).toBe('nw');
    expect(hitTestSelectionHandle({ x: 304, y: 204 }, baseElement, vp)).toBe('se');
    expect(hitTestSelectionHandle({ x: 200, y: 76 }, baseElement, vp)).toBe('rotate');
  });

  it('registers all 20 P0 IT Architecture components across 5 categories', () => {
    const keys = Object.keys(IT_COMPONENTS);
    expect(keys.length).toBe(20);
    expect(keys).toEqual(
      expect.arrayContaining([
        'browser',
        'mobile',
        'laptop',
        'user',
        'server',
        'microservice',
        'worker',
        'api_gateway',
        'load_balancer',
        'database',
        'nosql',
        'cache',
        'object_storage',
        'queue',
        'event_stream',
        'cloud',
        'cdn',
        'firewall',
        'container',
        'kubernetes',
      ])
    );
  });
});
