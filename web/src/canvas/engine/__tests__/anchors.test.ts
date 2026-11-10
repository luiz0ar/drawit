import { describe, it, expect } from 'vitest';
import { computeAnchorWorldPosition } from '../anchors';
import { CanvasElement } from '../types';

describe('Magnetic Anchors & Rotation Geometry', () => {
  const square: CanvasElement = {
    id: 'sq-1',
    type: 'rectangle',
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
      fillColor: '#fff',
      strokeWidth: 2,
      strokeStyle: 'solid',
      opacity: 100,
      effect: { type: 'none', intensity: 0 },
    },
    version: 1,
  };

  it('computes exact cardinal anchors unrotated', () => {
    // Center is (150, 150)
    const top = computeAnchorWorldPosition(square, 'top');
    expect(top.x).toBeCloseTo(150, 6);
    expect(top.y).toBeCloseTo(100, 6);

    const right = computeAnchorWorldPosition(square, 'right');
    expect(right.x).toBeCloseTo(200, 6);
    expect(right.y).toBeCloseTo(150, 6);
  });

  it('correctly maps anchors rotated by 90 degrees (+PI/2)', () => {
    const rotatedSquare: CanvasElement = {
      ...square,
      rotation: Math.PI / 2,
    };

    // Under clockwise 90-degree rotation: top (0, -50) becomes (50, 0) relative to center -> right
    const topRotated = computeAnchorWorldPosition(rotatedSquare, 'top');
    expect(topRotated.x).toBeCloseTo(200, 6);
    expect(topRotated.y).toBeCloseTo(150, 6);
  });

  it('does NOT conflate top and right on non-square rectangle (200x100) rotated 90 degrees', () => {
    const rect: CanvasElement = {
      ...square,
      width: 200,
      height: 100,
      rotation: Math.PI / 2,
    };
    // Center: (200, 150). Half-width = 100, half-height = 50.
    // Unrotated top is (200, 100) -> dy = -50.
    // Under +90 deg rotation, (0, -50) rotates to (+50, 0) -> World (250, 150).
    const topRotated = computeAnchorWorldPosition(rect, 'top');
    expect(topRotated.x).toBeCloseTo(250, 6);
    expect(topRotated.y).toBeCloseTo(150, 6);
  });
});

