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
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sun,
  Moon,
  Search,
  Download,
  HelpCircle,
  Undo2,
  Redo2,
  Type,
  StickyNote,
  PenTool,
  Eraser,
  Boxes,
  X,
} from 'lucide-react';
import { CanvasEngine, Tool } from './engine/CanvasEngine';
import { CanvasElement, ElementStyle } from './engine/types';
import { ViewportTransform, clampZoom } from './engine/coordinates';
import { IT_COMPONENTS, ComponentCategory } from './engine/components';
import { useTheme } from '../context/ThemeContext';
import { Board, Group, BoardApi, GroupApi } from '../lib/api';
import { navigate } from '../lib/router';
import { useAutosave, computeContentHash } from '../features/editor/useAutosave';
import { BoardHeader } from '../features/boards/BoardHeader';
import { BoardDrawer } from '../features/boards/BoardDrawer';
import { ConflictDialog } from '../features/boards/ConflictDialog';
import { CommandPalette } from '../features/palette/CommandPalette';
import { ShortcutsModal } from '../features/palette/ShortcutsModal';
import { StyleInspector } from './ui/StyleInspector';
import {
  downloadPngFile,
  downloadSvgFile,
} from './export/imageExporter';
import {
  downloadJsonFile,
  parseAndValidateDrawitJson,
} from './export/jsonExporter';

interface WhiteboardProps {
  boardId?: string;
}

const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  clients: 'Clients & Edge',
  backend: 'Backend & Compute',
  data: 'Data & Storage',
  messaging: 'Messaging & Streaming',
  infra: 'Infrastructure & Network',
};

export const Whiteboard: React.FC<WhiteboardProps> = ({ boardId }) => {
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
  const [selectedElements, setSelectedElements] = useState<CanvasElement[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Modals & Panels State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isComponentLibraryOpen, setIsComponentLibraryOpen] = useState(false);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);

  // In-place Text / Label Editor State (RF-E04)
  const [editingElement, setEditingElement] = useState<CanvasElement | null>(null);
  const [editingTextValue, setEditingTextValue] = useState('');

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
    setSavedHash,
  } = useAutosave({
    boardId: activeBoard?.id || null,
    initialRevision: serverRevision,
    onConflict: () => {
      setIsConflictDialogOpen(true);
    },
  });

  // Load Boards & Groups
  const refreshBoardList = useCallback(async (trash = false) => {
    try {
      const [fetchedBoards, fetchedGroups] = await Promise.all([
        BoardApi.list({ trash }),
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
  const loadBoardScene = useCallback(
    async (board: Board) => {
      setActiveBoard(board);
      try {
        const scene = await BoardApi.getScene(board.id);
        setServerRevision(scene.revision);
        if (engineRef.current) {
          const els = scene.elements || [];
          const vp = scene.viewport
            ? {
              panX: scene.viewport.pan_x,
              panY: scene.viewport.pan_y,
              zoom: scene.viewport.zoom || 1.0,
            }
            : { panX: 0, panY: 0, zoom: 1.0 };
          engineRef.current.setElements(els, true);
          engineRef.current.setViewport(vp);
          setViewport(vp);
          setSavedHash(computeContentHash(els, vp));
        }
      } catch {
        setServerRevision(1);
        if (engineRef.current) {
          engineRef.current.setElements([], true);
        }
      }
    },
    [setSavedHash]
  );

  // Initial load based on boardId prop or first board
  useEffect(() => {
    let mounted = true;
    refreshBoardList(false).then(async (loadedBoards) => {
      if (!mounted) return;
      if (boardId) {
        const found = loadedBoards.find((b) => b.id === boardId);
        if (found) {
          await loadBoardScene(found);
          return;
        }
        try {
          const single = await BoardApi.get(boardId);
          if (mounted) {
            await loadBoardScene(single);
          }
          return;
        } catch {
          // Fallback to first board
        }
      }
      if (loadedBoards.length > 0) {
        await loadBoardScene(loadedBoards[0]);
      }
    });
    return () => {
      mounted = false;
    };
  }, [boardId, refreshBoardList, loadBoardScene]);

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

  // Canvas engine initialization (runs once per mount since scheduleSave is stable)
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new CanvasEngine(canvasRef.current, {
      onSelectionChange: (_ids, els) => {
        setSelectedElements([...els]);
      },
      onViewportChange: (vp) => {
        setViewport({ ...vp });
        scheduleSave(engine.getElements(), vp);
      },
      onElementsChange: (elements) => {
        setActiveTool(engine.getTool());
        scheduleSave(elements, engine.getViewport());
      },
      onHistoryChange: (undoAvailable, redoAvailable) => {
        setCanUndo(undoAvailable);
        setCanRedo(redoAvailable);
      },
      onEditElementText: (el) => {
        setEditingElement(el);
        setEditingTextValue(
          el.type === 'text' ? (el as any).text || el.label || '' : el.label || ''
        );
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
    setIsComponentLibraryOpen(false);
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
    engineRef.current?.deleteSelected();
  };

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

  const handleUpdateStyle = (partial: Partial<ElementStyle>) => {
    engineRef.current?.updateSelectedStyle(partial);
  };

  const handleUpdateRouting = (routing: 'straight' | 'orthogonal' | 'curved') => {
    engineRef.current?.updateSelectedRouting(routing);
  };

  const handleToggleLock = () => {
    engineRef.current?.toggleLockSelected();
  };

  const handleDuplicateSelected = () => {
    engineRef.current?.copySelected();
    engineRef.current?.pasteClipboard();
  };

  const handleSaveEditedText = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingElement && engineRef.current) {
      engineRef.current.updateElementText(editingElement.id, editingTextValue.trim());
    }
    setEditingElement(null);
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
      setIsSidebarOpen(false);
      navigate(`/boards/${newBoard.id}`);
    } catch (err) {
      console.error('Failed to create board:', err);
    }
  };

  const handleDeleteBoard = async (targetBoardId: string) => {
    try {
      await BoardApi.delete(targetBoardId);
      const remaining = boards.filter((b) => b.id !== targetBoardId);
      setBoards(remaining);
      if (activeBoard?.id === targetBoardId) {
        if (remaining.length > 0) {
          navigate(`/boards/${remaining[0].id}`);
        } else {
          navigate('/boards');
        }
      }
    } catch (err) {
      console.error('Failed to delete board:', err);
    }
  };

  const handleRestoreBoard = async (targetBoardId: string) => {
    try {
      await BoardApi.restore(targetBoardId);
      setBoards((prev) => prev.filter((b) => b.id !== targetBoardId));
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

      {/* Top Left: Board Header with Back to Dashboard, Inline Rename & Save Status */}
      <div className="absolute top-4 left-4 z-20">
        <BoardHeader
          title={boardTitle}
          saveStatus={saveStatus}
          isTrashView={isTrashView}
          onTitleChange={handleTitleChange}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          onResolveConflict={() => setIsConflictDialogOpen(true)}
        />
      </div>

      {/* Boards & Folders Quick Drawer */}
      <BoardDrawer
        isOpen={isSidebarOpen}
        currentBoardId={activeBoard?.id || null}
        boards={boards}
        groups={groups}
        isTrashView={isTrashView}
        onClose={() => setIsSidebarOpen(false)}
        onSelectBoard={(id) => {
          setIsSidebarOpen(false);
          navigate(`/boards/${id}`);
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

      {/* Floating Style Inspector Panel when elements are selected (RNF-S02) */}
      <StyleInspector
        selectedElements={selectedElements}
        onUpdateStyle={handleUpdateStyle}
        onUpdateRouting={handleUpdateRouting}
        onEditText={(el) => {
          setEditingElement(el);
          setEditingTextValue(
            el.type === 'text' ? (el as any).text || el.label || '' : el.label || ''
          );
        }}
        onToggleLock={handleToggleLock}
        onDuplicate={handleDuplicateSelected}
        onGroup={handleGroupSelected}
        onUngroup={handleUngroupSelected}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
        onDelete={handleDelete}
      />

      {/* Responsive Floating Centered Toolbar (top-16 on medium viewports so it never collides with BoardHeader) */}
      <div className="absolute top-16 xl:top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 p-1.5 rounded-xl border bg-card/95 backdrop-blur shadow-md text-foreground max-w-[96vw] overflow-x-auto">
        {/* Undo / Redo (RF-E08) */}
        <button
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={() => engineRef.current?.undo()}
          className="p-2 rounded hover:bg-muted disabled:opacity-35 transition-colors"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          title="Redo (Ctrl+Y)"
          disabled={!canRedo}
          onClick={() => engineRef.current?.redo()}
          className="p-2 rounded hover:bg-muted disabled:opacity-35 transition-colors"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-border mx-1 shrink-0" />

        {/* Navigation Tools */}
        <button
          title="Select / Pointer (V)"
          onClick={() => handleToolSelect('select')}
          className={`p-2 rounded hover:bg-muted transition-colors ${activeTool === 'select' ? 'bg-primary text-primary-foreground' : ''
            }`}
        >
          <MousePointer2 className="w-4 h-4" />
        </button>

        <button
          title="Hand / Pan (H or Space+Drag)"
          onClick={() => handleToolSelect('hand')}
          className={`p-2 rounded hover:bg-muted transition-colors ${activeTool === 'hand' ? 'bg-primary text-primary-foreground' : ''
            }`}
        >
          <Hand className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-border mx-1 shrink-0" />

        {/* 2D Geometric Primitives & Text / Sticky / Freehand */}
        <button
          title="Rectangle (R)"
          onClick={() => handleToolSelect('rectangle')}
          className={`p-2 rounded hover:bg-muted transition-colors ${activeTool === 'rectangle' ? 'bg-primary text-primary-foreground' : ''
            }`}
        >
          <Square className="w-4 h-4" />
        </button>

        <button
          title="Ellipse / Circle (O)"
          onClick={() => handleToolSelect('ellipse')}
          className={`p-2 rounded hover:bg-muted transition-colors ${activeTool === 'ellipse' ? 'bg-primary text-primary-foreground' : ''
            }`}
        >
          <Circle className="w-4 h-4" />
        </button>

        <button
          title="Diamond / Decision (D)"
          onClick={() => handleToolSelect('diamond')}
          className={`p-2 rounded hover:bg-muted transition-colors ${activeTool === 'diamond' ? 'bg-primary text-primary-foreground' : ''
            }`}
        >
          <Diamond className="w-4 h-4" />
        </button>

        <button
          title="Triangle"
          onClick={() => handleToolSelect('triangle')}
          className={`p-2 rounded hover:bg-muted transition-colors ${activeTool === 'triangle' ? 'bg-primary text-primary-foreground' : ''
            }`}
        >
          <Triangle className="w-4 h-4" />
        </button>

        <button
          title="Line"
          onClick={() => handleToolSelect('line')}
          className={`p-2 rounded hover:bg-muted transition-colors ${activeTool === 'line' ? 'bg-primary text-primary-foreground' : ''
            }`}
        >
          <Minus className="w-4 h-4" />
        </button>

        <button
          title="Magnetic Arrow Connector (A)"
          onClick={() => handleToolSelect('arrow')}
          className={`p-2 rounded hover:bg-muted transition-colors ${activeTool === 'arrow' ? 'bg-primary text-primary-foreground' : ''
            }`}
        >
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          title="Text Label (T)"
          onClick={() => handleToolSelect('text')}
          className={`p-2 rounded hover:bg-muted transition-colors ${activeTool === 'text' ? 'bg-primary text-primary-foreground' : ''
            }`}
        >
          <Type className="w-4 h-4" />
        </button>

        <button
          title="Sticky Note (S)"
          onClick={() => handleToolSelect('sticky')}
          className={`p-2 rounded hover:bg-muted transition-colors ${activeTool === 'sticky' ? 'bg-primary text-primary-foreground' : ''
            }`}
        >
          <StickyNote className="w-4 h-4" />
        </button>

        <button
          title="Freehand Draw (P)"
          onClick={() => handleToolSelect('freehand')}
          className={`p-2 rounded hover:bg-muted transition-colors ${activeTool === 'freehand' ? 'bg-primary text-primary-foreground' : ''
            }`}
        >
          <PenTool className="w-4 h-4" />
        </button>

        <button
          title="Eraser (E)"
          onClick={() => handleToolSelect('eraser')}
          className={`p-2 rounded hover:bg-muted transition-colors ${activeTool === 'eraser' ? 'bg-primary text-primary-foreground' : ''
            }`}
        >
          <Eraser className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-border mx-1 shrink-0" />
        <button
          title="All 20 IT Architecture Components Library"
          onClick={() => setIsComponentLibraryOpen((prev) => !prev)}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isComponentLibraryOpen
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/60 hover:bg-muted text-foreground'
            }`}
        >
          <Boxes className="w-4 h-4" />
          <span className="hidden sm:inline">Library</span>
        </button>
      </div>

      {/* 20 P0 IT Architecture Component Library Popover (RF-E03) */}
      {isComponentLibraryOpen && (
        <div className="absolute top-28 xl:top-16 left-1/2 -translate-x-1/2 z-30 w-[92vw] max-w-2xl rounded-xl border bg-card/95 backdrop-blur shadow-2xl p-4 text-foreground animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold">
                System Design IT Component Library
              </h3>
            </div>
            <button
              onClick={() => setIsComponentLibraryOpen(false)}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {(Object.keys(CATEGORY_LABELS) as ComponentCategory[]).map((cat) => {
              const items = Object.values(IT_COMPONENTS).filter((c) => c.category === cat);
              return (
                <div key={cat} className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABELS[cat]}
                  </div>
                  <div className="space-y-1">
                    {items.map((comp) => (
                      <button
                        key={comp.key}
                        onClick={() => handleToolSelect(comp.key as Tool)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center justify-between ${activeTool === comp.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/30 hover:bg-muted border-transparent'
                          }`}
                      >
                        <span>{comp.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* In-Place Element Text / Label Editor Modal (RF-E04) */}
      {editingElement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm"
          onClick={() => setEditingElement(null)}
        >
          <form
            onSubmit={handleSaveEditedText}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">
                Edit Element Text / Label
              </h3>
              <button
                type="button"
                onClick={() => setEditingElement(null)}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              autoFocus
              rows={3}
              value={editingTextValue}
              onChange={(e) => setEditingTextValue(e.target.value)}
              placeholder="Enter text or label..."
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingElement(null)}
                className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
              >
                Apply Text
              </button>
            </div>
          </form>
        </div>
      )}

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
          title="Toggle Dark / Light Mode"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg border bg-card/95 backdrop-blur shadow-sm hover:bg-muted text-foreground transition-colors"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-700" />
          )}
        </button>
      </div>

      {/* Interactive 2D Infinite Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block touch-none"
      />
    </div>
  );
};
