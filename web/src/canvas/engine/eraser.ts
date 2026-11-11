import { CanvasElement } from './types';
import { WorldPoint, ViewportTransform, worldToScreen } from './coordinates';
import { hitTestElement } from './hitTest';
import { computeAnchorWorldPosition } from './anchors';

/**
 * Checks if two line segments (p1-p2 and p3-p4) intersect.
 */
function lineSegmentsIntersect(
  p1: WorldPoint,
  p2: WorldPoint,
  p3: WorldPoint,
  p4: WorldPoint
): boolean {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-9) return false;

  const dx = p3.x - p1.x;
  const dy = p3.y - p1.y;

  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Gets bounding box of an arbitrary canvas element.
 */
function getElementBounds(element: CanvasElement): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (element.type === 'arrow') {
    const pts: { x: number; y: number }[] = (element as any).points || [];
    if (pts.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
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
    return { minX, minY, maxX, maxY };
  }

  if (element.type === 'freehand') {
    const pts: [number, number, number?][] = (element as any).points || [];
    if (pts.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
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
    return { minX, minY, maxX, maxY };
  }

  const left = Math.min(element.x, element.x + element.width);
  const right = Math.max(element.x, element.x + element.width);
  const top = Math.min(element.y, element.y + element.height);
  const labelExtra =
    element.type === 'component' && Boolean((element as any).label) ? 24 : 0;
  const bottom = Math.max(element.y, element.y + element.height) + labelExtra;

  return { minX: left, minY: top, maxX: right, maxY: bottom };
}

/**
 * Gets polygon boundary segments of an element in world coordinates.
 */
function getElementBoundarySegments(element: CanvasElement): Array<[WorldPoint, WorldPoint]> {
  if (element.type === 'arrow') {
    const pts: { x: number; y: number }[] = (element as any).points || [];
    const segments: Array<[WorldPoint, WorldPoint]> = [];
    for (let i = 0; i < pts.length - 1; i++) {
      segments.push([pts[i], pts[i + 1]]);
    }
    return segments;
  }

  if (element.type === 'line') {
    return [
      [
        { x: element.x, y: element.y },
        { x: element.x + element.width, y: element.y + element.height },
      ],
    ];
  }

  const x1 = element.x;
  const y1 = element.y;
  const x2 = element.x + element.width;
  const y2 = element.y + element.height;

  if (element.type === 'triangle') {
    const top = { x: (x1 + x2) / 2, y: y1 };
    const bl = { x: x1, y: y2 };
    const br = { x: x2, y: y2 };
    return [
      [top, bl],
      [bl, br],
      [br, top],
    ];
  }

  if (element.type === 'diamond') {
    const top = { x: (x1 + x2) / 2, y: y1 };
    const right = { x: x2, y: (y1 + y2) / 2 };
    const bottom = { x: (x1 + x2) / 2, y: y2 };
    const left = { x: x1, y: (y1 + y2) / 2 };
    return [
      [top, right],
      [right, bottom],
      [bottom, left],
      [left, top],
    ];
  }

  // Rectangles, components, stickies, text
  const tl = { x: x1, y: y1 };
  const tr = { x: x2, y: y1 };
  const br = { x: x2, y: y2 };
  const bl = { x: x1, y: y2 };

  return [
    [tl, tr],
    [tr, br],
    [br, bl],
    [bl, tl],
  ];
}

/**
 * Checks if a movement segment (p1 to p2) intersects or hits a canvas element.
 * Handles fast mouse sweeps, shape boundaries, and internal hits.
 */
export function hitTestSegmentVsElement(
  p1: WorldPoint,
  p2: WorldPoint,
  element: CanvasElement,
  threshold = 6
): boolean {
  if (element.locked) return false;

  const bounds = getElementBounds(element);
  const segMinX = Math.min(p1.x, p2.x) - threshold;
  const segMaxX = Math.max(p1.x, p2.x) + threshold;
  const segMinY = Math.min(p1.y, p2.y) - threshold;
  const segMaxY = Math.max(p1.y, p2.y) + threshold;

  // Fast bounding-box rejection
  if (
    segMaxX < bounds.minX - threshold ||
    segMinX > bounds.maxX + threshold ||
    segMaxY < bounds.minY - threshold ||
    segMinY > bounds.maxY + threshold
  ) {
    return false;
  }

  // 1. Direct hit-test at endpoints
  if (
    hitTestElement(p1, element, threshold) ||
    hitTestElement(p2, element, threshold)
  ) {
    return true;
  }

  // 2. Direct edge-crossing intersection
  const edges = getElementBoundarySegments(element);
  for (const [edgeP1, edgeP2] of edges) {
    if (lineSegmentsIntersect(p1, p2, edgeP1, edgeP2)) {
      return true;
    }
  }

  // 3. Adaptive sampling along segment for curves, freehand strokes, and ellipses
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const step = Math.max(4, threshold);
  const steps = Math.ceil(dist / step);

  if (steps > 1) {
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const pt: WorldPoint = {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      };
      if (hitTestElement(pt, element, threshold)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detaches arrows connected to deleted elements, freezing their world anchor positions.
 */
export function detachBoundArrows(
  elements: CanvasElement[],
  deletedIds: Set<string>
): void {
  for (const el of elements) {
    if (el.type === 'arrow') {
      const arrow = el as any;
      if (arrow.startBinding && deletedIds.has(arrow.startBinding.elementId)) {
        const shape = elements.find((e) => e.id === arrow.startBinding.elementId);
        if (shape) {
          const pos = computeAnchorWorldPosition(shape, arrow.startBinding.anchor);
          if (arrow.points && arrow.points.length > 0) {
            arrow.points[0] = pos;
          }
        }
        arrow.startBinding = undefined;
      }
      if (arrow.endBinding && deletedIds.has(arrow.endBinding.elementId)) {
        const shape = elements.find((e) => e.id === arrow.endBinding.elementId);
        if (shape) {
          const pos = computeAnchorWorldPosition(shape, arrow.endBinding.anchor);
          if (arrow.points && arrow.points.length > 1) {
            arrow.points[arrow.points.length - 1] = pos;
          }
        }
        arrow.endBinding = undefined;
      }
    }
  }
}

/**
 * Renders the smooth glowing/fading eraser trail path on top of the canvas.
 */
export function renderEraserTrail(
  ctx: CanvasRenderingContext2D,
  trail: WorldPoint[],
  viewport: ViewportTransform
): void {
  if (trail.length < 2) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
  ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
  ctx.lineWidth = Math.max(3, 4 * Math.min(1.5, viewport.zoom));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  const first = worldToScreen(trail[0], viewport);
  ctx.moveTo(first.x, first.y);

  for (let i = 1; i < trail.length; i++) {
    const pt = worldToScreen(trail[i], viewport);
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();

  // Eraser head indicator
  const last = worldToScreen(trail[trail.length - 1], viewport);
  ctx.beginPath();
  ctx.arc(last.x, last.y, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Excalidraw-style crisp eraser SVG cursor with bottom-left hotspot.
 */
export const ERASER_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23ef4444' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21'/%3E%3Cpath d='M22 21H7'/%3E%3Cpath d='m5 11 9 9'/%3E%3C/svg%3E") 3 21, crosshair`;

