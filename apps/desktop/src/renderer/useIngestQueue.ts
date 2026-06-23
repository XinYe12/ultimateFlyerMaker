import { useState } from "react";
import { IngestItem } from "./types";
import { v4 as uuidv4 } from "uuid";

export function useIngestQueue() {
  const [queue, setQueue] = useState<IngestItem[]>([]);

  // ---------- INGEST (two-phase) ----------
  async function enqueue(paths: string[], options?: { slotIndex?: number }) {
    for (const path of paths) {
      const id = uuidv4();

      setQueue(prev => [
        ...prev,
        { id, path, status: "running", slotIndex: options?.slotIndex },
      ]);

      try {
        // Phase 1: OCR + LLM — card appears immediately after this resolves
        const phase1 = await window.ufm.ingestPhotoPhase1(path);

        setQueue(prev =>
          prev.map(item =>
            item.id === id
              ? {
                  ...item,
                  status: "processing_cutout",
                  result: {
                    ...phase1,
                    title: phase1.title,
                    aiTitle: phase1.aiTitle,
                  },
                }
              : item
          )
        );

        // Phase 2: cutout + shadow + sizing — fire-and-forget; result arrives via onCutoutComplete
        await window.ufm.startCutout(id, path);
      } catch (err: any) {
        setQueue(prev =>
          prev.map(item =>
            item.id === id ? { ...item, status: "error", error: String(err) } : item
          )
        );
      }
    }
  }

  // ---------- CUTOUT PATCH (called from App.tsx when ufm:cutoutComplete fires) ----------
  function applyCutoutPatch(id: string, patch: { cutoutPath: string; layout?: { size: string } }) {
    setQueue(prev =>
      prev.map(item =>
        item.id === id
          ? {
              ...item,
              status: "done",
              result: item.result ? { ...item.result, ...patch } : item.result,
            }
          : item
      )
    );
  }

  function applyCutoutError(id: string, _error: string) {
    setQueue(prev =>
      prev.map(item =>
        item.id === id ? { ...item, status: "cutout_error" } : item
      )
    );
  }

  // ---------- EDITOR UPDATE ----------
  function updateItem(id: string, patch: Partial<IngestItem>) {
    setQueue(prev =>
      prev.map(item => {
        if (item.id !== id) return item;

        return {
          ...item,
          ...patch,

          // merge result safely (authoritative editor state)
          result: patch.result
            ? {
                ...item.result,
                ...patch.result,
              }
            : item.result,

          // merge editor flags
          userEdited: patch.userEdited
            ? {
                ...item.userEdited,
                ...patch.userEdited,
              }
            : item.userEdited,
        };
      })
    );
  }

  // ---------- RETRY ----------
  function retry(id: string) {
    const item = queue.find(q => q.id === id);
    if (!item) return;
    enqueue([item.path]);
  }

  // ---------- REMOVE ----------
  function remove(id: string) {
    setQueue(prev => prev.filter(item => item.id !== id));
  }

  // ---------- CLEAR ----------
  function clear() {
    setQueue([]);
  }

  // ---------- LOAD PRE-PROCESSED ITEMS ----------
  function loadItems(items: IngestItem[]) {
    setQueue(items);
  }

  // ---------- ADD SINGLE PRE-PROCESSED ITEM ----------
  function addItem(item: IngestItem) {
    setQueue(prev => [...prev, item]);
  }

  // ---------- REPLACE ITEM IN-PLACE (preserves ordering) ----------
  function replaceItem(oldId: string, newItem: IngestItem) {
    setQueue(prev => prev.map(item => item.id === oldId ? newItem : item));
  }

  return {
    queue,          // editor state
    enqueue,
    updateItem,     // authoritative editor mutations
    applyCutoutPatch,
    applyCutoutError,
    retry,
    remove,
    clear,
    loadItems,
    addItem,
    replaceItem,
  };
}
