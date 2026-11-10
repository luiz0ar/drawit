import { describe, it, expect } from 'vitest';
import {
  exportToJsonString,
  parseAndValidateDrawitJson,
} from '../jsonExporter';
import { computeSceneBounds, exportToSvgString } from '../imageExporter';
import { CanvasElement } from '../../engine/types';

describe('Exporters', () => {
  const dummyElements: CanvasElement[] = [
    {
      id: 'rect1',
      type: 'rectangle',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      rotation: 0,
      zIndex: 1,
      groupIds: [],
      locked: false,
      style: {
        strokeColor: '#000000',
        fillColor: '#ffffff',
        strokeWidth: 2,
        strokeStyle: 'solid',
        opacity: 100,
        effect: { type: 'none', intensity: 0 },
      },
      version: 1,
    },
  ];

  describe('JSON Exporter', () => {
    it('exports and validates .drawit schema', () => {
      const vp = { panX: 0, panY: 0, zoom: 1 };
      const jsonStr = exportToJsonString('Test Board', dummyElements, vp);

      const parsed = parseAndValidateDrawitJson(jsonStr);
      expect(parsed.valid).toBe(true);
      expect(parsed.data?.app).toBe('drawit');
      expect(parsed.data?.version).toBe(1);
      expect(parsed.data?.boardTitle).toBe('Test Board');
      expect(parsed.data?.scene.elements.length).toBe(1);
    });

    it('rejects invalid or corrupted json', () => {
      expect(parseAndValidateDrawitJson('{ invalid json').valid).toBe(false);
      expect(parseAndValidateDrawitJson('{"app": "other"}').valid).toBe(false);
      expect(parseAndValidateDrawitJson('{"app": "drawit", "version": 99}').valid).toBe(false);
    });
  });

  describe('SVG Exporter', () => {
    it('computes scene bounds with padding', () => {
      const bounds = computeSceneBounds(dummyElements, 20);
      expect(bounds.minX).toBe(80);
      expect(bounds.minY).toBe(80);
      expect(bounds.maxX).toBe(320);
      expect(bounds.maxY).toBe(270);
      expect(bounds.width).toBe(240);
      expect(bounds.height).toBe(190);
    });

    it('generates well-formed SVG string with elements', () => {
      const svg = exportToSvgString(dummyElements, { background: '#f8fafc' });
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('<rect');
      expect(svg).toContain('fill="#f8fafc"');
      expect(svg).toContain('</svg>');
    });
  });
});

