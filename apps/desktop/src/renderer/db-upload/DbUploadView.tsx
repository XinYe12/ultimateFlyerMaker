import { useState, useEffect, useRef, useCallback } from "react";
import type { DbBatchProgressEvent, DbBatchCompleteEvent, DbParsedMetadata, QuotaStatus, QuotaEntry, DbSyncReport, DbSyncResult, ScanNonProductsProgressEvent, ScanNonProductsCompleteEvent } from "../global";

type DbUploadStatus =
  | "pending"
  | "hashing"
  | "dedup"
  | "analyzing"
  | "analyzed"
  | "uploading"
  | "saving"
  | "done"
  | "duplicate"
  | "skipped"
  | "error"
  | "needs_confirmation";

type DbUploadItem = {
  id: string;
  path: string;
  status: DbUploadStatus;
  title?: string;
  publicUrl?: string;
  error?: string;
  parsed?: DbParsedMetadata & { isProduct?: boolean; ocrText?: string };
  embedding?: number[];
};

type Props = {
  onBack: () => void;
};

const CHUNK_SIZE = 50;

let idCounter = 0;
function newId() {
  return `dbup_${Date.now()}_${++idCounter}`;
}

const STEP_LABELS: Record<DbUploadStatus, string> = {
  pending: "Pending",
  hashing: "Hashing…",
  dedup: "Checking duplicates…",
  analyzing: "OCR + AI…",
  analyzed: "AI done",
  uploading: "Uploading…",
  saving: "Saving to DB…",
  done: "Done",
  duplicate: "Already in DB",
  skipped: "Not a product",
  error: "Error",
  needs_confirmation: "Awaiting confirmation",
};

const IN_PROGRESS_STATUSES: DbUploadStatus[] = [
  "hashing",
  "dedup",
  "analyzing",
  "uploading",
  "saving",
];

type DbConnectionStatus = "checking" | "connected" | "disconnected";

function DbStatusButton({
  dbCount,
  status,
  error,
  onRefresh,
}: {
  dbCount: number | null;
  status: DbConnectionStatus;
  error: string | null;
  onRefresh: () => void;
}) {
  const countStr = dbCount !== null ? dbCount.toLocaleString() : "—";
  let statusLabel = "Checking…";
  let statusColor = "#868E96";
  let statusBg = "#F1F3F5";

  if (status === "connected") {
    statusLabel = "Connected";
    statusColor = "#2F9E44";
    statusBg = "#D3F9D8";
  } else if (status === "disconnected") {
    statusLabel = "Disconnected";
    statusColor = "#C92A2A";
    statusBg = "#FFE3E3";
  } else {
    statusLabel = "Checking…";
  }

  return (
    <button
      type="button"
      onClick={onRefresh}
      title={error ? `Error: ${error}` : "Click to check connection"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 8,
        border: "1px solid #DEE2E6",
        background: "#fff",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <span style={{ color: "#495057" }}>DB: {countStr}</span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 6,
          background: statusBg,
          color: statusColor,
        }}
      >
        {status === "checking" && (
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              border: "2px solid currentColor",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "ufm-spin 0.7s linear infinite",
            }}
          />
        )}
        {status === "connected" && <span>●</span>}
        {status === "disconnected" && <span>●</span>}
        {statusLabel}
      </span>
    </button>
  );
}

type OllamaStatus = "checking" | "available" | "unavailable";

const OLLAMA_CHECK_TIMEOUT_MS = 5000;

function checkOllamaStatus(): Promise<{ ok: boolean; model?: string; error?: string }> {
  const timeout = new Promise<{ ok: false; error: string }>((resolve) =>
    setTimeout(() => resolve({ ok: false, error: "Check timed out" }), OLLAMA_CHECK_TIMEOUT_MS)
  );
  return Promise.race([
    window.ufm.checkOllamaStatus(),
    timeout,
  ]);
}

function OllamaStatusButton({
  status,
  model,
  error,
  onRefresh,
}: {
  status: OllamaStatus;
  model?: string;
  error: string | null;
  onRefresh: () => void;
}) {
  const modelStr = model ? model.split(":")[0] : "—";
  let statusLabel = "Checking…";
  let statusColor = "#868E96";
  let statusBg = "#F1F3F5";

  if (status === "available") {
    statusLabel = "Connected";
    statusColor = "#2F9E44";
    statusBg = "#D3F9D8";
  } else if (status === "unavailable") {
    statusLabel = "Disconnected";
    statusColor = "#C92A2A";
    statusBg = "#FFE3E3";
  } else {
    statusLabel = "Checking…";
  }

  return (
    <button
      type="button"
      onClick={onRefresh}
      title={error ? `Error: ${error}` : "Click to test Ollama embed model"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 8,
        border: "1px solid #DEE2E6",
        background: "#fff",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <span style={{ color: "#495057" }}>Embed: {modelStr}</span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 6,
          background: statusBg,
          color: statusColor,
        }}
      >
        {status === "checking" && (
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              border: "2px solid currentColor",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "ufm-spin 0.7s linear infinite",
            }}
          />
        )}
        {status === "available" && <span>●</span>}
        {status === "unavailable" && <span>●</span>}
        {statusLabel}
      </span>
    </button>
  );
}

function StatusBadge({ item }: { item: DbUploadItem }) {
  const isInProgress = IN_PROGRESS_STATUSES.includes(item.status);
  let bg = "#868E96";
  let color = "#fff";

  if (isInProgress) {
    bg = "#228BE6";
  } else if (item.status === "analyzed") {
    bg = "#0CA678"; // teal — AI done, saving in progress next
  } else if (item.status === "done") {
    bg = "#2F9E44";
  } else if (item.status === "duplicate") {
    bg = "#E8590C";
  } else if (item.status === "skipped") {
    bg = "#868E96";
  } else if (item.status === "error") {
    bg = "#C92A2A";
  } else if (item.status === "needs_confirmation") {
    bg = "#E67700"; // orange — awaiting user decision
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: bg,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {isInProgress && (
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            border: "2px solid rgba(255,255,255,0.4)",
            borderTopColor: "#fff",
            borderRadius: "50%",
            animation: "ufm-spin 0.7s linear infinite",
          }}
        />
      )}
      {item.status === "done" && "✓ "}
      {item.status === "duplicate" && "⊘ "}
      {item.status === "skipped" && "⊖ "}
      {item.status === "error" && "✗ "}
      {STEP_LABELS[item.status]}
    </span>
  );
}

const DB_CHECK_TIMEOUT_MS = 8000;
const MIN_CHECK_DISPLAY_MS = 2000; // Keep "Checking…" visible so user sees progress

function checkDbConnection(): Promise<{ ok: boolean; count?: number; error?: string }> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Connection timed out. Check your network or VPN.")), DB_CHECK_TIMEOUT_MS)
  );
  return Promise.race([
    window.ufm.getDbStats().then((r: { count: number; error?: string }) =>
      r.error ? { ok: false, error: r.error } : { ok: true, count: r.count }
    ),
    timeout,
  ]).catch((err) => ({ ok: false, error: err?.message || String(err) }));
}

export default function DbUploadView({ onBack }: Props) {
  const [items, setItems] = useState<DbUploadItem[]>([]);
  const [dbCount, setDbCount] = useState<number | null>(null);
  const [dbStatus, setDbStatus] = useState<DbConnectionStatus>("checking");
  const [dbError, setDbError] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>("checking");
  const [ollamaModel, setOllamaModel] = useState<string | null>(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState({ added: 0, duplicates: 0, skipped: 0, errors: 0 });
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState<number | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const pendingUpdatesRef = useRef<Map<string, Partial<DbUploadItem>>>(new Map());

  const refreshQuota = useCallback(() => {
    setQuotaLoading(true);
    window.ufm.getQuotaStatus()
      .then(setQuota)
      .catch(() => {})
      .finally(() => setQuotaLoading(false));
  }, []);

  const refreshDbConnection = useCallback(() => {
    setDbStatus("checking");
    setDbError(null);
    const start = Date.now();
    checkDbConnection().then((res) => {
      const elapsed = Date.now() - start;
      const wait = Math.max(0, MIN_CHECK_DISPLAY_MS - elapsed);
      const apply = () => {
        if (res.ok) {
          setDbCount(res.count ?? null);
          setDbStatus("connected");
          setDbError(null);
        } else {
          setDbStatus("disconnected");
          setDbError(res.error ?? "Connection failed");
        }
      };
      if (wait > 0) setTimeout(apply, wait);
      else apply();
    });
  }, []);

  const refreshOllamaStatus = useCallback(() => {
    setOllamaStatus("checking");
    setOllamaError(null);
    const start = Date.now();
    checkOllamaStatus().then((res) => {
      const elapsed = Date.now() - start;
      const wait = Math.max(0, MIN_CHECK_DISPLAY_MS - elapsed);
      const apply = () => {
        if (res.ok) {
          setOllamaStatus("available");
          setOllamaModel(res.model ?? null);
          setOllamaError(null);
        } else {
          setOllamaStatus("unavailable");
          setOllamaError(res.error ?? "Check failed");
        }
      };
      if (wait > 0) setTimeout(apply, wait);
      else apply();
    });
  }, []);

  const handleClearCutoutCache = useCallback(async () => {
    setClearingCache(true);
    setCacheCleared(null);
    try {
      const res = await window.ufm.clearCutoutCache();
      setCacheCleared(res.cleared ?? 0);
      setTimeout(() => setCacheCleared(null), 4000);
    } finally {
      setClearingCache(false);
    }
  }, []);

  // Check DB, Ollama, and quota on mount
  useEffect(() => {
    refreshDbConnection();
    refreshOllamaStatus();
    refreshQuota();
  }, [refreshDbConnection, refreshOllamaStatus, refreshQuota]);

  // Subscribe to IPC progress/complete events
  useEffect(() => {
    const unsubProgress = window.ufm.onDbBatchProgress((data: DbBatchProgressEvent) => {
      pendingUpdatesRef.current.set(data.path, {
        status: data.status,
        title: data.title,
        publicUrl: data.publicUrl,
        error: data.error,
        parsed: data.parsed,
        embedding: data.embedding,
      });
    });

    const flushTimer = setInterval(() => {
      if (pendingUpdatesRef.current.size === 0) return;
      const snapshot = new Map(pendingUpdatesRef.current);
      pendingUpdatesRef.current.clear();
      setItems((prev) => prev.map((item) => {
        const u = snapshot.get(item.path);
        if (!u) return item;
        return {
          ...item,
          status: u.status ?? item.status,
          title: u.title ?? item.title,
          publicUrl: u.publicUrl ?? item.publicUrl,
          error: u.error ?? item.error,
          parsed: u.parsed ?? item.parsed,
          embedding: u.embedding ?? item.embedding,
        };
      }));
    }, 100);

    const unsubComplete = window.ufm.onDbBatchComplete((data: DbBatchCompleteEvent) => {
      processingRef.current = false;

      // Flush any buffered progress updates immediately
      if (pendingUpdatesRef.current.size > 0) {
        const snapshot = new Map(pendingUpdatesRef.current);
        pendingUpdatesRef.current.clear();
        setItems((prev) => prev.map((item) => {
          const u = snapshot.get(item.path);
          if (!u) return item;
          return {
            ...item,
            status: u.status ?? item.status,
            title: u.title ?? item.title,
            publicUrl: u.publicUrl ?? item.publicUrl,
            error: u.error ?? item.error,
            parsed: u.parsed ?? item.parsed,
            embedding: u.embedding ?? item.embedding,
          };
        }));
      }

      setSessionStats((prev) => ({
        added: prev.added + (data.added ?? 0),
        duplicates: prev.duplicates + (data.duplicates ?? 0),
        skipped: prev.skipped + (data.skipped ?? 0),
        errors: prev.errors + (data.errors ?? 0),
      }));
      const terminal: DbUploadStatus[] = ["done", "duplicate", "skipped", "analyzed", "error", "needs_confirmation"];
      // If batch errored or any item is still in-progress, mark stuck items as error
      const errMsg = data.error ?? "Processing did not complete";
      setItems((prev) =>
        prev.map((item) =>
          !terminal.includes(item.status)
            ? { ...item, status: "error" as const, error: item.error ?? errMsg }
            : item
        )
      );
      if (data.error) console.error("[DbUploadView] batch failed:", data.error);
      // Refresh DB, Ollama, and quota status
      refreshDbConnection();
      refreshOllamaStatus();
      refreshQuota();
      // Drain next batch if queued
      drainQueue();
    });

    return () => {
      unsubProgress();
      unsubComplete();
      clearInterval(flushTimer);
    };
  }, [refreshDbConnection, refreshOllamaStatus, refreshQuota]);

  const drainQueue = useCallback(() => {
    if (processingRef.current) return;
    if (queueRef.current.length === 0) return;
    const batchPaths = queueRef.current.splice(0, CHUNK_SIZE);
    processingRef.current = true;
    const batchItems: DbUploadItem[] = batchPaths.map((p) => ({
      id: newId(), path: p, status: "pending" as const,
    }));
    setItems((prev) => [...prev, ...batchItems]);
    setQueuedCount((n) => Math.max(0, n - batchPaths.length));
    window.ufm.startDbBatch(batchPaths).catch((err: Error) => {
      console.error("[DbUploadView] startDbBatch error:", err);
      processingRef.current = false;
      drainQueue();
    });
  }, []);

  const handleFilesAdded = useCallback(
    (filePaths: string[]) => {
      const imageExts = /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i;
      const validPaths = filePaths.filter((p) => imageExts.test(p));
      if (validPaths.length === 0) return;
      queueRef.current.push(...validPaths);
      setQueuedCount((n) => n + validPaths.length);
      drainQueue();
    },
    [drainQueue]
  );

  // Drag-and-drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const paths: string[] = [];
    for (const file of Array.from(e.dataTransfer.files)) {
      if ((file as any).path) paths.push((file as any).path);
    }
    if (paths.length === 0) return;
    const resolved = await window.ufm.resolveDroppedPaths(paths);
    handleFilesAdded(resolved);
  };

  const handlePickFolder = async () => {
    const paths = await window.ufm.openFolderDialog();
    if (paths.length > 0) handleFilesAdded(paths);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const paths = files.map((f) => (f as any).path).filter(Boolean);
    handleFilesAdded(paths);
    // Reset input so the same files can be picked again
    e.target.value = "";
  };

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const doneCount = items.filter((i) => i.status === "done").length;

  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleConfirmAdd = useCallback(
    async (item: DbUploadItem) => {
      if (item.status !== "needs_confirmation" || !item.embedding?.length) return;
      setConfirmingId(item.id);
      try {
        const res = await window.ufm.confirmDbImage(
          item.path,
          "add",
          item.parsed,
          item.embedding
        );
        if (res.ok && res.productId) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: "done" as const, title: res.title, publicUrl: res.publicUrl }
                : i
            )
          );
          setSessionStats((s) => ({ ...s, added: s.added + 1 }));
          refreshDbConnection();
        } else {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: res.duplicate ? ("duplicate" as const) : ("error" as const),
                    error: res.error ?? "Failed to add",
                  }
                : i
            )
          );
          if (res.duplicate) {
            setSessionStats((s) => ({ ...s, duplicates: s.duplicates + 1 }));
          } else {
            setSessionStats((s) => ({ ...s, errors: s.errors + 1 }));
          }
        }
      } catch (err: any) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "error" as const, error: err?.message ?? "Failed" }
              : i
          )
        );
        setSessionStats((s) => ({ ...s, errors: s.errors + 1 }));
      } finally {
        setConfirmingId(null);
      }
    },
    [refreshDbConnection]
  );

  const handleConfirmSkip = useCallback((item: DbUploadItem) => {
    if (item.status !== "needs_confirmation") return;
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, status: "skipped" as const, error: "Skipped by user" } : i
      )
    );
    setSessionStats((s) => ({ ...s, skipped: s.skipped + 1 }));
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 16px 40px" }}>
      {/* Keyframe for spinner */}
      <style>{`
        @keyframes ufm-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 0 20px",
          borderBottom: "1px solid #DEE2E6",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={onBack}
            style={{
              padding: "7px 14px",
              background: "#F1F3F5",
              border: "none",
              borderRadius: 7,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
              color: "#495057",
            }}
          >
            ← Back
          </button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#212529" }}>
            Product Library
          </h2>
        </div>

        {/* Session stats chips */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <DbStatusButton
            dbCount={dbCount}
            status={dbStatus}
            error={dbError}
            onRefresh={refreshDbConnection}
          />
          <OllamaStatusButton
            status={ollamaStatus}
            model={ollamaModel ?? undefined}
            error={ollamaError}
            onRefresh={refreshOllamaStatus}
          />
          {quota && <QuotaMeter quota={quota} loading={quotaLoading} onClick={refreshQuota} />}
          <ScanNonProductsButton onComplete={refreshDbConnection} />
          <SyncButton onSyncComplete={refreshDbConnection} />
          <button
            onClick={handleClearCutoutCache}
            disabled={clearingCache}
            title="Delete all cached cutout PNGs from exports/cutouts/"
            style={{
              padding: "5px 11px",
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid #dee2e6",
              borderRadius: 6,
              cursor: clearingCache ? "default" : "pointer",
              background: clearingCache ? "#f1f3f5" : "#fff",
              color: clearingCache ? "#adb5bd" : "#495057",
              whiteSpace: "nowrap",
            }}
          >
            {clearingCache
              ? "Clearing…"
              : cacheCleared !== null
              ? `Cleared ${cacheCleared} files`
              : "Clear Cutout Cache"}
          </button>
          {sessionStats.added > 0 && (
            <Chip label={`+${sessionStats.added} added`} color="#fff" bg="#2F9E44" />
          )}
          {sessionStats.duplicates > 0 && (
            <Chip label={`⊘ ${sessionStats.duplicates} dupes`} color="#fff" bg="#E8590C" />
          )}
          {sessionStats.skipped > 0 && (
            <Chip label={`⊖ ${sessionStats.skipped} skipped`} color="#fff" bg="#868E96" />
          )}
          {sessionStats.errors > 0 && (
            <Chip label={`✗ ${sessionStats.errors} errors`} color="#fff" bg="#C92A2A" />
          )}
        </div>
      </div>

      {/* Body — two columns */}
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {/* Left — drop zone */}
        <div style={{ flex: "0 0 38%", minWidth: 0 }}>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${isDragging ? "#228BE6" : "#CED4DA"}`,
              borderRadius: 12,
              padding: "40px 20px",
              textAlign: "center",
              background: isDragging ? "#E7F5FF" : "#FAFAFA",
              transition: "all 0.15s ease",
              userSelect: "none",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#343A40", marginBottom: 6 }}>
              Drop images or folders here
            </div>
            <div style={{ fontSize: 13, color: "#868E96", marginBottom: 14 }}>
              or pick files / folders below
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "1px solid #CED4DA",
                  borderRadius: 7,
                  background: "#fff",
                  color: "#495057",
                  cursor: "pointer",
                }}
              >
                Pick Files
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handlePickFolder(); }}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "1px solid #228BE6",
                  borderRadius: 7,
                  background: "#E7F5FF",
                  color: "#1971C2",
                  cursor: "pointer",
                }}
              >
                Pick Folder
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileInputChange}
            />
          </div>

          {(items.length > 0 || queuedCount > 0) && (
            <div style={{ marginTop: 14, fontSize: 13, color: "#868E96", textAlign: "center" }}>
              {queuedCount > 0 && (
                <div style={{ marginBottom: 4, color: "#1971C2", fontWeight: 600 }}>
                  {queuedCount.toLocaleString()} images queued
                </div>
              )}
              {items.length > 0 && (
                <div>
                  {pendingCount > 0
                    ? `${pendingCount} processing • ${doneCount} done`
                    : `${doneCount} of ${items.length} done`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right — status list */}
        <div
          style={{
            flex: "1 1 0",
            minWidth: 0,
            maxHeight: 520,
            overflowY: "auto",
            border: "1px solid #E9ECEF",
            borderRadius: 10,
          }}
        >
          {items.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "#ADB5BD",
                fontSize: 14,
              }}
            >
              No images added yet
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F8F9FA", borderBottom: "1px solid #E9ECEF" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, color: "#868E96", fontWeight: 600, width: 52 }}>
                    Thumb
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, color: "#868E96", fontWeight: 600 }}>
                    File / Title
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, color: "#868E96", fontWeight: 600, width: 160 }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...items].reverse().map((item) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: "1px solid #F1F3F5",
                      verticalAlign: "middle",
                    }}
                  >
                    {/* Thumbnail */}
                    <td style={{ padding: "8px 12px" }}>
                      <img
                        src={`file://${item.path}`}
                        alt=""
                        style={{
                          width: 40,
                          height: 40,
                          objectFit: "cover",
                          borderRadius: 5,
                          background: "#F1F3F5",
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </td>

                    {/* Title / path / parsed metadata */}
                    <td style={{ padding: "8px 12px" }}>
                      {/* Show final title (post-save) or parsed titles from Gemini */}
                      {item.title ? (
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#212529" }}>
                          {item.title}
                        </div>
                      ) : item.status === "needs_confirmation" ? (
                        <>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#E67700" }}>
                            Could not parse — confirm if product
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#495057",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 280,
                              marginTop: 2,
                            }}
                            title={item.path}
                          >
                            {item.path.split("/").pop()}
                          </div>
                        </>
                      ) : item.parsed && (item.parsed.englishTitle || item.parsed.cleanTitle) ? (
                        <>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#212529" }}>
                            {item.parsed.englishTitle || item.parsed.cleanTitle}
                          </div>
                          {item.parsed.chineseTitle && (
                            <div style={{ fontSize: 12, color: "#495057" }}>
                              {item.parsed.chineseTitle}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                            {item.parsed.brand && (
                              <MetaChip label={item.parsed.brand} />
                            )}
                            {item.parsed.size && (
                              <MetaChip label={item.parsed.size} />
                            )}
                            {item.parsed.category && (
                              <MetaChip label={item.parsed.category} color="#5C6BC0" />
                            )}
                          </div>
                        </>
                      ) : (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#495057",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 280,
                          }}
                          title={item.path}
                        >
                          {item.path.split("/").pop()}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 11,
                          color: "#ADB5BD",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 280,
                          marginTop: 2,
                        }}
                        title={item.path}
                      >
                        {item.path.split("/").pop()}
                      </div>
                      {item.error && (
                        <div style={{ fontSize: 11, color: "#C92A2A", marginTop: 2 }}>
                          {item.error}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      {item.status === "needs_confirmation" ? (
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => handleConfirmAdd(item)}
                            disabled={confirmingId === item.id || !item.embedding?.length}
                            style={{
                              padding: "4px 12px",
                              borderRadius: 6,
                              border: "none",
                              background: confirmingId === item.id ? "#ADB5BD" : "#2F9E44",
                              color: "#fff",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: confirmingId === item.id ? "default" : "pointer",
                            }}
                          >
                            {confirmingId === item.id ? "Saving…" : "Add to DB"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmSkip(item)}
                            disabled={confirmingId === item.id}
                            style={{
                              padding: "4px 12px",
                              borderRadius: 6,
                              border: "1px solid #CED4DA",
                              background: "#fff",
                              color: "#495057",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: confirmingId === item.id ? "default" : "pointer",
                            }}
                          >
                            Skip
                          </button>
                        </div>
                      ) : (
                        <StatusBadge item={item} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({
  label,
  color,
  bg,
}: {
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: bg,
        color,
      }}
    >
      {label}
    </span>
  );
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function QuotaMeter({
  quota,
  loading,
  onClick,
}: {
  quota: QuotaStatus;
  loading: boolean;
  onClick: () => void;
}) {
  const rows: { label: string; entry: QuotaEntry; fmt?: (v: number) => string }[] = [
    { label: "FS Reads",  entry: quota.reads },
    { label: "FS Writes", entry: quota.writes },
    { label: "Gemini",    entry: quota.geminiRequests },
    { label: "Storage",   entry: quota.storageTotalBytes, fmt: fmtBytes },
  ];

  const anyAt   = rows.some((r) => r.entry.atLimit);
  const anyNear = rows.some((r) => r.entry.nearLimit);
  const borderColor = anyAt ? "#C92A2A" : anyNear ? "#E67700" : "#DEE2E6";

  // Badge: "live" if every fetchable metric has source=live, "est." otherwise
  const fetchable = [quota.reads, quota.writes, quota.storageTotalBytes];
  const allLive = fetchable.every((e) => e.source === "live");
  const badgeLabel = allLive ? "· live" : "· est.";
  const badgeColor = allLive ? "#2F9E44" : "#ADB5BD";

  const tooltipLines = rows.map((r) => {
    const usedStr = r.fmt ? r.fmt(r.entry.used) : r.entry.used.toLocaleString();
    const limStr  = r.fmt ? r.fmt(r.entry.limit) : r.entry.limit.toLocaleString();
    const srcTag  = r.entry.source ? ` [${r.entry.source}]` : "";
    return `${r.label}: ${usedStr} / ${limStr} (${r.entry.pct}%)${srcTag}`;
  });

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Free quota · ${quota.day} · click to refresh\n${tooltipLines.join("\n")}`}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        border: `1px solid ${borderColor}`,
        background: "#fff",
        cursor: "pointer",
        textAlign: "left",
        minWidth: 180,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: "#868E96", fontWeight: 600 }}>
          Free quota · {quota.day}
          {!loading && (
            <span style={{ color: badgeColor, marginLeft: 4, fontWeight: 500 }}>{badgeLabel}</span>
          )}
        </span>
        {loading ? (
          <span style={{
            display: "inline-block", width: 10, height: 10,
            border: "2px solid #CED4DA", borderTopColor: "#228BE6",
            borderRadius: "50%", animation: "ufm-spin 0.7s linear infinite",
          }} />
        ) : (
          <span style={{ fontSize: 10, color: "#ADB5BD" }}>↻</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map(({ label, entry, fmt }) => {
          const barColor = entry.atLimit ? "#C92A2A" : entry.nearLimit ? "#E67700" : "#2F9E44";
          const usedStr = fmt ? fmt(entry.used) : entry.used.toLocaleString();
          return (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#868E96", width: 52, flexShrink: 0 }}>{label}</span>
              <div style={{ flex: 1, height: 5, background: "#E9ECEF", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(entry.pct, 100)}%`,
                  background: barColor,
                  borderRadius: 3,
                  transition: "width 0.3s ease",
                }} />
              </div>
              <span style={{ fontSize: 10, color: barColor, fontWeight: 600, width: 44, textAlign: "right", flexShrink: 0 }}>
                {usedStr}
              </span>
            </div>
          );
        })}
      </div>
    </button>
  );
}

type ScanPhase = "idle" | "scanning" | "done";

function ScanNonProductsButton({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [progress, setProgress] = useState<ScanNonProductsProgressEvent | null>(null);
  const [result, setResult] = useState<ScanNonProductsCompleteEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubProgress = window.ufm.onScanNonProductsProgress((data: ScanNonProductsProgressEvent) => {
      setProgress(data);
    });
    const unsubComplete = window.ufm.onScanNonProductsComplete((data: ScanNonProductsCompleteEvent) => {
      setPhase("done");
      setResult(data);
      setProgress(null);
      if (data.deleted > 0) onComplete();
    });
    return () => {
      unsubProgress();
      unsubComplete();
    };
  }, [onComplete]);

  const handleScan = () => {
    if (!confirm("Scan all product images with Gemini and delete non-products (banners, logos, etc.)?\n\nThis uses ~1 Gemini API call per image. Non-products will be permanently deleted.")) return;
    setPhase("scanning");
    setResult(null);
    setError(null);
    setProgress(null);
    window.ufm.scanNonProducts().catch((err: Error) => {
      setError(err?.message ?? "Scan failed");
      setPhase("idle");
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={handleScan}
        disabled={phase === "scanning"}
        title="Send all DB images to Gemini — delete non-products"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid #DEE2E6",
          background: "#fff",
          cursor: phase === "scanning" ? "default" : "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "#495057",
          opacity: phase === "scanning" ? 0.7 : 1,
        }}
      >
        {phase === "scanning" && (
          <span style={{
            display: "inline-block", width: 10, height: 10,
            border: "2px solid #CED4DA", borderTopColor: "#228BE6",
            borderRadius: "50%", animation: "ufm-spin 0.7s linear infinite",
          }} />
        )}
        Scan Non-Products
      </button>
      {phase === "scanning" && progress && (
        <span style={{ fontSize: 11, color: "#868E96", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {progress.status === "scanning" ? "Scanning…" : progress.status === "deleted" ? "Deleted" : progress.status}
          {progress.title && `: ${progress.title}`}
        </span>
      )}
      {phase === "done" && result && (
        <span style={{ fontSize: 11, color: "#2F9E44", fontWeight: 600 }}>
          {result.scanned} scanned · {result.deleted} removed
          {result.errors > 0 && <span style={{ color: "#C92A2A" }}> · {result.errors} err</span>}
          {result.error && <span style={{ color: "#C92A2A" }}> · {result.error}</span>}
        </span>
      )}
      {error && <span style={{ fontSize: 11, color: "#C92A2A" }}>{error}</span>}
    </div>
  );
}

type SyncPhase = "idle" | "checking" | "fixing" | "done";

function SyncButton({ onSyncComplete }: { onSyncComplete: () => void }) {
  const [phase, setPhase] = useState<SyncPhase>("idle");
  const [report, setReport] = useState<DbSyncReport | null>(null);
  const [result, setResult] = useState<DbSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalIssues = report
    ? report.stuck.length + report.missingInStorage.length + report.orphanedInStorage.length
    : 0;

  const handleCheck = async () => {
    setPhase("checking");
    setReport(null);
    setResult(null);
    setError(null);
    try {
      const r = await window.ufm.checkDbStorage();
      setReport(r);
      setPhase("done");
    } catch (err: any) {
      setError(err?.message || "Check failed");
      setPhase("idle");
    }
  };

  const handleFix = async () => {
    if (!report) return;
    setPhase("fixing");
    try {
      const r = await window.ufm.fixDbStorage(report);
      setResult(r);
      setReport(null);
      setPhase("done");
      onSyncComplete();
    } catch (err: any) {
      setError(err?.message || "Fix failed");
      setPhase("done");
    }
  };

  const isLoading = phase === "checking" || phase === "fixing";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={handleCheck}
        disabled={isLoading}
        title="Check consistency between Firestore and Storage"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid #DEE2E6",
          background: "#fff",
          cursor: isLoading ? "default" : "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "#495057",
          opacity: isLoading ? 0.7 : 1,
        }}
      >
        {isLoading ? (
          <span style={{
            display: "inline-block", width: 10, height: 10,
            border: "2px solid #CED4DA", borderTopColor: "#228BE6",
            borderRadius: "50%", animation: "ufm-spin 0.7s linear infinite",
          }} />
        ) : (
          <span style={{ fontSize: 13 }}>⇄</span>
        )}
        {phase === "checking" ? "Checking…" : phase === "fixing" ? "Fixing…" : "Sync DB"}
      </button>

      {/* Inline report */}
      {phase === "done" && report && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 10px", borderRadius: 8,
          border: `1px solid ${totalIssues > 0 ? "#F03E3E" : "#2F9E44"}`,
          background: totalIssues > 0 ? "#FFF5F5" : "#F4FBF4",
          fontSize: 12,
        }}>
          {totalIssues === 0 ? (
            <span style={{ color: "#2F9E44", fontWeight: 600 }}>✓ Consistent</span>
          ) : (
            <>
              <span style={{ color: "#C92A2A", fontWeight: 600 }}>
                {totalIssues} issue{totalIssues > 1 ? "s" : ""}
              </span>
              <span style={{ color: "#868E96" }}>
                {report.stuck.length > 0 && `${report.stuck.length} stuck`}
                {report.stuck.length > 0 && (report.missingInStorage.length > 0 || report.orphanedInStorage.length > 0) && " · "}
                {report.missingInStorage.length > 0 && `${report.missingInStorage.length} missing`}
                {report.missingInStorage.length > 0 && report.orphanedInStorage.length > 0 && " · "}
                {report.orphanedInStorage.length > 0 && `${report.orphanedInStorage.length} orphaned`}
              </span>
              <button
                type="button"
                onClick={handleFix}
                style={{
                  padding: "2px 8px", borderRadius: 5,
                  border: "none", background: "#C92A2A",
                  color: "#fff", fontSize: 11, fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Fix
              </button>
            </>
          )}
        </div>
      )}

      {phase === "done" && result && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 10px", borderRadius: 8,
          border: "1px solid #2F9E44", background: "#F4FBF4",
          fontSize: 12, color: "#2F9E44", fontWeight: 600,
        }}>
          ✓ Fixed {result.fixed}
          {result.errors.length > 0 && (
            <span style={{ color: "#C92A2A", fontWeight: 400 }}>
              · {result.errors.length} failed
            </span>
          )}
        </div>
      )}

      {error && (
        <span style={{ fontSize: 11, color: "#C92A2A" }}>{error}</span>
      )}
    </div>
  );
}

function MetaChip({ label, color = "#495057" }: { label: string; color?: string }) {
  return (
    <span
      style={{
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 11,
        background: "#F1F3F5",
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
