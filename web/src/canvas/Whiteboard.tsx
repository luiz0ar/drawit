import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import { Board, Group, BoardApi, GroupApi } from '../lib/api';
import { useAutosave } from '../features/editor/useAutosave';
import { BoardHeader } from '../features/boards/BoardHeader';
import { BoardDrawer } from '../features/boards/BoardDrawer';
import { ConflictDialog } from '../features/boards/ConflictDialog';

export const Whiteboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

  const { resolvedTheme, setTheme } = useTheme();

  // Active Tool & Canvas State
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [viewport, setViewport] = useState<ViewportTransform>({
    panX: 0,
    panY: 0,
    zoom: 1.0,
  });
  const [selectedCount, setSelectedCount] = useState<number>(0);

  // Boards & Groups State
  const [boards, setBoards] = useState<Board[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [isTrashView, setIsTrashView] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [serverRevision, setServerRevision] = useState<number>(1);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);

  // OCC Autosave Hook
  const {
    status: saveStatus,
    conflictServerRevision,
    scheduleSave,
    resolveConflictByOverwrite,
  } = useAutosave({
    boardId: activeBoard?.id || null,
    initialRevision: serverRevision,
    onConflict: () => {
      setIsConflictDialogOpen(true);
    },
  });

  // Load Boards & Groups on mount
  const refreshBoardList = useCallback(async (trash = false) => {
    try {
      const [fetchedBoards, fetchedGroups] = await Promise.all([
        BoardApi.list(trash),
        GroupApi.list(),
      ]);
      setBoards(fetchedBoards);
      setGroups(fetchedGroups);
      return fetchedBoards;
    } catch {
      // Offline or mock mode for standalone preview
      const fallback: Board = {
        id: 'local-board-1',
        owner_id: 'local',
        group_id: null,
        title: 'Quadro-1',
        tags: [],
        is_favorite: false,
        thumbnail: null,
        is_deleted: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setBoards([fallback]);
      return [fallback];
    }
  }, []);

  // Load board scene
  const loadBoardScene = useCallback(async (board: Board) => {
    setActiveBoard(board);
    try {
      const scene = await BoardApi.getScene(board.id);
      setServerRevision(scene.revision);
      if (engineRef.current) {
        engineRef.current.setElements(scene.elements || []);
        if (scene.viewport) {
          const vp = {
            panX: scene.viewport.pan_x,
            panY: scene.viewport.pan_y,
            zoom: scene.viewport.zoom || 1.0,
          };
          engineRef.current.setViewport(vp);
          setViewport(vp);
        }
      }
    } catch {
      // Fallback empty scene
      setServerRevision(1);
      if (engineRef.current) {
        engineRef.current.setElements([]);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshBoardList(false).then((loadedBoards) => {
      if (loadedBoards.length > 0 && !activeBoard) {
        loadBoardScene(loadedBoards[0]);
      }
    });
  }, [refreshBoardList, loadBoardScene]);

  // Canvas engine initialization
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new CanvasEngine(canvasRef.current, {
      onSelectionChange: (ids) => {
        setSelectedCount(ids.length);
      },
      onViewportChange: (vp) => {
        setViewport({ ...vp });
        scheduleSave(engine.getElements(), vp);
      },
      onElementsChange: (elements) => {
        setActiveTool('select');
        scheduleSave(elements, engine.getViewport());
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
  }, [scheduleSave]);

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
    const vp = engineRef.current.getViewport();
    const newZoom = clampZoom(vp.zoom * factor);

    const rect = canvasRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const worldX = (cx - vp.panX) / vp.zoom;
    const worldY = (cy - vp.panY) / vp.zoom;

    const newVp: ViewportTransform = {
      panX: cx - worldX * newZoom,
      panY: cy - worldY * newZoom,
      zoom: newZoom,
    };

    engineRef.current.setViewport(newVp);
    setViewport(newVp);
    scheduleSave(engineRef.current.getElements(), newVp);
  };

  const handleResetZoom = () => {
    if (!engineRef.current) return;
    const newVp: ViewportTransform = { panX: 0, panY: 0, zoom: 1.0 };
    engineRef.current.setViewport(newVp);
    setViewport(newVp);
    scheduleSave(engineRef.current.getElements(), newVp);
  };

  const handleDelete = () => {
    if (engineRef.current) {
      engineRef.current.deleteSelected();
    }
  };

  // Board management actions
  const handleTitleChange = async (newTitle: string) => {
    if (!activeBoard) return;
    try {
      const updated = await BoardApi.update(activeBoard.id, { title: newTitle });
      setActiveBoard(updated);
      setBoards((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch {
      setActiveBoard({ ...activeBoard, title: newTitle });
    }
  };

  const handleCreateBoard = async (title: string, groupId?: string | null) => {
    try {
      const newBoard = await BoardApi.create(title, groupId);
      setBoards((prev) => [newBoard, ...prev]);
      await loadBoardScene(newBoard);
      setIsSidebarOpen(false);
    } catch (err) {
      console.error('Failed to create board:', err);
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    try {
      await BoardApi.delete(boardId);
      const remaining = boards.filter((b) => b.id !== boardId);
      setBoards(remaining);
      if (activeBoard?.id === boardId) {
        if (remaining.length > 0) {
          loadBoardScene(remaining[0]);
        } else {
          setActiveBoard(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete board:', err);
    }
  };

  const handleRestoreBoard = async (boardId: string) => {
    try {
      await BoardApi.restore(boardId);
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
    } catch (err) {
      console.error('Failed to restore board:', err);
    }
  };

  const handleCreateGroup = async (name: string) => {
    try {
      const group = await GroupApi.create(name);
      setGroups((prev) => [...prev, group]);
    } catch (err) {
      console.error('Failed to create group:', err);
    }
  };

  const handleDeleteGroup = async (groupId: string, action: 'move' | 'trash') => {
    try {
      await GroupApi.delete(groupId, action);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      refreshBoardList(isTrashView);
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  const handleToggleTrashView = (showTrash: boolean) => {
    setIsTrashView(showTrash);
    refreshBoardList(showTrash);
  };

  const handleReloadConflict = () => {
    if (activeBoard) {
      loadBoardScene(activeBoard);
    }
    setIsConflictDialogOpen(false);
  };

  const handleOverwriteConflict = async () => {
    if (engineRef.current) {
      await resolveConflictByOverwrite(
        engineRef.current.getElements(),
        engineRef.current.getViewport()
      );
    }
    setIsConflictDialogOpen(false);
  };

  const currentGroupName = groups.find((g) => g.id === activeBoard?.group_id)?.name;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background select-none">
      {/* Top Left: Board Header with Inline Rename & Save Status */}
      <div className="absolute top-4 left-4 z-20">
        <BoardHeader
          title={activeBoard?.title || 'Quadro-1'}
          groupName={currentGroupName}
          saveStatus={saveStatus}
          isTrashView={isTrashView}
          onTitleChange={handleTitleChange}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          onResolveConflict={() => setIsConflictDialogOpen(true)}
        />
      </div>

      {/* Boards & Folders Drawer */}
      <BoardDrawer
        isOpen={isSidebarOpen}
        currentBoardId={activeBoard?.id || null}
        boards={boards}
        groups={groups}
        isTrashView={isTrashView}
        onClose={() => setIsSidebarOpen(false)}
        onSelectBoard={(id) => {
          const target = boards.find((b) => b.id === id);
          if (target) {
            loadBoardScene(target);
            setIsSidebarOpen(false);
          }
        }}
        onCreateBoard={handleCreateBoard}
        onDeleteBoard={handleDeleteBoard}
        onRestoreBoard={handleRestoreBoard}
        onCreateGroup={handleCreateGroup}
        onDeleteGroup={handleDeleteGroup}
        onToggleTrashView={handleToggleTrashView}
      />

      {/* OCC Concurrency Conflict Dialog */}
      <ConflictDialog
        isOpen={isConflictDialogOpen}
        serverRevision={conflictServerRevision}
        onReload={handleReloadConflict}
        onOverwrite={handleOverwriteConflict}
        onClose={() => setIsConflictDialogOpen(false)}
      />

      {/* Floating Centered Toolbar: Strictly Lucide Icons (Zero Emojis) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 p-1.5 rounded-xl border bg-card/95 backdrop-blur shadow-md text-foreground">
        {/* Navigation Tools */}
        <button
          title="Select / Pointer (V)"
          onClick={() => handleToolSelect('select')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'select' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <MousePointer2 className="w-4 h-4" />
        </button>

        <button
          title="Hand / Pan (H or Space+Drag)"
          onClick={() => handleToolSelect('hand')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'hand' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <Hand className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-border mx-1" />

        {/* 2D Geometric Primitives */}
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
          title="Ellipse / Circle (O)"
          onClick={() => handleToolSelect('ellipse')}
          className={`p-2 rounded hover:bg-muted transition-colors ${
            activeTool === 'ellipse' ? 'bg-primary text-primary-foreground' : ''
          }`}
        >
          <Circle className="w-4 h-4" />
        </button>

        <button
          title="Diamond / Decision (D)"
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
