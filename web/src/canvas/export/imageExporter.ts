import { CanvasElement } from '../engine/types';
import { IT_COMPONENTS } from '../engine/components';

export interface ExportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function computeSceneBounds(elements: CanvasElement[], padding = 20): ExportBounds {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, maxX: 400, maxY: 300, width: 400, height: 300 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    if (el.type === 'arrow') {
      const arrow = el as any;
      if (Array.isArray(arrow.points)) {
        for (const pt of arrow.points) {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        }
      }
    } else {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
  }

  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(10, maxX - minX),
    height: Math.max(10, maxY - minY),
  };
}

export function exportToSvgString(
  elements: CanvasElement[],
  options: { background?: string; padding?: number } = {}
): string {
  const padding = options.padding ?? 20;
  const bounds = computeSceneBounds(elements, padding);
  const bg = options.background;

  let svgContent = '';

  if (bg && bg !== 'transparent') {
    svgContent += `  <rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="${bg}" />\n`;
  }

  for (const el of elements) {
    const stroke = el.style?.strokeColor || '#0f172a';
    const fill = el.style?.fillColor || '#ffffff';
    const strokeWidth = el.style?.strokeWidth || 2;
    const opacity = (el.style?.opacity ?? 100) / 100;

    switch (el.type) {
      case 'rectangle':
        svgContent += `  <rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />\n`;
        if (el.label) {
          const fontSize = (el as any).fontSize || 14;
          svgContent += `  <text x="${el.x + el.width / 2}" y="${el.y + el.height / 2 + fontSize / 3}" font-family="sans-serif" font-size="${fontSize}" font-weight="500" text-anchor="middle" fill="${stroke}">${el.label}</text>\n`;
        }
        break;

      case 'sticky': {
        const fontSize = (el as any).fontSize || 14;
        svgContent += `  <rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="4" fill="${fill === 'transparent' ? '#fef08a' : fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />\n`;
        if (el.label) {
          svgContent += `  <text x="${el.x + el.width / 2}" y="${el.y + el.height / 2 + fontSize / 3}" font-family="sans-serif" font-size="${fontSize}" font-weight="500" text-anchor="middle" fill="#1e293b">${el.label}</text>\n`;
        }
        break;
      }

      case 'ellipse': {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const rx = el.width / 2;
        const ry = el.height / 2;
        svgContent += `  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />\n`;
        if (el.label) {
          const fontSize = (el as any).fontSize || 14;
          svgContent += `  <text x="${cx}" y="${cy + fontSize / 3}" font-family="sans-serif" font-size="${fontSize}" font-weight="500" text-anchor="middle" fill="${stroke}">${el.label}</text>\n`;
        }
        break;
      }

      case 'diamond': {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const points = `${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}`;
        svgContent += `  <polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />\n`;
        if (el.label) {
          const fontSize = (el as any).fontSize || 14;
          svgContent += `  <text x="${cx}" y="${cy + fontSize / 3}" font-family="sans-serif" font-size="${fontSize}" font-weight="500" text-anchor="middle" fill="${stroke}">${el.label}</text>\n`;
        }
        break;
      }

      case 'triangle': {
        const points = `${el.x + el.width / 2},${el.y} ${el.x + el.width},${el.y + el.height} ${el.x},${el.y + el.height}`;
        svgContent += `  <polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />\n`;
        if (el.label) {
          const fontSize = (el as any).fontSize || 14;
          svgContent += `  <text x="${el.x + el.width / 2}" y="${el.y + el.height * 0.6}" font-family="sans-serif" font-size="${fontSize}" font-weight="500" text-anchor="middle" fill="${stroke}">${el.label}</text>\n`;
        }
        break;
      }

      case 'arrow': {
        const arrow = el as any;
        if (Array.isArray(arrow.points) && arrow.points.length >= 2) {
          const d = arrow.points.reduce(
            (acc: string, pt: { x: number; y: number }, idx: number) =>
              idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`,
            ''
          );
          svgContent += `  <path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" />\n`;
        }
        break;
      }

      case 'component': {
        const comp = el as any;
        const compKey = comp.componentKey || comp.componentType;
        const def = IT_COMPONENTS[compKey as keyof typeof IT_COMPONENTS];
        const labelText = comp.label || def?.name || '';
        const fontSize = (el as any).fontSize || 12;
        svgContent += `  <g transform="translate(${el.x}, ${el.y})">\n`;
        svgContent += `    <rect width="${el.width}" height="${el.height}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />\n`;
        if (labelText) {
          svgContent += `    <text x="${el.width / 2}" y="${el.height + 16}" font-family="sans-serif" font-size="${fontSize}" font-weight="600" text-anchor="middle" fill="${stroke}">${labelText}</text>\n`;
        }
        svgContent += `  </g>\n`;
        break;
      }

      case 'text': {
        const fontSize = (el as any).fontSize || 20;
        const fontFamily =
          (el as any).fontFamily === 'mono'
            ? 'monospace'
            : (el as any).fontFamily === 'serif'
            ? 'serif'
            : 'sans-serif';
        const content = (el as any).text !== undefined ? (el as any).text : (el.label || '');
        const lines = String(content).split('\n');
        svgContent += `  <g transform="translate(${el.x}, ${el.y})" opacity="${opacity}">\n`;
        for (let i = 0; i < lines.length; i++) {
          svgContent += `    <text x="0" y="${(i + 1) * fontSize}" font-family="${fontFamily}" font-size="${fontSize}" fill="${stroke}">${lines[i]}</text>\n`;
        }
        svgContent += `  </g>\n`;
        break;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}" width="${bounds.width}" height="${bounds.height}">\n${svgContent}</svg>`;
}

export function downloadSvgFile(
  filename: string,
  elements: CanvasElement[],
  options: { background?: string } = {}
): void {
  const svg = exportToSvgString(elements, options);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadPngFile(
  filename: string,
  elements: CanvasElement[],
  options: { scale?: number; background?: string } = {}
): Promise<void> {
  const scale = options.scale ?? 2; // Default 2x HiDPI
  const bounds = computeSceneBounds(elements, 20);

  const canvas = document.createElement('canvas');
  canvas.width = bounds.width * scale;
  canvas.height = bounds.height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas context unavailable'));

  ctx.scale(scale, scale);
  ctx.translate(-bounds.minX, -bounds.minY);

  if (options.background && options.background !== 'transparent') {
    ctx.fillStyle = options.background;
    ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
  }

  // Draw SVG image onto canvas
  const svg = exportToSvgString(elements, options);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();

  return new Promise<void>((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, bounds.minX, bounds.minY, bounds.width, bounds.height);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to generate PNG blob'));
          return;
        }
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
        resolve();
      }, 'image/png');
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
