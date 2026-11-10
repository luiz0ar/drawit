import React, { useEffect, useRef, useState } from 'react';
import {
  MousePointer2,
  Hand,
  Square,
  Circle,
  Diamond,
  Triangle,
  Minus,
  ArrowRight,
  Database,
  Server,
  Globe,
  Layers,
  Cloud,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Sun,
  Moon,
} from 'lucide-react';
import { CanvasEngine, Tool } from './engine/CanvasEngine';
import { ViewportTransform, clampZoom } from './engine/coordinates';
import { useTheme } from '../context/ThemeContext';

export const Whiteboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

  const { resolvedTheme, setTheme } = useTheme();

  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [viewport, setViewport] = useState<ViewportTransform>({
    panX: 0,
    panY: 0,
    zoom: 1.0,
  });
  const [selectedCount, setSelectedCount] = useState<number>(0);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new CanvasEngine(canvasRef.current, {
      onSelectionChange: (ids) => {
        setSelectedCount(ids.length);
      },
      onViewportChange: (vp) => {
        setViewport({ ...vp });
      },
      onElementsChange: () => {
        setActiveTool('select');
      },
    });

    engine.setTheme(resolvedTheme);
    engineRef.current = engine;

    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = canvasRef.current.clientWidth;
        canvasRef.current.height = canvasRef.current.clientHeight;
        engine.setViewport(engine.getViewport());
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setTheme(resolvedTheme);
    }
  }, [resolvedTheme]);

  const handleToolSelect = (tool: Tool) => {
    setActiveTool(tool);
    if (engineRef.current) {
      engineRef.current.setTool(tool);
    }
  };

  const handleZoom = (factor: number) => {
    if (!engineRef.current || !canvasRef.current) return;
    const current = engineRef.current.getViewport();
    const newZoom = clampZoom(current.zoom * factor);

    const centerScreen = {
      x: canvasRef.current.clientWidth / 2,
      y: canvasRef.current.clientHeight / 2,
    };

    const nextVp = {
      ...current,
      panX: centerScreen.x - (centerScreen.x - current.panX) * (newZoom / current.zoom),
      panY: centerScreen.y - (centerScreen.y - current.panY) * (newZoom / current.zoom),
      zoom: newZoom,
    };

    engineRef.current.setViewport(nextVp);
  };

  const handleResetZoom = () => {
    if (!engineRef.current) return;
    engineRef.current.setViewport({ panX: 0, panY: 0, zoom: 1.0 });
  };

  const handleDelete = () => {
    if (engineRef.current) {
      engineRef.current.deleteSelected();
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background select-none">
      {/* Top Floating Toolbar with Market Standard Lucide Icons (Zero Emojis) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 p-1.5 rounded-lg border bg-card/95 backdrop-blur shadow-md text-foreground">
        {/* Navigation / Selection */}
        <button
          title="Select (V)"
          onClick={() => handleToolSelect('select')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'select' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <MousePointer2 className="w-4 h-4" />
        </button>

        <button
          title="Hand / Pan (H)"
          onClick={() => handleToolSelect('hand')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'hand' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <Hand className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-border mx-1" />

        {/* Geometric Shapes */}
        <button
          title="Rectangle (R)"
          onClick={() => handleToolSelect('rectangle')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'rectangle' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <Square className="w-4 h-4" />
        </button>

        <button
          title="Ellipse (O)"
          onClick={() => handleToolSelect('ellipse')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'ellipse' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <Circle className="w-4 h-4" />
        </button>

        <button
          title="Diamond (D)"
          onClick={() => handleToolSelect('diamond')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'diamond' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <Diamond className="w-4 h-4" />
        </button>

        <button
          title="Triangle"
          onClick={() => handleToolSelect('triangle')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'triangle' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <Triangle className="w-4 h-4" />
        </button>

        <button
          title="Line"
          onClick={() => handleToolSelect('line')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'line' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <Minus className="w-4 h-4" />
        </button>

        {/* Magnetic Connected Arrow */}
        <button
          title="Magnetic Arrow Connector (A)"
          onClick={() => handleToolSelect('arrow')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'arrow' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <ArrowRight className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-border mx-1" />

        {/* IT Architecture Native Components Library */}
        <button
          title="Database (SQL)"
          onClick={() => handleToolSelect('database')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'database' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <Database className="w-4 h-4" />
        </button>

        <button
          title="Server / Service"
          onClick={() => handleToolSelect('server')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'server' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <Server className="w-4 h-4" />
        </button>

        <button
          title="Web Client / Browser"
          onClick={() => handleToolSelect('browser')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'browser' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <Globe className="w-4 h-4" />
        </button>

        <button
          title="Message Queue"
          onClick={() => handleToolSelect('queue')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'queue' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <Layers className="w-4 h-4" />
        </button>

        <button
          title="Cloud"
          onClick={() => handleToolSelect('cloud')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'cloud' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <Cloud className="w-4 h-4" />
        </button>

        {selectedCount > 0 && (
          <>
            <div className="w-[1px] h-5 bg-border mx-1" />
            <button
              title="Delete Selected (Del)"
              onClick={handleDelete}
              className="p-2 rounded text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Bottom Left Navigation Controls: Zoom & Viewport */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 p-1 rounded-lg border bg-card/95 backdrop-blur shadow-md text-foreground text-xs font-medium">
        <button
          title="Zoom Out"
          onClick={() => handleZoom(0.8)}
          className="p-1.5 rounded hover:bg-muted transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <button
          title="Reset Zoom to 100%"
          onClick={handleResetZoom}
          className="px-2 py-1 rounded hover:bg-muted transition-colors font-mono"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>

        <button
          title="Zoom In"
          onClick={() => handleZoom(1.25)}
          className="p-1.5 rounded hover:bg-muted transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <div className="w-[1px] h-4 bg-border mx-1" />

        <button
          title="Reset View"
          onClick={handleResetZoom}
          className="p-1.5 rounded hover:bg-muted transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Top Right Controls: Theme Toggle */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <button
          title="Toggle Theme"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg border bg-card/95 backdrop-blur shadow-md hover:bg-muted text-foreground transition-colors"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Native Imperative Canvas 2D */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-crosshair active:cursor-grabbing"
      />
    </div>
  );
};
