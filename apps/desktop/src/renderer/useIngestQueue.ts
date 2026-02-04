import { useState } from "react";
import { IngestItem } from "./types";
import { v4 as uuidv4 } from "uuid";

export function useIngestQueue() {
  const [queue, setQueue] = useState<IngestItem[]>([]);

  // ---------- INGEST ----------
  async function enqueue(paths: string[]) {
    for (const path of paths) {
      const id = uuidv4();

      setQueue(prev => [
        ...prev,
        {
          id,
          path,
          status: "running",
        },
      ]);

      try {
        const result = await window.ufm.ingestPhoto(path);

        setQueue(prev =>
          prev.map(item =>
            item.id === id
              ? {
                  ...item,
                  status: "done",
                  result: {
                    ...result,
                    // editor-state invariants
                    title: result.title,
                    aiTitle: result.aiTitle,
                  },
                }
              : item
          )
        );
      } catch (err: any) {
        setQueue(prev =>
          prev.map(item =>
            item.id === id
              ? {
                  ...item,
                  status: "error",
                  error: String(err),
                }
              : item
          )
        );
      }
    }
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

  return {
    queue,          // editor state
    enqueue,
    updateItem,     // authoritative editor mutations
    retry,
    remove,
    clear,
    loadItems,
  };
}
