export interface WorldPoint {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ViewportTransform {
  panX: number;
  panY: number;
  zoom: number; // Clamp between 0.1 (10%) and 8.0 (800%)
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8.0;

/**
 * Converts screen point (in canvas pixels) to world coordinates (virtual plane).
 */
export function screenToWorld(
  screenPoint: ScreenPoint,
  viewport: ViewportTransform
): WorldPoint {
  return {
    x: (screenPoint.x - viewport.panX) / viewport.zoom,
    y: (screenPoint.y - viewport.panY) / viewport.zoom,
  };
}

/**
 * Converts world point (virtual plane) to screen coordinates (canvas pixels).
 */
export function worldToScreen(
  worldPoint: WorldPoint,
  viewport: ViewportTransform
): ScreenPoint {
  return {
    x: worldPoint.x * viewport.zoom + viewport.panX,
    y: worldPoint.y * viewport.zoom + viewport.panY,
  };
}

/**
 * Clamps a zoom level between MIN_ZOOM and MAX_ZOOM.
 */
export function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

/**
 * Calculates new viewport when zooming anchored at a specific screen point.
 * Preserves the invariant: the world point under the cursor remains at the same screen point.
 */
export function zoomAtPoint(
  anchorScreenPoint: ScreenPoint,
  currentViewport: ViewportTransform,
  newZoom: number
): ViewportTransform {
  const targetZoom = clampZoom(newZoom);
  if (targetZoom === currentViewport.zoom) {
    return currentViewport;
  }

  // World point under cursor before zoom
  const worldPoint = screenToWorld(anchorScreenPoint, currentViewport);

  // New pan coordinates so worldPoint projects to the exact same screenPoint
  const nextPanX = anchorScreenPoint.x - worldPoint.x * targetZoom;
  const nextPanY = anchorScreenPoint.y - worldPoint.y * targetZoom;

  return {
    panX: nextPanX,
    panY: nextPanY,
    zoom: targetZoom,
  };
}

/**
 * Normalizes wheel delta across browsers (Firefox lines/pages vs Chrome pixels).
 */
export function normalizeWheelDelta(e: WheelEvent): number {
  const LINE_HEIGHT = 20;
  const PAGE_HEIGHT = 500;

  if (e.deltaMode === 1) {
    // Delta in lines
    return e.deltaY * LINE_HEIGHT;
  }
  if (e.deltaMode === 2) {
    // Delta in pages
    return e.deltaY * PAGE_HEIGHT;
  }
  return e.deltaY;
}

