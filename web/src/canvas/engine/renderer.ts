import { CanvasElement } from './types';
import { ViewportTransform, worldToScreen } from './coordinates';
import { IT_COMPONENTS } from './components';
import { getElementAnchors } from './anchors';

/**
 * High-performance imperative 2D renderer.
 */
export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /**
   * Clears the viewport and renders background grid pattern.
   */
  public clearAndRenderGrid(
    viewport: ViewportTransform,
    width: number,
    height: number,
    theme: 'dark' | 'light' = 'light'
  ) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Grid dots
    const GRID_SIZE = 20;
    const scaledGrid = GRID_SIZE * viewport.zoom;

    if (scaledGrid > 8) {
      const offsetX = (viewport.panX % scaledGrid + scaledGrid) % scaledGrid;
      const offsetY = (viewport.panY % scaledGrid + scaledGrid) % scaledGrid;

      ctx.fillStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';

      for (let x = offsetX; x < width; x += scaledGrid) {
        for (let y = offsetY; y < height; y += scaledGrid) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  /**
   * Sets up world coordinate transformation matrix.
   */
  public applyViewport(viewport: ViewportTransform) {
    this.ctx.setTransform(
      viewport.zoom,
      0,
      0,
      viewport.zoom,
      viewport.panX,
      viewport.panY
    );
  }

  /**
   * Renders magnetic snap anchors on an active target element.
   */
  public renderMagneticAnchors(element: CanvasElement, activeAnchor?: string) {
    const ctx = this.ctx;
    const anchors = getElementAnchors(element);

    for (const a of anchors) {
      ctx.save();
      const isHovered = activeAnchor === a.position;
      ctx.fillStyle = isHovered ? '#2563eb' : '#3b82f6';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(a.point.x, a.point.y, isHovered ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Renders an arrow connector with arrowhead.
   */
  public renderArrow(element: CanvasElement) {
    const ctx = this.ctx;
    const arrow = element as any;
    const pts = arrow.points || [];
    if (pts.length < 2) return;

    ctx.save();
    ctx.strokeStyle = element.style.strokeColor;
    ctx.lineWidth = element.style.strokeWidth;
    ctx.globalAlpha = element.style.opacity / 100;

    if (element.style.strokeStyle === 'dashed') {
      ctx.setLineDash([8, 6]);
    } else if (element.style.strokeStyle === 'dotted') {
      ctx.setLineDash([2, 4]);
    } else {
      ctx.setLineDash([]);
    }

    // Path
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // Arrowhead at end
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
    const HEAD_LEN = 12;

    ctx.fillStyle = element.style.strokeColor;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(
      last.x - HEAD_LEN * Math.cos(angle - Math.PI / 6),
      last.y - HEAD_LEN * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      last.x - HEAD_LEN * Math.cos(angle + Math.PI / 6),
      last.y - HEAD_LEN * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  /**
   * Renders a single element on the canvas.
   */
  public renderElement(element: CanvasElement) {
    if (element.type === 'arrow') {
      this.renderArrow(element);
      return;
    }

    const ctx = this.ctx;
    ctx.save();

    // Rotation around element center
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;

    ctx.translate(cx, cy);
    if (element.rotation) {
      ctx.rotate(element.rotation);
    }
    ctx.translate(-cx, -cy);

    // Styling
    ctx.strokeStyle = element.style.strokeColor;
    ctx.lineWidth = element.style.strokeWidth;
    ctx.globalAlpha = element.style.opacity / 100;

    if (element.style.strokeStyle === 'dashed') {
      ctx.setLineDash([8, 6]);
    } else if (element.style.strokeStyle === 'dotted') {
      ctx.setLineDash([2, 4]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.fillStyle = element.style.fillColor;

    switch (element.type) {
      case 'rectangle':
        ctx.beginPath();
        ctx.rect(element.x, element.y, element.width, element.height);
        if (element.style.fillColor !== 'transparent') ctx.fill();
        ctx.stroke();
        break;

      case 'ellipse':
        ctx.beginPath();
        const rx = Math.abs(element.width) / 2;
        const ry = Math.abs(element.height) / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (element.style.fillColor !== 'transparent') ctx.fill();
        ctx.stroke();
        break;

      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(cx, element.y);
        ctx.lineTo(element.x + element.width, cy);
        ctx.lineTo(cx, element.y + element.height);
        ctx.lineTo(element.x, cy);
        ctx.closePath();
        if (element.style.fillColor !== 'transparent') ctx.fill();
        ctx.stroke();
        break;

      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(cx, element.y);
        ctx.lineTo(element.x + element.width, element.y + element.height);
        ctx.lineTo(element.x, element.y + element.height);
        ctx.closePath();
        if (element.style.fillColor !== 'transparent') ctx.fill();
        ctx.stroke();
        break;

      case 'line':
        ctx.beginPath();
        ctx.moveTo(element.x, element.y);
        ctx.lineTo(element.x + element.width, element.y + element.height);
        ctx.stroke();
        break;

      case 'component':
        const comp = IT_COMPONENTS[(element as any).componentKey];
        if (comp) {
          comp.draw(ctx, element.x, element.y, element.width, element.height);
        } else {
          ctx.strokeRect(element.x, element.y, element.width, element.height);
        }

        // Render component label under icon
        if ((element as any).label) {
          ctx.fillStyle = element.style.strokeColor;
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(
            (element as any).label,
            element.x + element.width / 2,
            element.y + element.height + 16
          );
        }
        break;

      case 'text':
        ctx.fillStyle = element.style.strokeColor;
        ctx.font = `${(element as any).fontSize || 16}px sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText((element as any).text || '', element.x, element.y);
        break;
    }

    ctx.restore();
  }

  /**
   * Renders the interactive bounding box and transform handles for selected elements.
   */
  public renderSelectionBox(
    element: CanvasElement,
    viewport: ViewportTransform
  ) {
    if (element.type === 'arrow') return;

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const p1 = worldToScreen({ x: element.x, y: element.y }, viewport);
    const p2 = worldToScreen(
      { x: element.x + element.width, y: element.y + element.height },
      viewport
    );

    const minX = Math.min(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const width = Math.abs(p2.x - p1.x);
    const height = Math.abs(p2.y - p1.y);

    // Selection border
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(minX - 4, minY - 4, width + 8, height + 8);

    // Corner resize handles
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;

    const HANDLE_SIZE = 8;
    const handles = [
      { x: minX - 4, y: minY - 4 },
      { x: minX + width + 4, y: minY - 4 },
      { x: minX - 4, y: minY + height + 4 },
      { x: minX + width + 4, y: minY + height + 4 },
    ];

    for (const h of handles) {
      ctx.fillRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    }

    ctx.restore();
  }

  /**
   * Renders dynamic smart alignment guides in screen space.
   */
  public renderAlignmentGuides(
    guides: Array<{ orientation: 'horizontal' | 'vertical'; pos: number }>,
    viewport: ViewportTransform,
    width: number,
    height: number
  ) {
    if (guides.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (const g of guides) {
      ctx.beginPath();
      if (g.orientation === 'vertical') {
        const screenX = g.pos * viewport.zoom + viewport.panX;
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, height);
      } else {
        const screenY = g.pos * viewport.zoom + viewport.panY;
        ctx.moveTo(0, screenY);
        ctx.lineTo(width, screenY);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}
