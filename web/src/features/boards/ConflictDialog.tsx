import React from 'react';
import { AlertTriangle, RefreshCw, UploadCloud, X } from 'lucide-react';

interface ConflictDialogProps {
  isOpen: boolean;
  serverRevision: number | null;
  onReload: () => void;
  onOverwrite: () => void;
  onClose: () => void;
}

export const ConflictDialog: React.FC<ConflictDialogProps> = ({
  isOpen,
  serverRevision,
  onReload,
  onOverwrite,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Concurrency Conflict
              </h2>
              <p className="text-xs text-muted-foreground">
                Server revision: {serverRevision ?? 'Unknown'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-4 text-sm text-foreground/80 leading-relaxed">
          This board has been updated in another tab or session. To prevent
          accidental loss of data, choose how you would like to proceed:
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={onReload}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reload latest version from server</span>
          </button>

          <button
            onClick={onOverwrite}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Overwrite server with local canvas</span>
          </button>
        </div>
      </div>
    </div>
  );
};

