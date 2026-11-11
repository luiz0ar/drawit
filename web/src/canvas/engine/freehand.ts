import { getStroke, StrokeOptions } from 'perfect-freehand';
import { FreehandElement } from './types';
import { WorldPoint } from './coordinates';

/**
 * Returns calibrated stroke options matching Excalidraw's pencil/freedraw aesthetic.
 */
export function getFreeDrawOptions(strokeWidth: number, isComplete = false): StrokeOptions {
  // Excalidraw strokeWidth scaling:
  // thin (1px) -> ~4px size
  // medium (2px) -> ~7-8px size
  // bold (4px) -> ~14px size
  // extra-bold (6px) -> ~21px size
  const size = Math.max(3, strokeWidth * 3.5);

  return {
    size,
    thinning: 0.6,
    smoothing: 0.55,
    streamline: 0.55,
    simulatePressure: true,
    easing: (t: number) => Math.sin((t * Math.PI) / 2),
    start: {
      taper: Math.max(4, size * 0.8),
      cap: true,
    },
    end: {
      taper: Math.max(4, size * 0.8),
      cap: true,
    },
    last: isComplete,
  };
}

/**
 * Computes the polygon outline points for a freehand stroke using perfect-freehand.
 */
export function getFreeDrawStrokePoints(
  points: [number, number, number?][],
  options?: StrokeOptions
): number[][] {
  if (points.length === 0) return [];
  return getStroke(points as [number, number, number][], options);
}

/**
 * Converts stroke polygon vertices into a native HTML5 Path2D instance
 * using quadratic midpoint curve interpolation for smooth ink rendering.
 */
export function getFreeDrawPath2D(stroke: number[][]): Path2D {
  if (typeof Path2D === 'undefined') {
    return {} as Path2D;
  }
  const path = new Path2D();
  if (stroke.length === 0) return path;

  if (stroke.length < 4) {
    path.moveTo(stroke[0][0], stroke[0][1]);
    for (let i = 1; i < stroke.length; i++) {
      path.lineTo(stroke[i][0], stroke[i][1]);
    }
    path.closePath();
    return path;
  }

  path.moveTo(stroke[0][0], stroke[0][1]);
  for (let i = 0; i < stroke.length; i++) {
    const p0 = stroke[i];
    const p1 = stroke[(i + 1) % stroke.length];
    const midX = (p0[0] + p1[0]) / 2;
    const midY = (p0[1] + p1[1]) / 2;
    path.quadraticCurveTo(p0[0], p0[1], midX, midY);
  }
  path.closePath();
  return path;
}

/**
 * Converts stroke polygon vertices into an SVG path data string (`d` attribute).
 */
export function getFreeDrawSvgPath(stroke: number[][], closed = true): string {
  if (stroke.length === 0) return '';

  if (stroke.length < 4) {
    let d = `M ${stroke[0][0].toFixed(2)} ${stroke[0][1].toFixed(2)}`;
    for (let i = 1; i < stroke.length; i++) {
      d += ` L ${stroke[i][0].toFixed(2)} ${stroke[i][1].toFixed(2)}`;
    }
    if (closed) d += ' Z';
    return d;
  }

  let d = `M ${stroke[0][0].toFixed(2)} ${stroke[0][1].toFixed(2)}`;
  for (let i = 0; i < stroke.length; i++) {
    const p0 = stroke[i];
    const p1 = stroke[(i + 1) % stroke.length];
    const midX = (p0[0] + p1[0]) / 2;
    const midY = (p0[1] + p1[1]) / 2;
    d += ` Q ${p0[0].toFixed(2)} ${p0[1].toFixed(2)}, ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }
  if (closed) d += ' Z';
  return d;
}

/**
 * Normalizes freehand element points on stroke completion:
 * recalculates true bounding box (minX, minY, width, height) and shifts all points
 * to local non-negative coordinates.
 */
export function normalizeFreehandPoints(element: FreehandElement): void {
  const pts = element.points;
  if (!pts || pts.length === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  // If already at (0, 0) and width/height are positive, just update dimensions
  element.x += minX;
  element.y += minY;
  element.width = Math.max(1, maxX - minX);
  element.height = Math.max(1, maxY - minY);

  // Shift points relative to new (element.x, element.y)
  element.points = pts.map(([x, y, pressure]) => [
    x - minX,
    y - minY,
    pressure ?? 0.5,
  ]);
}

/**
 * Scales freehand element points proportionally when resizing the element.
 */
export function scaleFreehandPoints(
  element: FreehandElement,
  initialElement: FreehandElement,
  newWidth: number,
  newHeight: number
): void {
  const origW = Math.max(1, initialElement.width);
  const origH = Math.max(1, initialElement.height);

  const scaleX = newWidth / origW;
  const scaleY = newHeight / origH;

  element.points = initialElement.points.map(([x, y, pressure]) => [
    x * scaleX,
    y * scaleY,
    pressure ?? 0.5,
  ]);
  element.width = newWidth;
  element.height = newHeight;
}

/**
 * Distance from point p to segment [a, b].
 */
function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * (bx - ax);
  const projY = ay + t * (by - ay);
  return Math.hypot(px - projX, py - projY);
}

/**
 * Accurate proximity hit-testing for freehand strokes.
 * Tests distance from local point to each line segment of the stroke.
 */
export function hitTestFreehand(
  localPoint: WorldPoint,
  element: FreehandElement,
  threshold = 6
): boolean {
  const pts = element.points;
  if (!pts || pts.length === 0) return false;

  const strokeWidth = element.style.strokeWidth || 2;
  const hitRadius = threshold + strokeWidth * 2;

  // Single-point dot case
  if (pts.length === 1) {
    const [x, y] = pts[0];
    const dotX = element.x + x;
    const dotY = element.y + y;
    return Math.hypot(localPoint.x - dotX, localPoint.y - dotY) <= hitRadius + 4;
  }

  // Multi-point stroke: check proximity to each line segment
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = element.x + pts[i][0];
    const ay = element.y + pts[i][1];
    const bx = element.x + pts[i + 1][0];
    const by = element.y + pts[i + 1][1];

    if (distToSegment(localPoint.x, localPoint.y, ax, ay, bx, by) <= hitRadius) {
      return true;
    }
  }

  return false;
}
