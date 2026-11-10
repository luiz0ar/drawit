import { useState, useEffect, useRef, useCallback } from 'react';
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

  const currentRevisionRef = useRef<number>(initialRevision);
  const lastSavedHashRef = useRef<string>('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPayloadRef = useRef<{
    elements: CanvasElement[];
    viewport: ViewportTransform;
  } | null>(null);

  // Sync ref with initialRevision when boardId or initialRevision changes
  useEffect(() => {
    currentRevisionRef.current = initialRevision;
    setLastSavedRevision(initialRevision);
    setStatus('saved');
    setErrorMessage(null);
    setConflictServerRevision(null);
  }, [boardId, initialRevision]);

  const saveImmediate = useCallback(
    async (elements: CanvasElement[], viewport: ViewportTransform, forceRevision?: number) => {
      if (!boardId) return;

      const hash = computeContentHash(elements, viewport);
      if (hash === lastSavedHashRef.current && status === 'saved') {
        return;
      }

      setStatus('saving');
      setErrorMessage(null);

      const targetRevision = forceRevision !== undefined ? forceRevision : currentRevisionRef.current;

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
        });

        currentRevisionRef.current = res.revision;
        setLastSavedRevision(res.revision);
        lastSavedHashRef.current = hash;
        setStatus('saved');
        setConflictServerRevision(null);
      } catch (err) {
        if (err instanceof ApiError && err.problem.status === 409) {
          const sRev = err.problem.serverRevision || targetRevision + 1;
          setConflictServerRevision(sRev);
          setStatus('conflict');
          onConflict?.(sRev);
        } else {
          setStatus('error');
          setErrorMessage(err instanceof Error ? err.message : 'Failed to save changes');
        }
      }
    },
    [boardId, status, onConflict]
  );

  const scheduleSave = useCallback(
    (elements: CanvasElement[], viewport: ViewportTransform) => {
      if (!boardId) return;

      const hash = computeContentHash(elements, viewport);
      if (hash === lastSavedHashRef.current) return;

      pendingPayloadRef.current = { elements, viewport };
      setStatus('idle');

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        if (pendingPayloadRef.current) {
          saveImmediate(
            pendingPayloadRef.current.elements,
            pendingPayloadRef.current.viewport
          );
        }
      }, debounceMs);
    },
    [boardId, debounceMs, saveImmediate]
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

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    status,
    errorMessage,
    conflictServerRevision,
    currentRevision: lastSavedRevision,
    scheduleSave,
    saveImmediate,
    resolveConflictByOverwrite,
    setSavedHash: (hash: string) => {
      lastSavedHashRef.current = hash;
    },
  };
}
