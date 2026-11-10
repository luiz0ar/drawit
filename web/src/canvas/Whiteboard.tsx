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
  Search,
  Download,
  HelpCircle,
  Copy,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { CanvasEngine, Tool } from './engine/CanvasEngine';
import { ViewportTransform, clampZoom } from './engine/coordinates';
import { useTheme } from '../context/ThemeContext';
import { Board, Group, BoardApi, GroupApi } from '../lib/api';
import { useAutosave } from '../features/editor/useAutosave';
import { BoardHeader } from '../features/boards/BoardHeader';
import { BoardDrawer } from '../features/boards/BoardDrawer';
import { ConflictDialog } from '../features/boards/ConflictDialog';
import { CommandPalette } from '../features/palette/CommandPalette';
import { ShortcutsModal } from '../features/palette/ShortcutsModal';
import {
  downloadPngFile,
  downloadSvgFile,
} from './export/imageExporter';
import {
  downloadJsonFile,
  parseAndValidateDrawitJson,
} from './export/jsonExporter';

export const Whiteboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { resolvedTheme, setTheme } = useTheme();

  // Active Tool & Canvas State
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [viewport, setViewport] = useState<ViewportTransform>({
    panX: 0,
    panY: 0,
    zoom: 1.0,
  });
  const [selectedCount, setSelectedCount] = useState<number>(0);

  // Modals & Panels State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);

  // Boards & Groups State
  const [boards, setBoards] = useState<Board[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [isTrashView, setIsTrashView] = useState(false);
  const [serverRevision, setServerRevision] = useState<number>(1);

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

  // Global Keyboard Shortcuts (Ctrl+K for Command Palette, ? for Shortcuts)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

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

  // Layer Ordering & Grouping actions
  const handleGroupSelected = () => {
    engineRef.current?.groupSelected();
  };

  const handleUngroupSelected = () => {
    engineRef.current?.ungroupSelected();
  };

  const handleBringToFront = () => {
    engineRef.current?.bringToFront();
  };

  const handleSendToBack = () => {
    engineRef.current?.sendToBack();
  };

  // Export & Import actions
  const boardTitle = activeBoard?.title || 'Quadro-1';
  const bgColor = resolvedTheme === 'dark' ? '#090d16' : '#ffffff';

  const handleExportPng = async () => {
    if (!engineRef.current) return;
    setIsExportMenuOpen(false);
    await downloadPngFile(boardTitle, engineRef.current.getElements(), {
      scale: 2,
      background: bgColor,
    });
  };

  const handleExportSvg = () => {
    if (!engineRef.current) return;
    setIsExportMenuOpen(false);
    downloadSvgFile(boardTitle, engineRef.current.getElements(), {
      background: bgColor,
    });
  };

  const handleExportJson = () => {
    if (!engineRef.current) return;
    setIsExportMenuOpen(false);
    downloadJsonFile(
      boardTitle,
      boardTitle,
      engineRef.current.getElements(),
      engineRef.current.getViewport()
    );
  };

  const handleImportJson = () => {
    setIsExportMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = parseAndValidateDrawitJson(content);
      if (res.valid && res.data && engineRef.current) {
        engineRef.current.setElements(res.data.scene.elements);
        if (res.data.scene.viewport) {
          engineRef.current.setViewport(res.data.scene.viewport);
          setViewport(res.data.scene.viewport);
        }
        scheduleSave(res.data.scene.elements, engineRef.current.getViewport());
      } else {
        alert(res.error || 'Failed to import .drawit file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
      {/* Hidden file input for .drawit JSON Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".drawit,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Top Left: Board Header with Inline Rename & Save Status */}
      <div className="absolute top-4 left-4 z-20">
        <BoardHeader
          title={boardTitle}
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

      {/* Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTool={handleToolSelect}
        onResetZoom={handleResetZoom}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onGroupSelected={handleGroupSelected}
        onUngroupSelected={handleUngroupSelected}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
      />

      {/* Keyboard Shortcuts Modal (?) */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
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
              title="Group Selected (Ctrl+G)"
              onClick={handleGroupSelected}
              className="p-2 rounded hover:bg-muted text-foreground transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>

            <button
              title="Bring to Front (Ctrl+])"
              onClick={handleBringToFront}
              className="p-2 rounded hover:bg-muted text-foreground transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              title="Send to Back (Ctrl+[)"
              onClick={handleSendToBack}
              className="p-2 rounded hover:bg-muted text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

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

      {/* Top Right Controls: Command Palette, Export, Help & Theme */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {/* Command Palette Trigger */}
        <button
          title="Command Palette (Ctrl+K)"
          onClick={() => setIsCommandPaletteOpen(true)}
          className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border bg-card/95 backdrop-blur shadow-sm hover:bg-muted text-foreground text-xs font-medium transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-muted text-muted-foreground border ml-1">
            Ctrl+K
          </kbd>
        </button>

        {/* Export Dropdown Trigger */}
        <div className="relative">
          <button
            title="Export & Portability"
            onClick={() => setIsExportMenuOpen((prev) => !prev)}
            className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border bg-card/95 backdrop-blur shadow-sm hover:bg-muted text-foreground text-xs font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>

          {isExportMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border bg-card/95 backdrop-blur shadow-xl py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={handleExportPng}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors flex items-center justify-between"
              >
                <span>Export as PNG (2x)</span>
                <span className="text-[10px] text-muted-foreground font-mono">HiDPI</span>
              </button>
              <button
                onClick={handleExportSvg}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors flex items-center justify-between"
              >
                <span>Export as SVG</span>
                <span className="text-[10px] text-muted-foreground font-mono">Vector</span>
              </button>
              <div className="h-[1px] bg-border my-1" />
              <button
                onClick={handleExportJson}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors flex items-center justify-between"
              >
                <span>Save as .drawit JSON</span>
              </button>
              <button
                onClick={handleImportJson}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors flex items-center justify-between"
              >
                <span>Import .drawit file...</span>
              </button>
            </div>
          )}
        </div>

        {/* Shortcuts Cheat Sheet Trigger */}
        <button
          title="Keyboard Shortcuts (?)"
          onClick={() => setIsShortcutsOpen(true)}
          className="p-2 rounded-lg border bg-card/95 backdrop-blur shadow-sm hover:bg-muted text-foreground transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Theme Toggle */}
        <button
          title="Toggle Theme"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg border bg-card/95 backdrop-blur shadow-sm hover:bg-muted text-foreground transition-colors"
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
