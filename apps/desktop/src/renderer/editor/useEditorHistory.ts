import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  captureSnapshot,
  applySnapshotToQueue,
  snapshotsEqual,
  type EditorSnapshot,
  type HistoryEntry,
} from './editorHistory';
import type { CardLayout, DiscountLabel, IngestItem } from '../types';

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 350;
const RESTORE_GUARD_MS = 500;

export type EditorHistoryState = {
  cardLayouts: Record<string, CardLayout>;
  slotOverrides: Record<number, { x: number; y: number; width: number; height: number }>;
  userRowCounts: Record<string, number>;
  editorQueue: IngestItem[];
  discountLabels: DiscountLabel[];
};

type UseEditorHistoryOptions = {
  enabled: boolean;
  getState: () => EditorHistoryState;
  applySnapshot: (snapshot: EditorSnapshot, currentQueue: IngestItem[]) => void;
  resetKey: string | undefined;
};

export function useEditorHistory({
  enabled,
  getState,
  applySnapshot,
  resetKey,
}: UseEditorHistoryOptions) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [hasUncommittedChanges, setHasUncommittedChanges] = useState(false);

  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRestoringRef = useRef(false);
  const nextCommitLabelRef = useRef('Edit');
  const nextCommitDepartmentsRef = useRef<string[]>(['*']);
  const getStateRef = useRef(getState);
  getStateRef.current = getState;
  const applySnapshotRef = useRef(applySnapshot);
  applySnapshotRef.current = applySnapshot;

  const captureCurrent = useCallback((): EditorSnapshot => {
    const s = getStateRef.current();
    return captureSnapshot(
      s.cardLayouts,
      s.slotOverrides,
      s.userRowCounts,
      s.editorQueue,
      s.discountLabels,
    );
  }, []);

  const restoreSnapshot = useCallback((snapshot: EditorSnapshot) => {
    isRestoringRef.current = true;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    applySnapshotRef.current(snapshot, getStateRef.current().editorQueue);
    setTimeout(() => {
      isRestoringRef.current = false;
    }, RESTORE_GUARD_MS);
  }, []);

  const pushEntry = useCallback((snapshot: EditorSnapshot, label: string, departments: string[]) => {
    const entry: HistoryEntry = {
      id: uuidv4(),
      label,
      departments,
      timestamp: Date.now(),
      snapshot,
    };
    setEntries(prev => {
      const truncated = prev.slice(0, currentIndexRef.current + 1);
      const next = [...truncated, entry];
      const trimmed = next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      const newIndex = trimmed.length - 1;
      setCurrentIndex(newIndex);
      currentIndexRef.current = newIndex;
      return trimmed;
    });
    setHasUncommittedChanges(false);
  }, []);

  const flushDebouncedCommit = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (isRestoringRef.current) return;

    const current = captureCurrent();
    const idx = currentIndexRef.current;
    const committed = idx >= 0 ? entriesRef.current[idx]?.snapshot : null;

    if (committed && snapshotsEqual(current, committed)) {
      setHasUncommittedChanges(false);
      return;
    }
    if (!committed && idx < 0) {
      pushEntry(current, 'Open job', ['*']);
      return;
    }
    if (committed && !snapshotsEqual(current, committed)) {
      pushEntry(current, nextCommitLabelRef.current, nextCommitDepartmentsRef.current);
    }
  }, [captureCurrent, pushEntry]);

  const commitNow = useCallback((label: string, departments: string[]) => {
    flushDebouncedCommit();
    nextCommitLabelRef.current = label;
    nextCommitDepartmentsRef.current = departments;
  }, [flushDebouncedCommit]);

  const commitDebounced = useCallback((label: string, departments: string[]) => {
    nextCommitLabelRef.current = label;
    nextCommitDepartmentsRef.current = departments;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (isRestoringRef.current) return;
      const current = captureCurrent();
      const idx = currentIndexRef.current;
      const committed = idx >= 0 ? entriesRef.current[idx]?.snapshot : null;
      if (committed && snapshotsEqual(current, committed)) {
        setHasUncommittedChanges(false);
        return;
      }
      pushEntry(current, nextCommitLabelRef.current, nextCommitDepartmentsRef.current);
    }, DEBOUNCE_MS);
  }, [captureCurrent, pushEntry]);

  // Reset timeline when job changes
  useEffect(() => {
    if (!enabled || !resetKey) return;
    setEntries([]);
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
    setHasUncommittedChanges(false);
    isRestoringRef.current = false;
    nextCommitLabelRef.current = 'Open job';
    nextCommitDepartmentsRef.current = ['*'];
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  }, [enabled, resetKey]);

  // Auto-track state changes with debounce
  const stateVersion = enabled
    ? JSON.stringify({
        cardLayouts: getState().cardLayouts,
        slotOverrides: getState().slotOverrides,
        userRowCounts: getState().userRowCounts,
        queueLen: getState().editorQueue.length,
        queueSig: getState().editorQueue.map(i => `${i.id}:${i.status}:${i.path}`).join('|'),
        discountLabels: getState().discountLabels,
      })
    : '';

  useEffect(() => {
    if (!enabled || !resetKey) return;
    if (isRestoringRef.current) return;

    const current = captureCurrent();
    const idx = currentIndexRef.current;
    const committed = idx >= 0 ? entriesRef.current[idx]?.snapshot : null;
    const uncommitted = committed ? !snapshotsEqual(current, committed) : idx < 0;
    setHasUncommittedChanges(uncommitted);

    if (!uncommitted) {
      if (idx < 0 && entriesRef.current.length === 0) {
        pushEntry(current, 'Open job', ['*']);
      }
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (isRestoringRef.current) return;
      const snap = captureCurrent();
      const ci = currentIndexRef.current;
      const base = ci >= 0 ? entriesRef.current[ci]?.snapshot : null;
      if (base && snapshotsEqual(snap, base)) {
        setHasUncommittedChanges(false);
        return;
      }
      pushEntry(snap, nextCommitLabelRef.current, nextCommitDepartmentsRef.current);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [enabled, resetKey, stateVersion, captureCurrent, pushEntry]);

  const undo = useCallback(() => {
    const current = captureCurrent();
    const idx = currentIndexRef.current;
    const committed = idx >= 0 ? entriesRef.current[idx]?.snapshot : null;

    if (committed && !snapshotsEqual(current, committed)) {
      restoreSnapshot(committed);
      setHasUncommittedChanges(false);
      return;
    }

    if (idx <= 0) return;
    const newIndex = idx - 1;
    setCurrentIndex(newIndex);
    currentIndexRef.current = newIndex;
    restoreSnapshot(entriesRef.current[newIndex].snapshot);
    setHasUncommittedChanges(false);
  }, [captureCurrent, restoreSnapshot]);

  const redo = useCallback(() => {
    const idx = currentIndexRef.current;
    if (idx >= entriesRef.current.length - 1) return;
    const newIndex = idx + 1;
    setCurrentIndex(newIndex);
    currentIndexRef.current = newIndex;
    restoreSnapshot(entriesRef.current[newIndex].snapshot);
    setHasUncommittedChanges(false);
  }, [restoreSnapshot]);

  const jumpTo = useCallback((index: number) => {
    if (index < 0 || index >= entriesRef.current.length) return;
    setCurrentIndex(index);
    currentIndexRef.current = index;
    restoreSnapshot(entriesRef.current[index].snapshot);
    setHasUncommittedChanges(false);
  }, [restoreSnapshot]);

  const canUndo = currentIndex > 0 || hasUncommittedChanges;
  const canRedo = currentIndex < entries.length - 1;

  return {
    entries,
    currentIndex,
    hasUncommittedChanges,
    canUndo,
    canRedo,
    commitNow,
    commitDebounced,
    undo,
    redo,
    jumpTo,
    isRestoringRef,
  };
}

export { applySnapshotToQueue };
