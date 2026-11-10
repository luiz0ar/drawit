import { CanvasElement } from '../engine/types';
import { ViewportTransform } from '../engine/coordinates';

export interface DrawitFileSchema {
  version: 1;
  app: 'drawit';
  createdAt: string;
  boardTitle: string;
  scene: {
    schemaVersion: number;
    elements: CanvasElement[];
    viewport: ViewportTransform;
  };
}

export function exportToJsonString(
  boardTitle: string,
  elements: CanvasElement[],
  viewport: ViewportTransform
): string {
  const data: DrawitFileSchema = {
    version: 1,
    app: 'drawit',
    createdAt: new Date().toISOString(),
    boardTitle,
    scene: {
      schemaVersion: 1,
      elements,
      viewport,
    },
  };
  return JSON.stringify(data, null, 2);
}

export function downloadJsonFile(
  filename: string,
  boardTitle: string,
  elements: CanvasElement[],
  viewport: ViewportTransform
): void {
  const json = exportToJsonString(boardTitle, elements, viewport);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.drawit') ? filename : `${filename}.drawit`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseAndValidateDrawitJson(jsonString: string): {
  valid: boolean;
  data?: DrawitFileSchema;
  error?: string;
} {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Invalid JSON format.' };
    }
    if (parsed.app !== 'drawit') {
      return { valid: false, error: 'Not a valid drawit file.' };
    }
    if (parsed.version !== 1) {
      return { valid: false, error: `Unsupported schema version: ${parsed.version}` };
    }
    if (!parsed.scene || !Array.isArray(parsed.scene.elements)) {
      return { valid: false, error: 'Missing or corrupt scene elements.' };
    }
    return { valid: true, data: parsed as DrawitFileSchema };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'JSON parse error.' };
  }
}

