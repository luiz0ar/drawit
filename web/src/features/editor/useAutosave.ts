import { useState, useEffect, useRef, useCallback } from 'react';
import { openDB, IDBPDatabase } from 'idb';
import { BoardApi, ApiError } from '../../lib/api';
import { CanvasElement } from '../../canvas/engine/types';
import { ViewportTransform } from '../../canvas/engine/coordinates';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

interface UseAutosaveProps {
  boardId: string | null;
  initialRevision: number;
  onConflict?: (serverRevision: number) => void;
  debounceMs?: number;
}

interface WalEntry {
  boardId: string;
  revision: number;
  contentHash: string;
  elements: CanvasElement[];
  viewport: ViewportTransform;
  updatedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getWalDb(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = openDB('drawit_wal', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pending_scenes')) {
          db.createObjectStore('pending_scenes', { keyPath: 'boardId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function writeWalEntry(entry: WalEntry): Promise<void> {
  try {
    const db = await getWalDb();
    if (db) {
      await db.put('pending_scenes', entry);
    }
  } catch (err) {
    console.warn(`[useAutosave] Failed to persist WAL entry for board "${entry.boardId}":`, err);
  }
}

export async function clearWalEntry(boardId: string): Promise<void> {
  try {
    const db = await getWalDb();
    if (db) {
      await db.delete('pending_scenes', boardId);
    }
  } catch (err) {
    console.warn(`[useAutosave] Failed to delete WAL entry for board "${boardId}":`, err);
  }
}

export async function readWalEntry(boardId: string): Promise<WalEntry | undefined> {
  try {
    const db = await getWalDb();
    if (db) {
      return await db.get('pending_scenes', boardId);
    }
  } catch (err) {
    console.warn(`[useAutosave] Failed to read WAL entry for board "${boardId}":`, err);
  }
  return undefined;
}

export function computeContentHash(elements: CanvasElement[], viewport: ViewportTransform): string {
  const str = JSON.stringify({ elements, viewport });
  // Fast 32-bit FNV-1a hash formatted as hex
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function useAutosave({
  boardId,
  initialRevision,
  onConflict,
  debounceMs = 1500,
}: UseAutosaveProps) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [lastSavedRevision, setLastSavedRevision] = useState<number>(initialRevision);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictServerRevision, setConflictServerRevision] = useState<number | null>(null);

  const statusRef = useRef<SaveStatus>('saved');
  const onConflictRef = useRef(onConflict);
  onConflictRef.current = onConflict;

  const currentRevisionRef = useRef<number>(initialRevision);
  const lastSavedHashRef = useRef<string>('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPayloadRef = useRef<{
    elements: CanvasElement[];
    viewport: ViewportTransform;
    thumbnail?: string | null;
  } | null>(null);

  const updateStatus = useCallback((next: SaveStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  // Sync ref with initialRevision when boardId or initialRevision changes
  useEffect(() => {
    currentRevisionRef.current = initialRevision;
    setLastSavedRevision(initialRevision);
    updateStatus('saved');
    setErrorMessage(null);
    setConflictServerRevision(null);
  }, [boardId, initialRevision, updateStatus]);

  const saveImmediate = useCallback(
    async (
      elements: CanvasElement[],
      viewport: ViewportTransform,
      forceRevision?: number,
      thumbnail?: string | null
    ) => {
      if (!boardId || boardId.startsWith('local-')) return;

      const hash = computeContentHash(elements, viewport);
      if (hash === lastSavedHashRef.current && statusRef.current === 'saved' && forceRevision === undefined) {
        return;
      }

      updateStatus('saving');
      setErrorMessage(null);

      const targetRevision =
        forceRevision !== undefined ? forceRevision : currentRevisionRef.current;

      try {
        const res = await BoardApi.saveScene(boardId, {
          revision: targetRevision,
          content_hash: hash,
          last_client_save_id: crypto.randomUUID(),
          elements,
          viewport: {
            pan_x: viewport.panX,
            pan_y: viewport.panY,
            zoom: viewport.zoom,
          },
          thumbnail: thumbnail ?? undefined,
        });

        currentRevisionRef.current = res.revision;
        setLastSavedRevision(res.revision);
        lastSavedHashRef.current = hash;
        pendingPayloadRef.current = null;
        updateStatus('saved');
        setConflictServerRevision(null);
        await clearWalEntry(boardId);
      } catch (err) {
        if (err instanceof ApiError && err.problem.status === 409) {
          const sRev = err.problem.serverRevision || targetRevision + 1;
          setConflictServerRevision(sRev);
          updateStatus('conflict');
          onConflictRef.current?.(sRev);
        } else {
          updateStatus('error');
          setErrorMessage(err instanceof Error ? err.message : 'Failed to save changes');
        }
      }
    },
    [boardId, updateStatus]
  );

  const scheduleSave = useCallback(
    (elements: CanvasElement[], viewport: ViewportTransform, thumbnail?: string | null) => {
      if (!boardId || boardId.startsWith('local-')) return;

      const hash = computeContentHash(elements, viewport);
      if (hash === lastSavedHashRef.current) return;

      pendingPayloadRef.current = { elements, viewport, thumbnail };
      updateStatus('idle');

      // Immediately write to IndexedDB WAL for zero data loss
      void writeWalEntry({
        boardId,
        revision: currentRevisionRef.current,
        contentHash: hash,
        elements,
        viewport,
        updatedAt: Date.now(),
      });

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        if (pendingPayloadRef.current) {
          void saveImmediate(
            pendingPayloadRef.current.elements,
            pendingPayloadRef.current.viewport,
            undefined,
            pendingPayloadRef.current.thumbnail
          );
        }
      }, debounceMs);
    },
    [boardId, debounceMs, saveImmediate, updateStatus]
  );

  // Overwrite conflict by adopting server revision and saving current elements
  const resolveConflictByOverwrite = useCallback(
    async (elements: CanvasElement[], viewport: ViewportTransform) => {
      if (conflictServerRevision !== null) {
        currentRevisionRef.current = conflictServerRevision;
        await saveImmediate(elements, viewport, conflictServerRevision);
      }
    },
    [conflictServerRevision, saveImmediate]
  );

  // Flush or warn on beforeunload if changes are unsaved
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingPayloadRef.current && boardId && !boardId.startsWith('local-')) {
        void saveImmediate(
          pendingPayloadRef.current.elements,
          pendingPayloadRef.current.viewport,
          undefined,
          pendingPayloadRef.current.thumbnail
        );
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [boardId, saveImmediate]);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const setSavedHash = useCallback((hash: string) => {
    lastSavedHashRef.current = hash;
  }, []);

  return {
    status,
    errorMessage,
    conflictServerRevision,
    currentRevision: lastSavedRevision,
    scheduleSave,
    saveImmediate,
    resolveConflictByOverwrite,
    setSavedHash,
  };
}
