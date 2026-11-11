import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Layers,
  Plus,
  Search,
  LayoutGrid,
  List,
  Folder,
  FolderPlus,
  Star,
  Clock,
  Trash2,
  RotateCcw,
  Copy,
  Edit2,
  Tag,
  LogOut,
  ShieldAlert,
  Sun,
  Moon,
  FileText,
  ArrowUpDown,
  X,
  Check,
  FolderOutput,
} from 'lucide-react';
import {
  Board,
  Group,
  TagCount,
  BoardApi,
  GroupApi,
} from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../context/ThemeContext';
import { navigate } from '../../lib/router';
import { generateNextBoardTitle, validateBoardTitle } from '../boards/titleGenerator';
import { generateThumbnailSvg } from '../../canvas/export/imageExporter';

interface BoardGridPreviewProps {
  board: Board;
  theme: 'dark' | 'light';
}

const BoardGridPreview: React.FC<BoardGridPreviewProps> = ({ board, theme }) => {
  const [thumb, setThumb] = useState<string | null>(board.thumbnail);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (board.thumbnail) {
      setThumb(board.thumbnail);
      return;
    }

    if (!board.is_deleted) {
      let isMounted = true;
      setLoading(true);

      BoardApi.getScene(board.id)
        .then((scene) => {
          if (!isMounted) return;
          if (scene.elements && scene.elements.length > 0) {
            const dataUrl = generateThumbnailSvg(scene.elements, theme);
            if (dataUrl) {
              setThumb(dataUrl);
              BoardApi.update(board.id, { thumbnail: dataUrl }).catch(() => { });
            }
          }
        })
        .catch(() => { })
        .finally(() => {
          if (isMounted) setLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [board.id, board.thumbnail, board.is_deleted, theme]);

  if (thumb) {
    return (
      <img
        src={thumb}
        alt={board.title}
        className="w-full h-full object-contain p-2.5 transition-transform duration-200 group-hover:scale-105 pointer-events-none select-none"
      />
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground/40 select-none">
      <Layers className="w-8 h-8" />
      <span className="text-[10px] font-medium tracking-wide">Empty canvas</span>
    </div>
  );
};

type NavFilter =
  | { type: 'all' }
  | { type: 'favorites' }
  | { type: 'recent' }
  | { type: 'ungrouped' }
  | { type: 'group'; groupId: string }
  | { type: 'trash' };

export const DashboardPage: React.FC = () => {
  const { user, logout, logoutAll } = useAuthStore();
  const { resolvedTheme, setTheme } = useTheme();

  const [boards, setBoards] = useState<Board[]>([]);
  const [allBoardsForNaming, setAllBoardsForNaming] = useState<Board[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [tagsCatalog, setTagsCatalog] = useState<TagCount[]>([]);

  const [navFilter, setNavFilter] = useState<NavFilter>({ type: 'all' });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<string>('updated_at:desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Folder modals/forms
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);

  // Board modals
  const [renamingBoard, setRenamingBoard] = useState<Board | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const [taggingBoard, setTaggingBoard] = useState<Board | null>(null);
  const [tagInputValue, setTagInputValue] = useState('');

  const [movingBoard, setMovingBoard] = useState<Board | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      const isTrash = navFilter.type === 'trash';
      const groupParam =
        navFilter.type === 'group'
          ? navFilter.groupId
          : navFilter.type === 'ungrouped'
            ? 'none'
            : undefined;
      const favParam = navFilter.type === 'favorites' ? true : undefined;
      const sortParam =
        navFilter.type === 'recent' ? 'last_opened_at:desc' : sortBy;

      const [fetchedBoards, activeList, trashList, fetchedGroups, fetchedTags] =
        await Promise.all([
          BoardApi.list({
            trash: isTrash,
            group_id: groupParam,
            favorite: favParam,
            tags: selectedTags,
            q: searchQuery,
            sort: sortParam,
          }),
          BoardApi.list(false),
          BoardApi.list(true),
          GroupApi.list(),
          BoardApi.listTags(),
        ]);

      setBoards(fetchedBoards);
      setAllBoardsForNaming([...activeList, ...trashList]);
      setGroups(fetchedGroups);
      setTagsCatalog(fetchedTags);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  }, [navFilter, selectedTags, searchQuery, sortBy]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleCreateNewBoard = async () => {
    const existingTitles = allBoardsForNaming.map((b) => b.title);
    const nextTitle = generateNextBoardTitle(existingTitles);
    const targetGroupId =
      navFilter.type === 'group' ? navFilter.groupId : null;
    try {
      const created = await BoardApi.create(nextTitle, targetGroupId);
      navigate(`/boards/${created.id}`);
    } catch (err) {
      console.error('Failed to create board:', err);
    }
  };

  const handleToggleFavorite = async (board: Board, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await BoardApi.update(board.id, { is_favorite: !board.is_favorite });
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleDuplicateBoard = async (board: Board, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await BoardApi.duplicate(board.id);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to duplicate board:', err);
    }
  };

  const handleSoftDeleteBoard = async (board: Board, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await BoardApi.delete(board.id);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to move board to trash:', err);
    }
  };

  const handleRestoreBoard = async (board: Board, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await BoardApi.restore(board.id);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to restore board:', err);
    }
  };

  const handlePermanentDeleteBoard = async (board: Board, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await BoardApi.permanentDelete(board.id);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to permanently delete board:', err);
    }
  };

  const handleEmptyTrash = async () => {
    try {
      await BoardApi.emptyTrash();
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to empty trash:', err);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingBoard) return;
    const validation = validateBoardTitle(renameValue);
    if (!validation.valid) {
      setRenameError(validation.error || 'Invalid title');
      return;
    }
    try {
      await BoardApi.update(renamingBoard.id, { title: renameValue.trim() });
      setRenamingBoard(null);
      setRenameError(null);
      fetchDashboardData();
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taggingBoard) return;
    const clean = tagInputValue.trim().toLowerCase();
    if (!clean) return;
    const nextTags = Array.from(new Set([...(taggingBoard.tags || []), clean]));
    try {
      const updated = await BoardApi.update(taggingBoard.id, { tags: nextTags });
      setTaggingBoard(updated);
      setTagInputValue('');
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to add tag:', err);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!taggingBoard) return;
    const nextTags = (taggingBoard.tags || []).filter((t) => t !== tagToRemove);
    try {
      const updated = await BoardApi.update(taggingBoard.id, { tags: nextTags });
      setTaggingBoard(updated);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
  };

  const handleMoveBoardToGroup = async (groupId: string | null) => {
    if (!movingBoard) return;
    try {
      await BoardApi.update(movingBoard.id, { group_id: groupId });
      setMovingBoard(null);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to move board:', err);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      await GroupApi.create(newGroupName.trim());
      setNewGroupName('');
      setIsCreatingGroup(false);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to create group:', err);
    }
  };

  const handleRenameGroup = async (groupId: string) => {
    if (!editingGroupName.trim()) {
      setEditingGroupId(null);
      return;
    }
    try {
      await GroupApi.update(groupId, { name: editingGroupName.trim() });
      setEditingGroupId(null);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to rename group:', err);
    }
  };

  const handleConfirmDeleteGroup = async (action: 'move' | 'trash') => {
    if (!deletingGroup) return;
    try {
      await GroupApi.delete(deletingGroup.id, action);
      if (
        navFilter.type === 'group' &&
        navFilter.groupId === deletingGroup.id
      ) {
        setNavFilter({ type: 'all' });
      }
      setDeletingGroup(null);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const groupMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      map.set(g.id, g.name);
    }
    return map;
  }, [groups]);

  return (
    <div className="min-h-screen w-full flex bg-background text-foreground">
      {/* Left Navigation Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col shrink-0">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#0f40bd] flex items-center justify-center shadow-sm shrink-0 p-1">
              <img
                src="/brand/cup-transparent.png"
                alt="Drawit"
                className="w-5 h-5 object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight leading-none text-foreground">Drawit</span>
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Workspace</span>
            </div>
          </div>
          <span className="text-xs text-muted-foreground font-mono truncate max-w-[100px]">
            {user?.username}
          </span>
        </div>

        <div className="p-3">
          <button
            onClick={handleCreateNewBoard}
            data-testid="new-board-btn"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Board</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5 text-xs">
          {/* Primary Views */}
          <div className="space-y-1">
            <button
              onClick={() => setNavFilter({ type: 'all' })}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-medium transition-colors ${navFilter.type === 'all'
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-foreground hover:bg-muted'
                }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>All Boards</span>
            </button>

            <button
              onClick={() => setNavFilter({ type: 'recent' })}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-medium transition-colors ${navFilter.type === 'recent'
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-foreground hover:bg-muted'
                }`}
            >
              <Clock className="w-4 h-4" />
              <span>Recent</span>
            </button>

            <button
              onClick={() => setNavFilter({ type: 'favorites' })}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-medium transition-colors ${navFilter.type === 'favorites'
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-foreground hover:bg-muted'
                }`}
            >
              <Star className="w-4 h-4" />
              <span>Favorites</span>
            </button>

            <button
              onClick={() => setNavFilter({ type: 'ungrouped' })}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-medium transition-colors ${navFilter.type === 'ungrouped'
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-foreground hover:bg-muted'
                }`}
            >
              <FileText className="w-4 h-4" />
              <span>Ungrouped</span>
            </button>
          </div>

          {/* Folders / Groups */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Folders
              </span>
              <button
                onClick={() => setIsCreatingGroup(true)}
                title="New Folder"
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>

            {isCreatingGroup && (
              <form onSubmit={handleCreateGroup} className="flex gap-1 px-1">
                <input
                  type="text"
                  autoFocus
                  placeholder="Folder name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1 text-xs rounded border bg-background"
                />
                <button
                  type="submit"
                  className="p-1 rounded bg-primary text-primary-foreground"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingGroup(false)}
                  className="p-1 rounded hover:bg-muted"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            )}

            {groups.map((g) => {
              const isSelected =
                navFilter.type === 'group' && navFilter.groupId === g.id;
              return (
                <div
                  key={g.id}
                  onClick={() => setNavFilter({ type: 'group', groupId: g.id })}
                  className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${isSelected
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-foreground hover:bg-muted'
                    }`}
                >
                  {editingGroupId === g.id ? (
                    <input
                      type="text"
                      autoFocus
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      onBlur={() => handleRenameGroup(g.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameGroup(g.id);
                        if (e.key === 'Escape') setEditingGroupId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 px-1.5 py-0.5 text-xs rounded border bg-background"
                    />
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="truncate">{g.name}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          title="Rename folder"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingGroupId(g.id);
                            setEditingGroupName(g.name);
                          }}
                          className="p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          title="Delete folder"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingGroup(g);
                          }}
                          className="p-0.5 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tags Filter */}
          {tagsCatalog.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Tags
                </span>
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => setSelectedTags([])}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 px-2">
                {tagsCatalog.map((tc) => {
                  const active = selectedTags.includes(tc.tag);
                  return (
                    <button
                      key={tc.tag}
                      onClick={() => toggleTagFilter(tc.tag)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors ${active
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/50 text-foreground hover:bg-muted'
                        }`}
                    >
                      <Tag className="w-2.5 h-2.5" />
                      <span>{tc.tag}</span>
                      <span className="opacity-70">({tc.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Trash */}
          <div className="pt-2 border-t">
            <button
              onClick={() => setNavFilter({ type: 'trash' })}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-medium transition-colors ${navFilter.type === 'trash'
                  ? 'bg-destructive/10 text-destructive font-semibold'
                  : 'text-foreground hover:bg-muted'
                }`}
            >
              <Trash2 className="w-4 h-4" />
              <span>Trash</span>
            </button>
          </div>
        </nav>

        {/* User Footer Actions */}
        <div className="p-3 border-t space-y-1 text-xs">
          <button
            onClick={logoutAll}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Logout All Devices</span>
          </button>
          <button
            onClick={logout}
            data-testid="logout-btn"
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-16 border-b bg-card/50 px-6 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search boards by title or tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Sort Select */}
            <div className="flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 bg-background text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort boards"
                className="bg-transparent text-foreground focus:outline-none text-xs"
              >
                <option value="updated_at:desc">Last Updated</option>
                <option value="created_at:desc">Newest Created</option>
                <option value="title:asc">Title (A-Z)</option>
                <option value="last_opened_at:desc">Recently Opened</option>
              </select>
            </div>

            {/* Grid / List Toggle */}
            <div className="flex items-center border rounded-lg p-0.5 bg-background">
              <button
                title="Grid View"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                title="List View"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Theme Toggle */}
            <button
              title="Toggle Theme"
              onClick={() =>
                setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
              }
              className="p-2 rounded-lg border bg-background hover:bg-muted text-foreground transition-colors"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>
        </header>

        {/* Subheader & Trash Banner */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">
              {navFilter.type === 'all' && 'All Boards'}
              {navFilter.type === 'recent' && 'Recent Boards'}
              {navFilter.type === 'favorites' && 'Favorite Boards'}
              {navFilter.type === 'ungrouped' && 'Ungrouped Boards'}
              {navFilter.type === 'trash' && 'Trash (30-Day Retention)'}
              {navFilter.type === 'group' &&
                (groupMap.get(navFilter.groupId) || 'Folder')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {boards.length} {boards.length === 1 ? 'board' : 'boards'}
            </p>
          </div>

          {navFilter.type === 'trash' && boards.length > 0 && (
            <button
              onClick={handleEmptyTrash}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Empty Trash</span>
            </button>
          )}
        </div>

        {/* Boards Display */}
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          {boards.length === 0 ? (
            <div className="h-72 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-6 space-y-3 bg-muted/10">
              <div className="w-16 h-16 rounded-2xl bg-[#0f40bd]/10 dark:bg-[#0f40bd]/20 border border-[#0f40bd]/20 flex items-center justify-center p-3 mb-1">
                <img
                  src="/brand/cup-transparent.png"
                  alt="Drawit Mascot"
                  className="w-10 h-10 object-contain drop-shadow"
                />
              </div>
              <div className="space-y-1 max-w-sm">
                <p className="text-sm font-semibold text-foreground">
                  No boards found
                </p>
                <p className="text-xs text-muted-foreground">
                  {navFilter.type === 'trash'
                    ? 'Deleted boards will appear here.'
                    : 'Create your first System Design whiteboard to get started.'}
                </p>
              </div>
              {navFilter.type !== 'trash' && (
                <button
                  onClick={handleCreateNewBoard}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-shadow shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Board</span>
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {boards.map((b) => (
                <div
                  key={b.id}
                  onClick={() =>
                    !b.is_deleted && navigate(`/boards/${b.id}`)
                  }
                  className="group border rounded-xl bg-card hover:border-primary/50 hover:shadow-md transition-all overflow-hidden flex flex-col cursor-pointer"
                >
                  {/* Thumbnail Preview */}
                  <div className="h-36 bg-muted/20 border-b flex items-center justify-center relative overflow-hidden">
                    <BoardGridPreview board={b} theme={resolvedTheme} />

                    {!b.is_deleted && (
                      <button
                        type="button"
                        title={
                          b.is_favorite
                            ? 'Remove from favorites'
                            : 'Add to favorites'
                        }
                        onClick={(e) => handleToggleFavorite(b, e)}
                        className={`absolute top-2.5 right-2.5 p-1.5 rounded-lg border bg-card/90 backdrop-blur transition-opacity ${b.is_favorite
                            ? 'text-amber-500 opacity-100'
                            : 'text-muted-foreground opacity-0 group-hover:opacity-100'
                          }`}
                      >
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </button>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-sm text-foreground truncate">
                          {b.title}
                        </h3>
                      </div>
                      {b.group_id && groupMap.has(b.group_id) && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Folder className="w-3 h-3 text-amber-500" />
                          <span>{groupMap.get(b.group_id)}</span>
                        </div>
                      )}
                      {b.tags && b.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {b.tags.map((t) => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground font-medium"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Card Actions Footer */}
                    <div className="pt-2 border-t flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {new Date(b.updated_at).toLocaleDateString()}
                      </span>

                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {b.is_deleted ? (
                          <>
                            <button
                              title="Restore board"
                              onClick={(e) => handleRestoreBoard(b, e)}
                              className="p-1 rounded hover:bg-primary/10 text-primary"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Delete permanently"
                              onClick={(e) => handlePermanentDeleteBoard(b, e)}
                              className="p-1 rounded hover:bg-destructive/10 text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              title="Rename board"
                              onClick={() => {
                                setRenamingBoard(b);
                                setRenameValue(b.title);
                                setRenameError(null);
                              }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Manage tags"
                              onClick={() => {
                                setTaggingBoard(b);
                                setTagInputValue('');
                              }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                              <Tag className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Move to folder"
                              onClick={() => setMovingBoard(b)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                              <FolderOutput className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Duplicate board"
                              onClick={(e) => handleDuplicateBoard(b, e)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Move to trash"
                              onClick={(e) => handleSoftDeleteBoard(b, e)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border rounded-xl bg-card overflow-hidden divide-y">
              {boards.map((b) => (
                <div
                  key={b.id}
                  onClick={() =>
                    !b.is_deleted && navigate(`/boards/${b.id}`)
                  }
                  className="px-4 py-3 flex items-center justify-between hover:bg-muted/50 cursor-pointer transition-colors text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-semibold text-foreground truncate">
                      {b.title}
                    </span>
                    {b.group_id && groupMap.has(b.group_id) && (
                      <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        {groupMap.get(b.group_id)}
                      </span>
                    )}
                    {b.tags?.map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 rounded bg-muted/70 text-[10px] text-muted-foreground"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                  <div
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-muted-foreground mr-2">
                      {new Date(b.updated_at).toLocaleDateString()}
                    </span>
                    {b.is_deleted ? (
                      <>
                        <button
                          title="Restore"
                          onClick={(e) => handleRestoreBoard(b, e)}
                          className="p-1 rounded hover:bg-primary/10 text-primary"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="Delete permanently"
                          onClick={(e) => handlePermanentDeleteBoard(b, e)}
                          className="p-1 rounded hover:bg-destructive/10 text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          title="Favorite"
                          onClick={(e) => handleToggleFavorite(b, e)}
                          className={`p-1 rounded ${b.is_favorite
                              ? 'text-amber-500'
                              : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          title="Duplicate"
                          onClick={(e) => handleDuplicateBoard(b, e)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="Move to trash"
                          onClick={(e) => handleSoftDeleteBoard(b, e)}
                          className="p-1 rounded hover:bg-destructive/10 text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Rename Board Modal */}
      {renamingBoard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-card border rounded-xl shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Rename Board</h3>
              <button
                onClick={() => setRenamingBoard(null)}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleRenameSubmit} className="space-y-3">
              <input
                type="text"
                autoFocus
                maxLength={120}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border bg-background text-foreground"
              />
              {renameError && (
                <p className="text-xs text-destructive">{renameError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenamingBoard(null)}
                  className="px-3 py-1.5 text-xs rounded-lg border hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground font-semibold"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tags Management Modal */}
      {taggingBoard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-card border rounded-xl shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">
                Tags for {taggingBoard.title}
              </h3>
              <button
                onClick={() => setTaggingBoard(null)}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddTag} className="flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder="Add tag (e.g. microservices)..."
                value={tagInputValue}
                onChange={(e) => setTagInputValue(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border bg-background"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground font-semibold"
              >
                Add
              </button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              {(taggingBoard.tags || []).length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  No tags assigned yet.
                </span>
              ) : (
                taggingBoard.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-xs"
                  >
                    <span>#{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Move Board to Folder Modal */}
      {movingBoard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-card border rounded-xl shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">
                Move &ldquo;{movingBoard.title}&rdquo;
              </h3>
              <button
                onClick={() => setMovingBoard(null)}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              <button
                onClick={() => handleMoveBoardToGroup(null)}
                className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-muted flex items-center gap-2"
              >
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Ungrouped (Root)</span>
              </button>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => handleMoveBoardToGroup(g.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-muted flex items-center gap-2"
                >
                  <Folder className="w-3.5 h-3.5 text-amber-500" />
                  <span>{g.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Folder Policy Modal */}
      {deletingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-card border rounded-xl shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">
                Delete Folder &ldquo;{deletingGroup.name}&rdquo;
              </h3>
              <button
                onClick={() => setDeletingGroup(null)}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Choose what happens to boards inside this folder:
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleConfirmDeleteGroup('move')}
                className="w-full py-2 px-3 rounded-lg border bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80"
              >
                Keep boards (Move to Ungrouped)
              </button>
              <button
                onClick={() => handleConfirmDeleteGroup('trash')}
                className="w-full py-2 px-3 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90"
              >
                Move folder and its boards to Trash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
