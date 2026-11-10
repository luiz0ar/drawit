import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Folder,
  FolderPlus,
  Trash2,
  RotateCcw,
  Search,
  FileText,
  ChevronRight,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { Board, Group } from '../../lib/api';
import { generateNextBoardTitle } from './titleGenerator';

interface BoardDrawerProps {
  isOpen: boolean;
  currentBoardId: string | null;
  boards: Board[];
  groups: Group[];
  isTrashView: boolean;
  onClose: () => void;
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: (title: string, groupId?: string | null) => Promise<void>;
  onDeleteBoard: (boardId: string) => Promise<void>;
  onRestoreBoard: (boardId: string) => Promise<void>;
  onCreateGroup: (name: string) => Promise<void>;
  onDeleteGroup: (groupId: string, action: 'move' | 'trash') => Promise<void>;
  onToggleTrashView: (showTrash: boolean) => void;
}

export const BoardDrawer: React.FC<BoardDrawerProps> = ({
  isOpen,
  currentBoardId,
  boards,
  groups,
  isTrashView,
  onClose,
  onSelectBoard,
  onCreateBoard,
  onDeleteBoard,
  onRestoreBoard,
  onCreateGroup,
  onDeleteGroup,
  onToggleTrashView,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const handleCreateBoard = async () => {
    const existingTitles = boards.map((b) => b.title);
    const nextTitle = generateNextBoardTitle(existingTitles);
    await onCreateBoard(nextTitle, selectedGroupId);
  };

  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    await onCreateGroup(newGroupName.trim());
    setNewGroupName('');
    setIsCreatingGroup(false);
  };

  const filteredBoards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return boards;
    return boards.filter((b) => b.title.toLowerCase().includes(query));
  }, [boards, searchQuery]);

  const ungroupedBoards = useMemo(() => {
    return filteredBoards.filter((b) => !b.group_id);
  }, [filteredBoards]);

  const boardsByGroup = useMemo(() => {
    const map = new Map<string, Board[]>();
    for (const g of groups) {
      map.set(g.id, []);
    }
    for (const b of filteredBoards) {
      if (b.group_id && map.has(b.group_id)) {
        map.get(b.group_id)!.push(b);
      }
    }
    return map;
  }, [groups, filteredBoards]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer content */}
      <div className="relative w-80 max-w-[85vw] h-full bg-card border-r shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-base text-foreground">
              {isTrashView ? 'Trash' : 'My Boards'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action bar & Search */}
        <div className="p-3 border-b space-y-2">
          {!isTrashView && (
            <div className="flex gap-2">
              <button
                onClick={handleCreateBoard}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>New Board</span>
              </button>
              <button
                onClick={() => setIsCreatingGroup(true)}
                title="New Group / Folder"
                className="p-2 rounded-lg border bg-muted/50 hover:bg-muted text-foreground transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* New Group inline form */}
          {isCreatingGroup && (
            <form onSubmit={handleCreateGroupSubmit} className="flex gap-1.5 pt-1">
              <input
                type="text"
                autoFocus
                placeholder="Folder name..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="flex-1 px-2.5 py-1 text-xs rounded border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="submit"
                className="px-2.5 py-1 text-xs font-semibold rounded bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingGroup(false)}
                className="px-2 py-1 text-xs rounded text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </form>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search boards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Board & Groups List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Groups section (only in active view) */}
          {!isTrashView && groups.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2">
                Folders
              </div>
              {groups.map((group) => {
                const groupBoards = boardsByGroup.get(group.id) || [];
                const isExpanded = expandedGroups[group.id] ?? true;

                return (
                  <div key={group.id} className="space-y-0.5">
                    <div className="group flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/70 text-foreground text-xs font-medium cursor-pointer">
                      <div
                        className="flex items-center gap-1.5 flex-1 min-w-0"
                        onClick={() => toggleGroupExpand(group.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="truncate">{group.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          ({groupBoards.length})
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          title={`New board in ${group.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedGroupId(group.id);
                            const existingTitles = boards.map((b) => b.title);
                            const nextTitle = generateNextBoardTitle(existingTitles);
                            onCreateBoard(nextTitle, group.id);
                          }}
                          className="p-1 text-muted-foreground hover:text-primary"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          title="Delete folder"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete folder "${group.name}"? Boards will be moved to root.`)) {
                              onDeleteGroup(group.id, 'move');
                            }
                          }}
                          className="p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="pl-6 space-y-0.5">
                        {groupBoards.map((b) => (
                          <div
                            key={b.id}
                            onClick={() => onSelectBoard(b.id)}
                            className={`group flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                              b.id === currentBoardId
                                ? 'bg-primary/10 text-primary font-semibold'
                                : 'text-foreground hover:bg-muted'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <FileText className="w-3 h-3 shrink-0" />
                              <span className="truncate">{b.title}</span>
                            </div>
                            <button
                              title="Move to trash"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteBoard(b.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Boards section */}
          <div className="space-y-1">
            {!isTrashView && groups.length > 0 && (
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2">
                Ungrouped Boards
              </div>
            )}

            {(isTrashView ? filteredBoards : ungroupedBoards).length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground">
                {isTrashView ? 'Trash is empty' : 'No boards found'}
              </div>
            ) : (
              (isTrashView ? filteredBoards : ungroupedBoards).map((b) => (
                <div
                  key={b.id}
                  onClick={() => !isTrashView && onSelectBoard(b.id)}
                  className={`group flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    b.id === currentBoardId
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{b.title}</span>
                  </div>

                  {isTrashView ? (
                    <button
                      title="Restore board"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestoreBoard(b.id);
                      }}
                      className="p-1 rounded text-primary hover:bg-primary/10 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      title="Move to trash"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteBoard(b.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer: Trash toggle */}
        <div className="p-3 border-t bg-muted/20">
          <button
            onClick={() => onToggleTrashView(!isTrashView)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border bg-card text-foreground text-xs font-semibold hover:bg-muted transition-colors shadow-sm"
          >
            {isTrashView ? (
              <>
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span>Back to Active Boards</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span>View Trash</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
