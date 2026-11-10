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

    const GRID_SIZE = 20;
    const scaledGrid = GRID_SIZE * viewport.zoom;

    if (scaledGrid > 8) {
      const offsetX = ((viewport.panX % scaledGrid) + scaledGrid) % scaledGrid;
      const offsetY = ((viewport.panY % scaledGrid) + scaledGrid) % scaledGrid;

      ctx.fillStyle =
        theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';

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

  private applyEffect(element: CanvasElement) {
    const ctx = this.ctx;
    const eff = element.style?.effect;
    if (!eff || eff.type === 'none') {
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      return;
    }

    if (eff.type === 'neon') {
      ctx.shadowColor = eff.color || element.style.strokeColor || '#3b82f6';
      ctx.shadowBlur = Math.max(8, eff.intensity || 14);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else if (eff.type === 'shadow') {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
      ctx.shadowBlur = Math.max(6, eff.intensity || 10);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;
    }
  }

  /**
   * Renders an arrow connector with straight, orthogonal (Manhattan), or curved routing.
   */
  public renderArrow(element: CanvasElement) {
    const ctx = this.ctx;
    const arrow = element as any;
    const pts: { x: number; y: number }[] = arrow.points || [];
    if (pts.length < 2) return;

    ctx.save();
    this.applyEffect(element);
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

    const first = pts[0];
    const last = pts[pts.length - 1];
    let headAngle = Math.atan2(last.y - first.y, last.x - first.x);

    ctx.beginPath();
    ctx.moveTo(first.x, first.y);

    if (arrow.routing === 'orthogonal') {
      const midX = (first.x + last.x) / 2;
      ctx.lineTo(midX, first.y);
      ctx.lineTo(midX, last.y);
      ctx.lineTo(last.x, last.y);
      headAngle = Math.atan2(0, last.x - midX);
    } else if (arrow.routing === 'curved') {
      const midX = (first.x + last.x) / 2;
      ctx.bezierCurveTo(midX, first.y, midX, last.y, last.x, last.y);
      headAngle = Math.atan2(last.y - first.y, last.x - midX);
    } else {
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      const prev = pts[pts.length - 2];
      headAngle = Math.atan2(last.y - prev.y, last.x - prev.x);
    }

    ctx.stroke();

    // Arrowhead at end
    const HEAD_LEN = 12;
    ctx.setLineDash([]);
    ctx.fillStyle = element.style.strokeColor;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(
      last.x - HEAD_LEN * Math.cos(headAngle - Math.PI / 6),
      last.y - HEAD_LEN * Math.sin(headAngle - Math.PI / 6)
    );
    ctx.lineTo(
      last.x - HEAD_LEN * Math.cos(headAngle + Math.PI / 6),
      last.y - HEAD_LEN * Math.sin(headAngle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();

    // Optional label on arrow midpoint
    if (element.label) {
      const mx = (first.x + last.x) / 2;
      const my = (first.y + last.y) / 2;
      ctx.font = '600 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const metrics = ctx.measureText(element.label);
      const pad = 6;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(
        mx - metrics.width / 2 - pad,
        my - 10,
        metrics.width + pad * 2,
        20
      );
      ctx.fillStyle = '#ffffff';
      ctx.fillText(element.label, mx, my);
    }

    ctx.restore();
  }

  private renderCenteredText(
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    fontSize = 14
  ) {
    if (!text) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = `500 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = text.split('\n');
    const lineHeight = fontSize * 1.3;
    const totalHeight = lines.length * lineHeight;
    const startY = y + h / 2 - totalHeight / 2 + lineHeight / 2;

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x + w / 2, startY + i * lineHeight, Math.max(20, w - 12));
    }
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

    // Styling & Effects
    this.applyEffect(element);
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
        ctx.roundRect
          ? ctx.roundRect(element.x, element.y, element.width, element.height, 6)
          : ctx.rect(element.x, element.y, element.width, element.height);
        if (element.style.fillColor !== 'transparent') ctx.fill();
        ctx.stroke();
        if (element.label) {
          this.renderCenteredText(
            element.label,
            element.x,
            element.y,
            element.width,
            element.height,
            element.style.strokeColor
          );
        }
        break;

      case 'sticky': {
        const fold = 16;
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle =
          element.style.fillColor && element.style.fillColor !== 'transparent'
            ? element.style.fillColor
            : '#fef08a';
        ctx.beginPath();
        ctx.moveTo(element.x, element.y);
        ctx.lineTo(element.x + element.width - fold, element.y);
        ctx.lineTo(element.x + element.width, element.y + fold);
        ctx.lineTo(element.x + element.width, element.y + element.height);
        ctx.lineTo(element.x, element.y + element.height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Corner fold crease
        ctx.beginPath();
        ctx.moveTo(element.x + element.width - fold, element.y);
        ctx.lineTo(element.x + element.width - fold, element.y + fold);
        ctx.lineTo(element.x + element.width, element.y + fold);
        ctx.stroke();

        this.renderCenteredText(
          element.label || 'Sticky note',
          element.x + 8,
          element.y + 8,
          element.width - 16,
          element.height - 16,
          '#1e293b',
          14
        );
        break;
      }

      case 'ellipse':
        ctx.beginPath();
        const rx = Math.abs(element.width) / 2;
        const ry = Math.abs(element.height) / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (element.style.fillColor !== 'transparent') ctx.fill();
        ctx.stroke();
        if (element.label) {
          this.renderCenteredText(
            element.label,
            element.x,
            element.y,
            element.width,
            element.height,
            element.style.strokeColor
          );
        }
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
        if (element.label) {
          this.renderCenteredText(
            element.label,
            element.x,
            element.y,
            element.width,
            element.height,
            element.style.strokeColor
          );
        }
        break;

      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(cx, element.y);
        ctx.lineTo(element.x + element.width, element.y + element.height);
        ctx.lineTo(element.x, element.y + element.height);
        ctx.closePath();
        if (element.style.fillColor !== 'transparent') ctx.fill();
        ctx.stroke();
        if (element.label) {
          this.renderCenteredText(
            element.label,
            element.x,
            element.y + element.height * 0.2,
            element.width,
            element.height * 0.8,
            element.style.strokeColor
          );
        }
        break;

      case 'line':
        ctx.beginPath();
        ctx.moveTo(element.x, element.y);
        ctx.lineTo(element.x + element.width, element.y + element.height);
        ctx.stroke();
        break;

      case 'freehand': {
        const pts: [number, number, number?][] = (element as any).points || [];
        if (pts.length > 1) {
          ctx.beginPath();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.moveTo(element.x + pts[0][0], element.y + pts[0][1]);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(element.x + pts[i][0], element.y + pts[i][1]);
          }
          ctx.stroke();
        }
        break;
      }

      case 'component': {
        const comp = IT_COMPONENTS[(element as any).componentKey];
        if (comp) {
          comp.draw(ctx, element.x, element.y, element.width, element.height);
        } else {
          ctx.strokeRect(element.x, element.y, element.width, element.height);
        }

        if ((element as any).label) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = element.style.strokeColor;
          ctx.font = '600 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(
            (element as any).label,
            element.x + element.width / 2,
            element.y + element.height + 6
          );
        }
        break;
      }

      case 'text': {
        ctx.shadowBlur = 0;
        ctx.fillStyle = element.style.strokeColor;
        const fontSize = (element as any).fontSize || 16;
        const fontFamily =
          (element as any).fontFamily === 'mono'
            ? 'monospace'
            : (element as any).fontFamily === 'serif'
            ? 'serif'
            : 'sans-serif';
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        const content = (element as any).text || element.label || 'Text';
        const lines = String(content).split('\n');
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], element.x, element.y + i * (fontSize * 1.3));
        }
        break;
      }
    }

    ctx.restore();
  }

  /**
   * Renders the interactive bounding box, 8 resize handles, and rotation stem for selected elements.
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
    const midX = minX + width / 2;
    const midY = minY + height / 2;

    const accent = element.locked ? '#f59e0b' : '#2563eb';

    // Selection border
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(minX - 4, minY - 4, width + 8, height + 8);
    ctx.setLineDash([]);

    if (!element.locked) {
      // Rotation stem at top center
      ctx.beginPath();
      ctx.moveTo(midX, minY - 4);
      ctx.lineTo(midX, minY - 24);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(midX, minY - 24, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 8 resize handles (4 corners + 4 midpoints)
      const HANDLE_SIZE = 7;
      const handles = [
        { x: minX - 4, y: minY - 4 },
        { x: midX, y: minY - 4 },
        { x: minX + width + 4, y: minY - 4 },
        { x: minX + width + 4, y: midY },
        { x: minX + width + 4, y: minY + height + 4 },
        { x: midX, y: minY + height + 4 },
        { x: minX - 4, y: minY + height + 4 },
        { x: minX - 4, y: midY },
      ];

      for (const h of handles) {
        ctx.fillRect(
          h.x - HANDLE_SIZE / 2,
          h.y - HANDLE_SIZE / 2,
          HANDLE_SIZE,
          HANDLE_SIZE
        );
        ctx.strokeRect(
          h.x - HANDLE_SIZE / 2,
          h.y - HANDLE_SIZE / 2,
          HANDLE_SIZE,
          HANDLE_SIZE
        );
      }
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

  /**
   * Renders the area selection marquee rectangle in screen space.
   */
  public renderMarquee(
    marquee: { startX: number; startY: number; currentX: number; currentY: number },
    viewport: ViewportTransform
  ) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const p1 = worldToScreen({ x: marquee.startX, y: marquee.startY }, viewport);
    const p2 = worldToScreen({ x: marquee.currentX, y: marquee.currentY }, viewport);

    const minX = Math.min(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const width = Math.abs(p2.x - p1.x);
    const height = Math.abs(p2.y - p1.y);

    ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    ctx.fillRect(minX, minY, width, height);
    ctx.strokeRect(minX, minY, width, height);

    ctx.restore();
  }
}
