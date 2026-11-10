import { CanvasElement } from './types';
import { WorldPoint, ScreenPoint, ViewportTransform, worldToScreen } from './coordinates';

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
 * Checks if a point hits a rectangle.
 */
function hitTestRectangle(localPoint: WorldPoint, element: CanvasElement, threshold = 6): boolean {
  const left = Math.min(element.x, element.x + element.width);
  const right = Math.max(element.x, element.x + element.width);
  const top = Math.min(element.y, element.y + element.height);
  const bottom = Math.max(element.y, element.y + element.height);

  const isFilled =
    (element.style.fillColor !== 'transparent' && element.style.fillColor !== '') ||
    element.type === 'component' ||
    element.type === 'text' ||
    element.type === 'sticky' ||
    Boolean(element.label);

  if (isFilled) {
    return (
      localPoint.x >= left - threshold &&
      localPoint.x <= right + threshold &&
      localPoint.y >= top - threshold &&
      localPoint.y <= bottom + threshold
    );
  }

  // If transparent, hit test on the boundary stroke only
  const onVerticalBorder =
    (Math.abs(localPoint.x - left) <= threshold || Math.abs(localPoint.x - right) <= threshold) &&
    localPoint.y >= top - threshold &&
    localPoint.y <= bottom + threshold;

  const onHorizontalBorder =
    (Math.abs(localPoint.y - top) <= threshold || Math.abs(localPoint.y - bottom) <= threshold) &&
    localPoint.x >= left - threshold &&
    localPoint.x <= right + threshold;

  return onVerticalBorder || onHorizontalBorder;
}

/**
 * Checks if a point hits an ellipse.
 */
function hitTestEllipse(localPoint: WorldPoint, element: CanvasElement, threshold = 6): boolean {
  const rx = Math.abs(element.width) / 2;
  const ry = Math.abs(element.height) / 2;
  if (rx === 0 || ry === 0) return false;

  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;

  const dx = localPoint.x - cx;
  const dy = localPoint.y - cy;

  const normDist = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  const isFilled =
    (element.style.fillColor !== 'transparent' && element.style.fillColor !== '') ||
    Boolean(element.label);

  if (isFilled) {
    return normDist <= 1.05;
  }

  const outerNorm =
    (dx * dx) / ((rx + threshold) * (rx + threshold)) +
    (dy * dy) / ((ry + threshold) * (ry + threshold));
  const innerNorm =
    (dx * dx) / (Math.max(1, rx - threshold) * Math.max(1, rx - threshold)) +
    (dy * dy) / (Math.max(1, ry - threshold) * Math.max(1, ry - threshold));

  return outerNorm <= 1.0 && innerNorm >= 1.0;
}

/**
 * Checks if a point hits a diamond using L1 norm.
 */
function hitTestDiamond(localPoint: WorldPoint, element: CanvasElement, threshold = 6): boolean {
  const rx = Math.abs(element.width) / 2;
  const ry = Math.abs(element.height) / 2;
  if (rx === 0 || ry === 0) return false;

  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;

  const l1Norm = Math.abs(localPoint.x - cx) / rx + Math.abs(localPoint.y - cy) / ry;
  const isFilled =
    (element.style.fillColor !== 'transparent' && element.style.fillColor !== '') ||
    Boolean(element.label);

  if (isFilled) {
    return l1Norm <= 1.05;
  }

  const strokeThresholdNorm = threshold / Math.min(rx, ry);
  return Math.abs(l1Norm - 1.0) <= strokeThresholdNorm;
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

function hitTestArrow(point: WorldPoint, element: CanvasElement, threshold = 8): boolean {
  const pts: { x: number; y: number }[] = (element as any).points || [];
  if (pts.length < 2) return false;
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
    case 'freehand':
      return hitTestRectangle(localPoint, element, threshold);
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
