import { CanvasElement } from './types';
import { WorldPoint } from './coordinates';

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

/**
 * Checks if a point hits a rectangle.
 */
function hitTestRectangle(localPoint: WorldPoint, element: CanvasElement, threshold = 6): boolean {
  const left = Math.min(element.x, element.x + element.width);
  const right = Math.max(element.x, element.x + element.width);
  const top = Math.min(element.y, element.y + element.height);
  const bottom = Math.max(element.y, element.y + element.height);

  const isFilled = element.style.fillColor !== 'transparent' && element.style.fillColor !== '';

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
  const isFilled = element.style.fillColor !== 'transparent' && element.style.fillColor !== '';

  if (isFilled) {
    return normDist <= 1.05; // slightly lenient
  }

  // Stroke tolerance
  const outerNorm = (dx * dx) / ((rx + threshold) * (rx + threshold)) + (dy * dy) / ((ry + threshold) * (ry + threshold));
  const innerNorm = (dx * dx) / (Math.max(1, rx - threshold) * Math.max(1, rx - threshold)) + (dy * dy) / (Math.max(1, ry - threshold) * Math.max(1, ry - threshold));

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
  const isFilled = element.style.fillColor !== 'transparent' && element.style.fillColor !== '';

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

  // Barycentric coordinates
  const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (denom === 0) return false;

  const a = ((y1 - y2) * (localPoint.x - x2) + (x2 - x1) * (localPoint.y - y2)) / denom;
  const b = ((y2 - y0) * (localPoint.x - x2) + (x0 - x2) * (localPoint.y - y2)) / denom;
  const c = 1 - a - b;

  return a >= 0 && a <= 1 && b >= 0 && b <= 1 && c >= 0 && c <= 1;
}

/**
 * High-precision analytic hit-testing dispatcher.
 */
export function hitTestElement(
  point: WorldPoint,
  element: CanvasElement,
  threshold = 6
): boolean {
  const localPoint = toLocalPoint(point, element);

  switch (element.type) {
    case 'rectangle':
    case 'component':
    case 'text':
      return hitTestRectangle(localPoint, element, threshold);
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

