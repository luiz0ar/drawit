export type ElementType =
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'text'
  | 'sticky'
  | 'freehand'
  | 'component';

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export interface ElementEffect {
  type: 'none' | 'neon' | 'blur' | 'shadow';
  intensity: number;
  color?: string;
}

export interface ElementStyle {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number; // 0 to 100
  effect: ElementEffect;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // In radians
  zIndex: number;
  groupIds: string[];
  locked: boolean;
  style: ElementStyle;
  version: number;
  label?: string;
  fontSize?: number;
}

export interface GeometricElement extends BaseElement {
  type: 'rectangle' | 'ellipse' | 'diamond' | 'triangle' | 'line' | 'sticky';
}

export interface ArrowElement extends BaseElement {
  type: 'arrow';
  points: { x: number; y: number }[];
  controlPoint?: { x: number; y: number };
  startBinding?: { elementId: string; anchor: string };
  endBinding?: { elementId: string; anchor: string };
  startArrowhead?: 'none' | 'arrow' | 'dot';
  endArrowhead?: 'none' | 'arrow' | 'dot';
  routing: 'straight' | 'curved' | 'orthogonal';
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontFamily: 'sans' | 'serif' | 'mono';
  fontSize: number;
  textAlign: 'left' | 'center' | 'right';
}

export interface FreehandElement extends BaseElement {
  type: 'freehand';
  points: [number, number, number?][]; // [x, y, pressure?]
}

export interface ComponentElement extends BaseElement {
  type: 'component';
  componentKey: string;
  label: string;
}

export type CanvasElement =
  | GeometricElement
  | ArrowElement
  | TextElement
  | FreehandElement
  | ComponentElement;

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function getElementBoundingBox(element: CanvasElement): BoundingBox {
  if (element.type === 'arrow') {
    const pts = (element as ArrowElement).points || [];
    if (pts.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { minX, minY, maxX, maxY };
    }
  }

  if (element.type === 'freehand') {
    const pts = (element as FreehandElement).points || [];
    if (pts.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [px, py] of pts) {
        const wx = element.x + px;
        const wy = element.y + py;
        if (wx < minX) minX = wx;
        if (wy < minY) minY = wy;
        if (wx > maxX) maxX = wx;
        if (wy > maxY) maxY = wy;
      }
      const pad = (element.style.strokeWidth || 2) * 2;
      return {
        minX: minX - pad,
        minY: minY - pad,
        maxX: maxX + pad,
        maxY: maxY + pad,
      };
    }
  }

  const minX = Math.min(element.x, element.x + element.width);
  const maxX = Math.max(element.x, element.x + element.width);
  const minY = Math.min(element.y, element.y + element.height);
  const maxY = Math.max(element.y, element.y + element.height);

  return { minX, minY, maxX, maxY };
}
