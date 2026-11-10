import { CanvasElement } from './types';
import { WorldPoint } from './coordinates';

export type AnchorPosition =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface Anchor {
  position: AnchorPosition;
  point: WorldPoint;
}

/**
 * Normalized anchor definitions (u, v) in [0, 1] x [0, 1]
 */
const ANCHOR_DEFINITIONS: Record<AnchorPosition, { u: number; v: number }> = {
  top: { u: 0.5, v: 0.0 },
  right: { u: 1.0, v: 0.5 },
  bottom: { u: 0.5, v: 1.0 },
  left: { u: 0.0, v: 0.5 },
  'top-left': { u: 0.0, v: 0.0 },
  'top-right': { u: 1.0, v: 0.0 },
  'bottom-right': { u: 1.0, v: 1.0 },
  'bottom-left': { u: 0.0, v: 1.0 },
};

/**
 * Computes exact world coordinates of an anchor for an element under arbitrary clockwise rotation theta.
 */
export function computeAnchorWorldPosition(
  element: CanvasElement,
  position: AnchorPosition
): WorldPoint {
  const { u, v } = ANCHOR_DEFINITIONS[position];

  const w = element.width;
  const h = element.height;
  const cx = element.x + w / 2;
  const cy = element.y + h / 2;

  // Local unrotated offset from center
  const deltaXLocal = (u - 0.5) * w;
  const deltaYLocal = (v - 0.5) * h;

  const theta = element.rotation || 0;
  if (theta === 0) {
    return {
      x: cx + deltaXLocal,
      y: cy + deltaYLocal,
    };
  }

  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  return {
    x: cx + deltaXLocal * cos - deltaYLocal * sin,
    y: cy + deltaXLocal * sin + deltaYLocal * cos,
  };
}

/**
 * Returns all 8 magnetic anchors computed for an element.
 */
export function getElementAnchors(element: CanvasElement): Anchor[] {
  const positions: AnchorPosition[] = [
    'top',
    'right',
    'bottom',
    'left',
    'top-left',
    'top-right',
    'bottom-right',
    'bottom-left',
  ];

  return positions.map((pos) => ({
    position: pos,
    point: computeAnchorWorldPosition(element, pos),
  }));
}

/**
 * Finds closest magnetic anchor within snap threshold (15px world distance).
 */
export function findClosestAnchor(
  point: WorldPoint,
  elements: CanvasElement[],
  excludeElementId?: string,
  threshold = 15
): { elementId: string; anchor: AnchorPosition; point: WorldPoint } | null {
  let closest: { elementId: string; anchor: AnchorPosition; point: WorldPoint } | null = null;
  let minDistance = threshold;

  for (const element of elements) {
    if (element.id === excludeElementId || element.type === 'line' || element.type === 'arrow') {
      continue;
    }

    const anchors = getElementAnchors(element);
    for (const a of anchors) {
      const dist = Math.hypot(point.x - a.point.x, point.y - a.point.y);
      if (dist < minDistance) {
        minDistance = dist;
        closest = {
          elementId: element.id,
          anchor: a.position,
          point: a.point,
        };
      }
    }
  }

  return closest;
}

