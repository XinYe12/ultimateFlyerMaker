// apps/desktop/src/renderer/useIngestQueue.ts

import { useEffect, useRef, useState } from "react";
import { IngestItem } from "./types";

export function useIngestQueue() {
  const [queue, setQueue] = useState<IngestItem[]>([]);
  const runningRef = useRef(false);

  /* ---------- enqueue ---------- */
  const enqueue = (paths: string[]) => {
    setQueue(prev => {
      const existing = new Set(prev.map(i => i.path));
      return prev.concat(
        paths
          .filter(p => !existing.has(p))
          .map(p => ({
            id: crypto.randomUUID(),
            path: p,
            status: "pending",
          }))
      );
    });
  };

  /* ---------- single-worker ---------- */
  useEffect(() => {
    if (runningRef.current) return;

    const next = queue.find(q => q.status === "pending");
    if (!next) return;

    if (!window.ufm?.ingestPhoto) {
      console.error("UFM IPC not available");
      return;
    }

    runningRef.current = true;

    setQueue(prev =>
      prev.map(q =>
        q.id === next.id ? { ...q, status: "running" } : q
      )
    );

    (async () => {
      try {
        // ingestPhoto now returns ONE object, not array
        const result = await window.ufm.ingestPhoto(next.path);

        setQueue(prev =>
          prev.map(q =>
            q.id === next.id
              ? { ...q, status: "done", result }
              : q
          )
        );
      } catch (err: any) {
        setQueue(prev =>
          prev.map(q =>
            q.id === next.id
              ? {
                  ...q,
                  status: "error",
                  error: err?.message ?? String(err),
                }
              : q
          )
        );
      } finally {
        runningRef.current = false;
      }
    })();
  }, [queue]);

  /* ---------- controls ---------- */
  const retry = (id: string) =>
    setQueue(prev =>
      prev.map(q =>
        q.id === id
          ? {
              ...q,
              status: "pending",
              error: undefined,
              result: undefined,
            }
          : q
      )
    );

  const remove = (id: string) =>
    setQueue(prev => prev.filter(q => q.id !== id));

  const clear = () => setQueue([]);

  return { queue, enqueue, retry, remove, clear };
}
