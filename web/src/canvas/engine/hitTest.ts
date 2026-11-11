import { CanvasElement } from './types';
import { WorldPoint, ScreenPoint, ViewportTransform, worldToScreen } from './coordinates';
import { hitTestFreehand } from './freehand';

export type ResizeHandle =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'rotate';

/**
 * Transforms point into the local unrotated coordinate space of the element.
 */
function toLocalPoint(point: WorldPoint, element: CanvasElement): WorldPoint {
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;

  if (!element.rotation || element.rotation === 0) {
    return point;
  }

  const cos = Math.cos(-element.rotation);
  const sin = Math.sin(-element.rotation);

  const dx = point.x - cx;
  const dy = point.y - cy;

  return {
    x: cx + (dx * cos - dy * sin),
    y: cy + (dx * sin + dy * cos),
  };
}

function distToSegment(p: WorldPoint, a: WorldPoint, b: WorldPoint): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * (b.x - a.x);
  const projY = a.y + t * (b.y - a.y);
  return Math.hypot(p.x - projX, p.y - projY);
}

/**
 * Checks if a point hits a rectangle or rectangular component.
 * Allows clicking anywhere inside the component (even if transparent) or near its borders.
 */
function hitTestRectangle(localPoint: WorldPoint, element: CanvasElement, threshold = 6): boolean {
  const left = Math.min(element.x, element.x + element.width);
  const right = Math.max(element.x, element.x + element.width);
  const top = Math.min(element.y, element.y + element.height);
  // IT components render their text label below the component box
  const labelExtra =
    element.type === 'component' && Boolean((element as any).label) ? 24 : 0;
  const bottom = Math.max(element.y, element.y + element.height) + labelExtra;

  return (
    localPoint.x >= left - threshold &&
    localPoint.x <= right + threshold &&
    localPoint.y >= top - threshold &&
    localPoint.y <= bottom + threshold
  );
}

/**
 * Checks if an element intersects with a world-space selection marquee box.
 */
export function elementIntersectsMarquee(
  element: CanvasElement,
  marquee: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  if (element.type === 'arrow') {
    const pts: { x: number; y: number }[] = (element as any).points || [];
    if (pts.length === 0) return false;
    // Check if any point is inside
    for (const p of pts) {
      if (
        p.x >= marquee.minX &&
        p.x <= marquee.maxX &&
        p.y >= marquee.minY &&
        p.y <= marquee.maxY
      ) {
        return true;
      }
    }
    // Check bounding box intersection
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return !(
      maxX < marquee.minX ||
      minX > marquee.maxX ||
      maxY < marquee.minY ||
      minY > marquee.maxY
    );
  }

  if (element.type === 'freehand') {
    const pts: [number, number, number?][] = (element as any).points || [];
    if (pts.length === 0) return false;
    for (const [px, py] of pts) {
      const wx = element.x + px;
      const wy = element.y + py;
      if (
        wx >= marquee.minX &&
        wx <= marquee.maxX &&
        wy >= marquee.minY &&
        wy <= marquee.maxY
      ) {
        return true;
      }
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of pts) {
      const wx = element.x + px;
      const wy = element.y + py;
      minX = Math.min(minX, wx);
      minY = Math.min(minY, wy);
      maxX = Math.max(maxX, wx);
      maxY = Math.max(maxY, wy);
    }
    return !(
      maxX < marquee.minX ||
      minX > marquee.maxX ||
      maxY < marquee.minY ||
      minY > marquee.maxY
    );
  }

  const left = Math.min(element.x, element.x + element.width);
  const right = Math.max(element.x, element.x + element.width);
  const top = Math.min(element.y, element.y + element.height);
  const labelExtra =
    element.type === 'component' && Boolean((element as any).label) ? 24 : 0;
  const bottom = Math.max(element.y, element.y + element.height) + labelExtra;

  return !(
    right < marquee.minX ||
    left > marquee.maxX ||
    bottom < marquee.minY ||
    top > marquee.maxY
  );
}

/**
 * Checks if a point hits an ellipse anywhere inside or near its border.
 */
function hitTestEllipse(localPoint: WorldPoint, element: CanvasElement, threshold = 6): boolean {
  const rx = Math.abs(element.width) / 2;
  const ry = Math.abs(element.height) / 2;
  if (rx === 0 || ry === 0) return false;

  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;

  const dx = localPoint.x - cx;
  const dy = localPoint.y - cy;

  const rxWithThresh = rx + threshold;
  const ryWithThresh = ry + threshold;
  const normDist =
    (dx * dx) / (rxWithThresh * rxWithThresh) +
    (dy * dy) / (ryWithThresh * ryWithThresh);

  return normDist <= 1.0;
}

/**
 * Checks if a point hits a diamond anywhere inside or near its border using L1 norm.
 */
function hitTestDiamond(localPoint: WorldPoint, element: CanvasElement, threshold = 6): boolean {
  const rx = Math.abs(element.width) / 2;
  const ry = Math.abs(element.height) / 2;
  if (rx === 0 || ry === 0) return false;

  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;

  const rxWithThresh = rx + threshold;
  const ryWithThresh = ry + threshold;
  const l1Norm =
    Math.abs(localPoint.x - cx) / rxWithThresh +
    Math.abs(localPoint.y - cy) / ryWithThresh;

  return l1Norm <= 1.0;
}

/**
 * Checks if a point hits a triangle (apex at top center).
 */
function hitTestTriangle(localPoint: WorldPoint, element: CanvasElement): boolean {
  const x0 = element.x + element.width / 2;
  const y0 = element.y;
  const x1 = element.x;
  const y1 = element.y + element.height;
  const x2 = element.x + element.width;
  const y2 = element.y + element.height;

  const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (denom === 0) return false;

  const a = ((y1 - y2) * (localPoint.x - x2) + (x2 - x1) * (localPoint.y - y2)) / denom;
  const b = ((y2 - y0) * (localPoint.x - x2) + (x0 - x2) * (localPoint.y - y2)) / denom;
  const c = 1 - a - b;

  return a >= 0 && a <= 1 && b >= 0 && b <= 1 && c >= 0 && c <= 1;
}

export function getDefaultCurveControlPoint(p1: WorldPoint, p2: WorldPoint): WorldPoint {
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return { x: mx, y: my };
  const nx = -dy / dist;
  const ny = dx / dist;
  const offset = dist * 0.15;
  return { x: mx + nx * offset, y: my + ny * offset };
}

function hitTestArrow(point: WorldPoint, element: CanvasElement, threshold = 8): boolean {
  const arrow = element as any;
  const pts: { x: number; y: number }[] = arrow.points || [];
  if (pts.length < 2) return false;

  const first = pts[0];
  const last = pts[pts.length - 1];

  if (arrow.routing === 'curved') {
    const cp = arrow.controlPoint || getDefaultCurveControlPoint(first, last);
    let prev = first;
    const STEPS = 16;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const cur = {
        x: (1 - t) * (1 - t) * first.x + 2 * (1 - t) * t * cp.x + t * t * last.x,
        y: (1 - t) * (1 - t) * first.y + 2 * (1 - t) * t * cp.y + t * t * last.y,
      };
      if (distToSegment(point, prev, cur) <= threshold) {
        return true;
      }
      prev = cur;
    }
    return false;
  }

  if (arrow.routing === 'orthogonal') {
    const midX = (first.x + last.x) / 2;
    const p1 = first;
    const p2 = { x: midX, y: first.y };
    const p3 = { x: midX, y: last.y };
    const p4 = last;
    return (
      distToSegment(point, p1, p2) <= threshold ||
      distToSegment(point, p2, p3) <= threshold ||
      distToSegment(point, p3, p4) <= threshold
    );
  }

  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(point, pts[i], pts[i + 1]) <= threshold) {
      return true;
    }
  }
  return false;
}

function hitTestLine(localPoint: WorldPoint, element: CanvasElement, threshold = 8): boolean {
  return (
    distToSegment(
      localPoint,
      { x: element.x, y: element.y },
      { x: element.x + element.width, y: element.y + element.height }
    ) <= threshold
  );
}

/**
 * High-precision analytic hit-testing dispatcher.
 */
export function hitTestElement(
  point: WorldPoint,
  element: CanvasElement,
  threshold = 6
): boolean {
  if (element.type === 'arrow') {
    return hitTestArrow(point, element, threshold + 2);
  }

  const localPoint = toLocalPoint(point, element);

  switch (element.type) {
    case 'rectangle':
    case 'component':
    case 'text':
    case 'sticky':
      return hitTestRectangle(localPoint, element, threshold);
    case 'freehand':
      return hitTestFreehand(localPoint, element as any, threshold);
    case 'line':
      return hitTestLine(localPoint, element, threshold + 2);
    case 'ellipse':
      return hitTestEllipse(localPoint, element, threshold);
    case 'diamond':
      return hitTestDiamond(localPoint, element, threshold);
    case 'triangle':
      return hitTestTriangle(localPoint, element);
    default:
      return hitTestRectangle(localPoint, element, threshold);
  }
}

/**
 * Hit-tests the 8 resize handles + 1 rotation handle in screen space for a selected element.
 */
export function hitTestSelectionHandle(
  screenPoint: ScreenPoint,
  element: CanvasElement,
  viewport: ViewportTransform
): ResizeHandle | null {
  if (element.type === 'arrow' || element.locked) return null;

  const p1 = worldToScreen({ x: element.x, y: element.y }, viewport);
  const p2 = worldToScreen(
    { x: element.x + element.width, y: element.y + element.height },
    viewport
  );

  const minX = Math.min(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const width = Math.abs(p2.x - p1.x);
  const height = Math.abs(p2.y - p1.y);
  const midX = minX + width / 2;
  const midY = minY + height / 2;

  const handles: Array<{ id: ResizeHandle; x: number; y: number }> = [
    { id: 'nw', x: minX - 4, y: minY - 4 },
    { id: 'n', x: midX, y: minY - 4 },
    { id: 'ne', x: minX + width + 4, y: minY - 4 },
    { id: 'e', x: minX + width + 4, y: midY },
    { id: 'se', x: minX + width + 4, y: minY + height + 4 },
    { id: 's', x: midX, y: minY + height + 4 },
    { id: 'sw', x: minX - 4, y: minY + height + 4 },
    { id: 'w', x: minX - 4, y: midY },
    { id: 'rotate', x: midX, y: minY - 24 },
  ];

  const HIT_RADIUS = 8;
  for (const h of handles) {
    if (Math.hypot(screenPoint.x - h.x, screenPoint.y - h.y) <= HIT_RADIUS) {
      return h.id;
    }
  }
  return null;
}

export type ArrowHandle = 'arrow-start' | 'arrow-end' | 'arrow-mid';

/**
 * Hit-tests the start, end, and midpoint handles of a selected arrow in screen space.
 */
export function hitTestArrowHandle(
  screenPoint: ScreenPoint,
  element: CanvasElement,
  viewport: ViewportTransform
): ArrowHandle | null {
  if (element.type !== 'arrow' || element.locked) return null;

  const arrow = element as any;
  const pts: { x: number; y: number }[] = arrow.points || [];
  if (pts.length < 2) return null;

  const first = pts[0];
  const last = pts[pts.length - 1];
  const mid =
    arrow.routing === 'curved'
      ? (arrow.controlPoint || getDefaultCurveControlPoint(first, last))
      : { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };

  const screenStart = worldToScreen(first, viewport);
  const screenEnd = worldToScreen(last, viewport);
  const screenMid = worldToScreen(mid, viewport);

  const HIT_RADIUS = 10;

  if (Math.hypot(screenPoint.x - screenStart.x, screenPoint.y - screenStart.y) <= HIT_RADIUS) {
    return 'arrow-start';
  }
  if (Math.hypot(screenPoint.x - screenEnd.x, screenPoint.y - screenEnd.y) <= HIT_RADIUS) {
    return 'arrow-end';
  }
  if (Math.hypot(screenPoint.x - screenMid.x, screenPoint.y - screenMid.y) <= HIT_RADIUS) {
    return 'arrow-mid';
  }

  return null;
}
