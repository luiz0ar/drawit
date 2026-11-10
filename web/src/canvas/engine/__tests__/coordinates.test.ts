import { describe, it, expect } from 'vitest';
import {
  screenToWorld,
  worldToScreen,
  zoomAtPoint,
  clampZoom,
  normalizeWheelDelta,
  ViewportTransform,
  WorldPoint,
  ScreenPoint,
} from '../coordinates';

describe('Canvas Coordinates & Viewport Transforms', () => {
  it('preserves Euclidean roundtrip invariance with arbitrary zoom and pan', () => {
    const viewports: ViewportTransform[] = [
      { panX: 0, panY: 0, zoom: 1.0 },
      { panX: 250, panY: -180, zoom: 0.1 },
      { panX: -1000, panY: 4500, zoom: 8.0 },
      { panX: 42.5, panY: 99.9, zoom: 2.35 },
    ];

    const testPoints: WorldPoint[] = [
      { x: 0, y: 0 },
      { x: 100, y: 150 },
      { x: -500.25, y: 1200.75 },
      { x: 99999.99, y: -88888.88 },
    ];

    for (const vp of viewports) {
      for (const pt of testPoints) {
        const screenPt = worldToScreen(pt, vp);
        const roundtripPt = screenToWorld(screenPt, vp);

        expect(Math.abs(roundtripPt.x - pt.x)).toBeLessThan(1e-6);
        expect(Math.abs(roundtripPt.y - pt.y)).toBeLessThan(1e-6);
      }
    }
  });

  it('clamps zoom strictly between 10% (0.1) and 800% (8.0)', () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(0.0999)).toBe(0.1);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(8.0)).toBe(8.0);
    expect(clampZoom(15.0)).toBe(8.0);
  });

  it('anchors the world point under the cursor when zooming', () => {
    const currentViewport: ViewportTransform = { panX: 100, panY: 100, zoom: 1.0 };
    const cursorScreen: ScreenPoint = { x: 300, y: 200 };

    // Point in world before zoom
    const initialWorldPt = screenToWorld(cursorScreen, currentViewport);

    // Zoom in to 2.0x
    const newViewport = zoomAtPoint(cursorScreen, currentViewport, 2.0);
    expect(newViewport.zoom).toBe(2.0);

    // The cursor screen point in the new viewport must still project to the exact same world point
    const worldPtAfterZoom = screenToWorld(cursorScreen, newViewport);
    expect(worldPtAfterZoom.x).toBeCloseTo(initialWorldPt.x, 6);
    expect(worldPtAfterZoom.y).toBeCloseTo(initialWorldPt.y, 6);
  });

  it('normalizes wheel delta according to deltaMode', () => {
    const pixelEvent = { deltaY: 50, deltaMode: 0 } as WheelEvent;
    expect(normalizeWheelDelta(pixelEvent)).toBe(50);

    const lineEvent = { deltaY: 3, deltaMode: 1 } as WheelEvent;
    expect(normalizeWheelDelta(lineEvent)).toBe(60); // 3 * 20

    const pageEvent = { deltaY: 2, deltaMode: 2 } as WheelEvent;
    expect(normalizeWheelDelta(pageEvent)).toBe(1000); // 2 * 500
  });
});

