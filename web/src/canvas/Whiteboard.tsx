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
  Globe,
  Smartphone,
  Laptop,
  User,
  Server,
  Cpu,
  Cog,
  Network,
  GitFork,
  Database,
  Layers,
  HardDrive,
  Columns3,
  Activity,
  Rabbit,
  Cloud,
  Radio,
  Shield,
  Box,
  Orbit,
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
  generateThumbnailSvg,
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

const COMPONENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  browser: Globe,
  mobile: Smartphone,
  laptop: Laptop,
  user: User,
  server: Server,
  microservice: Cpu,
  worker: Cog,
  api_gateway: Network,
  load_balancer: GitFork,
  database: Database,
  cache: Layers,
  object_storage: HardDrive,
  queue: Columns3,
  event_stream: Activity,
  rabbitmq: Rabbit,
  cloud: Cloud,
  cdn: Radio,
  firewall: Shield,
  container: Box,
  kubernetes: Orbit,
};

export const Whiteboard: React.FC<WhiteboardProps> = ({ boardId }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inlineInputRef = useRef<HTMLTextAreaElement | null>(null);

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

  const componentLibraryRef = useRef<HTMLDivElement | null>(null);
  const componentLibraryButtonRef = useRef<HTMLButtonElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  // Close Component Library when clicking outside or pressing Escape
  useEffect(() => {
    if (!isComponentLibraryOpen) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (
        componentLibraryRef.current &&
        !componentLibraryRef.current.contains(target) &&
        componentLibraryButtonRef.current &&
        !componentLibraryButtonRef.current.contains(target)
      ) {
        setIsComponentLibraryOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsComponentLibraryOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDownOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isComponentLibraryOpen]);

  // Close Export menu on outside click
  useEffect(() => {
    if (!isExportMenuOpen) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (exportMenuRef.current && !exportMenuRef.current.contains(target)) {
        setIsExportMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDownOutside);
    return () => window.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [isExportMenuOpen]);

  // In-place Text / Label Editor State (RF-E04)
  const [editingElement, setEditingElement] = useState<CanvasElement | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [editingTextValue, setEditingTextValue] = useState('');
  const editingMountedAt = useRef<number>(0);

  useEffect(() => {
    if (editingElement) {
      editingMountedAt.current = Date.now();
      const timer = setTimeout(() => {
        if (inlineInputRef.current) {
          inlineInputRef.current.focus();
          inlineInputRef.current.select();
        }
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [editingElement?.id]);

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
    } catch (err) {
      console.warn('Failed to fetch remote boards/groups, falling back to local session:', err);
      const fallback: Board = {
        id: 'local-board-1',
        owner_id: 'local',
        group_id: null,
        title: 'Board-1',
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
      } catch (err) {
        console.warn('Failed to load board scene from server, initializing empty scene:', err);
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
        } catch (err) {
          console.warn(`Failed to fetch board with id ${boardId}, falling back to default list:`, err);
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
        scheduleSave(
          engine.getElements(),
          vp,
          generateThumbnailSvg(engine.getElements(), resolvedTheme)
        );
      },
      onElementsChange: (elements) => {
        setActiveTool(engine.getTool());
        scheduleSave(
          elements,
          engine.getViewport(),
          generateThumbnailSvg(elements, resolvedTheme)
        );
      },
      onHistoryChange: (undoAvailable, redoAvailable) => {
        setCanUndo(undoAvailable);
        setCanRedo(redoAvailable);
      },
      onToolChange: (tool) => {
        setActiveTool(tool);
      },
      onEditElementText: (el, isNew = false) => {
        editingMountedAt.current = Date.now();
        setEditingElement(el);
        setEditingIsNew(isNew);
        setEditingTextValue(
          el.type === 'text' ? ((el as any).text !== undefined ? (el as any).text : el.label || '') : el.label || ''
        );
        engine.setEditingId(el.id);
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
    scheduleSave(
      engineRef.current.getElements(),
      newVp,
      generateThumbnailSvg(engineRef.current.getElements(), resolvedTheme)
    );
  };

  const handleResetZoom = () => {
    if (!engineRef.current) return;
    const newVp: ViewportTransform = { panX: 0, panY: 0, zoom: 1.0 };
    engineRef.current.setViewport(newVp);
    setViewport(newVp);
    scheduleSave(
      engineRef.current.getElements(),
      newVp,
      generateThumbnailSvg(engineRef.current.getElements(), resolvedTheme)
    );
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

  const handleCommitInlineText = (force = false) => {
    if (!editingElement || !engineRef.current) return;
    if (!force && Date.now() - editingMountedAt.current < 350) {
      inlineInputRef.current?.focus();
      return;
    }
    const val = editingTextValue;
    const trimmed = val.trim();
    if (editingElement.type === 'text' && !trimmed) {
      engineRef.current.deleteElement(editingElement.id);
    } else {
      engineRef.current.updateElementText(editingElement.id, val);
    }
    engineRef.current.setEditingId(null);
    setEditingElement(null);
    setEditingIsNew(false);
  };

  const handleCancelInlineText = () => {
    if (!editingElement || !engineRef.current) return;
    if (editingElement.type === 'text' && editingIsNew) {
      engineRef.current.deleteElement(editingElement.id);
    }
    engineRef.current.setEditingId(null);
    setEditingElement(null);
    setEditingIsNew(false);
  };

  // Export & Import actions
  const boardTitle = activeBoard?.title || 'Board-1';
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
        scheduleSave(
          res.data.scene.elements,
          engineRef.current.getViewport(),
          generateThumbnailSvg(res.data.scene.elements, resolvedTheme)
        );
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
    } catch (err) {
      console.error('Failed to update board title on server, applying locally:', err);
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
        onUpdateFontSize={(fontSize) => engineRef.current?.updateSelectedFontSize(fontSize)}
        onEditText={(el) => {
          editingMountedAt.current = Date.now();
          setEditingElement(el);
          setEditingIsNew(false);
          setEditingTextValue(
            el.type === 'text' ? ((el as any).text !== undefined ? (el as any).text : el.label || '') : el.label || ''
          );
          engineRef.current?.setEditingId(el.id);
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
          ref={componentLibraryButtonRef}
          title="IT Architecture Components Library"
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

      {/* IT Architecture Component Library Popover (RF-E03) */}
      {isComponentLibraryOpen && (
        <div
          ref={componentLibraryRef}
          className="absolute top-28 xl:top-16 left-1/2 -translate-x-1/2 z-30 w-[92vw] max-w-2xl rounded-xl border bg-card/95 backdrop-blur shadow-2xl p-4 text-foreground animate-in fade-in zoom-in-95 duration-150"
        >
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
                    {items.map((comp) => {
                      const Icon = COMPONENT_ICONS[comp.key];
                      const isSelected = activeTool === comp.key;
                      return (
                        <button
                          key={comp.key}
                          onClick={() => {
                            handleToolSelect(comp.key as Tool);
                            setIsComponentLibraryOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-2 ${isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/30 hover:bg-muted border-transparent text-foreground'
                            }`}
                        >
                          {Icon && (
                            <Icon
                              className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-primary-foreground' : 'text-primary'
                                }`}
                            />
                          )}
                          <span className="truncate">{comp.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Direct Inline On-Screen Text / Label Editor (No Modal) */}
      {editingElement && (() => {
        const zoom = viewport.zoom;
        const baseFontSize =
          (editingElement as any).fontSize || (editingElement.type === 'text' ? 20 : 14);
        const fontSize = Math.max(12, baseFontSize * zoom);
        const strokeColor = editingElement.style.strokeColor;

        let left = viewport.panX + editingElement.x * zoom;
        let top = viewport.panY + editingElement.y * zoom;
        let width = Math.max(100, editingElement.width * zoom);
        let height = Math.max(36, editingElement.height * zoom);
        let textAlign: 'left' | 'center' | 'right' = 'center';

        if (editingElement.type === 'text') {
          textAlign = (editingElement as any).textAlign || 'left';
          const lines = editingTextValue.split('\n');
          const maxLineLen = Math.max(...lines.map((l) => l.length), 3);
          const dynamicW = maxLineLen * (baseFontSize * 0.65) * zoom + 32;
          width = Math.max(120, editingElement.width * zoom + 32, dynamicW);
          height = Math.max(36, lines.length * (fontSize * 1.35) + 16);
        } else if (editingElement.type === 'component') {
          textAlign = 'center';
          const lines = editingTextValue.split('\n');
          const maxLineLen = Math.max(...lines.map((l) => l.length), 6);
          const dynamicW = maxLineLen * (baseFontSize * 0.65) * zoom + 32;
          width = Math.max(140, (editingElement.width + 40) * zoom, dynamicW);
          left = viewport.panX + (editingElement.x + editingElement.width / 2) * zoom - width / 2;
          top = viewport.panY + (editingElement.y + editingElement.height + 4) * zoom;
          height = Math.max(32, 28 * zoom);
        } else if (editingElement.type === 'sticky') {
          left = viewport.panX + (editingElement.x + 8) * zoom;
          top = viewport.panY + (editingElement.y + 8) * zoom;
          width = Math.max(80, (editingElement.width - 16) * zoom);
          height = Math.max(36, (editingElement.height - 16) * zoom);
          textAlign = 'center';
        } else {
          // Geometric shapes (rectangle, ellipse, diamond, triangle)
          textAlign = 'center';
          left = viewport.panX + (editingElement.x + 8) * zoom;
          top =
            viewport.panY +
            (editingElement.y +
              (editingElement.type === 'triangle' ? editingElement.height * 0.25 : 8)) *
            zoom;
          width = Math.max(80, (editingElement.width - 16) * zoom);
          height = Math.max(
            36,
            (editingElement.height -
              (editingElement.type === 'triangle' ? editingElement.height * 0.35 : 16)) *
            zoom
          );
        }

        return (
          <div
            className="absolute z-40 pointer-events-auto select-text"
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              minHeight: `${height}px`,
              transform: editingElement.rotation ? `rotate(${editingElement.rotation}rad)` : undefined,
              transformOrigin: 'top left',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <textarea
              ref={inlineInputRef}
              rows={Math.max(1, editingTextValue.split('\n').length)}
              value={editingTextValue}
              onChange={(e) => setEditingTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (e.shiftKey) {
                    // Shift+Enter creates a new line
                  } else {
                    e.preventDefault();
                    handleCommitInlineText(true);
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCancelInlineText();
                }
              }}
              onBlur={() => handleCommitInlineText(false)}
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: `${fontSize * 1.3}px`,
                color: strokeColor,
                textAlign,
                fontFamily:
                  (editingElement as any).fontFamily === 'mono'
                    ? 'monospace'
                    : (editingElement as any).fontFamily === 'serif'
                      ? 'serif'
                      : 'sans-serif',
              }}
              className="w-full h-full min-h-[32px] resize-none overflow-hidden select-text cursor-text bg-background/95 dark:bg-card/95 backdrop-blur-sm border-2 border-primary rounded-lg px-2.5 py-1 outline-none shadow-2xl focus:ring-2 focus:ring-primary/40 font-medium"
            />
          </div>
        );
      })()}

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
        <div ref={exportMenuRef} className="relative">
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
                <span>Export as PNG</span>
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
