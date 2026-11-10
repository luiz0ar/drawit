import React, { useState, useEffect } from 'react';
import {
  Check,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Menu,
  Edit2,
  Folder,
} from 'lucide-react';
import { SaveStatus } from '../editor/useAutosave';
import { validateBoardTitle } from './titleGenerator';

interface BoardHeaderProps {
  title: string;
  groupName?: string | null;
  saveStatus: SaveStatus;
  isTrashView?: boolean;
  onTitleChange: (newTitle: string) => Promise<void>;
  onToggleSidebar: () => void;
  onResolveConflict?: () => void;
}

export const BoardHeader: React.FC<BoardHeaderProps> = ({
  title,
  groupName,
  saveStatus,
  isTrashView = false,
  onTitleChange,
  onToggleSidebar,
  onResolveConflict,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(title);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentTitle(title);
  }, [title]);

  const handleSubmit = async () => {
    const validation = validateBoardTitle(currentTitle);
    if (!validation.valid) {
      setError(validation.error || 'Invalid title');
      return;
    }

    try {
      setError(null);
      await onTitleChange(currentTitle.trim());
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update title');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setCurrentTitle(title);
      setError(null);
      setIsEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        title="Open Boards and Folders"
        className="p-2 rounded-lg border bg-card/95 backdrop-blur shadow-sm hover:bg-muted text-foreground transition-colors"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Title & Group Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card/95 backdrop-blur shadow-sm">
        {groupName && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
            <Folder className="w-3.5 h-3.5" />
            <span>{groupName}</span>
            <span>/</span>
          </div>
        )}

        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              autoFocus
              value={currentTitle}
              onChange={(e) => {
                setCurrentTitle(e.target.value);
                if (error) setError(null);
              }}
              onBlur={handleSubmit}
              onKeyDown={handleKeyDown}
              maxLength={120}
              className="text-sm font-semibold px-2 py-0.5 rounded bg-muted text-foreground border border-primary focus:outline-none focus:ring-1 focus:ring-primary min-w-[120px] max-w-[280px]"
            />
            {error && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {error}
              </span>
            )}
          </div>
        ) : (
          <button
            onClick={() => !isTrashView && setIsEditing(true)}
            title={isTrashView ? 'Archived in trash' : 'Click to rename board'}
            className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors text-left"
          >
            <span>{title}</span>
            {!isTrashView && (
              <Edit2 className="w-3 h-3 text-muted-foreground opacity-60 hover:opacity-100" />
            )}
          </button>
        )}

        <div className="w-[1px] h-4 bg-border mx-1" />

        {/* Save Status Indicator */}
        <div className="flex items-center gap-1 text-xs font-medium">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              <span>Saved</span>
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span>Saving...</span>
            </span>
          )}
          {saveStatus === 'idle' && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>Unsaved</span>
            </span>
          )}
          {saveStatus === 'conflict' && (
            <button
              onClick={onResolveConflict}
              title="Conflict detected. Click to resolve."
              className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold hover:underline"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Conflict</span>
            </button>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Error</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

