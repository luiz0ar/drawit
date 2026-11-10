import { describe, it, expect } from 'vitest';
import { computeContentHash } from './useAutosave';
import { CanvasElement } from '../../canvas/engine/types';

describe('computeContentHash', () => {
  const dummyStyle = {
    strokeColor: '#000',
    fillColor: '#fff',
    strokeWidth: 2,
    strokeStyle: 'solid' as const,
    opacity: 100,
    effect: { type: 'none' as const, intensity: 0 },
  };

  it('generates consistent hash for identical scene payload', () => {
    const elements: CanvasElement[] = [
      {
        id: '1',
        type: 'rectangle',
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        rotation: 0,
        zIndex: 1,
        groupIds: [],
        locked: false,
        style: dummyStyle,
        version: 1,
      },
    ];
    const vp = { panX: 0, panY: 0, zoom: 1 };

    const hash1 = computeContentHash(elements, vp);
    const hash2 = computeContentHash(elements, vp);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBeGreaterThan(0);
  });

  it('detects changes in elements or viewport', () => {
    const el1: CanvasElement[] = [
      {
        id: '1',
        type: 'rectangle',
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        rotation: 0,
        zIndex: 1,
        groupIds: [],
        locked: false,
        style: dummyStyle,
        version: 1,
      },
    ];
    const el2: CanvasElement[] = [
      {
        id: '1',
        type: 'rectangle',
        x: 15, // moved
        y: 20,
        width: 100,
        height: 50,
        rotation: 0,
        zIndex: 1,
        groupIds: [],
        locked: false,
        style: dummyStyle,
        version: 1,
      },
    ];
    const vp = { panX: 0, panY: 0, zoom: 1 };

    expect(computeContentHash(el1, vp)).not.toBe(computeContentHash(el2, vp));
    expect(computeContentHash(el1, vp)).not.toBe(computeContentHash(el1, { ...vp, zoom: 1.5 }));
  });
});
