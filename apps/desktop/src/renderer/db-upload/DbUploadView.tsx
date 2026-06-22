import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { DbBatchProgressEvent, DbBatchCompleteEvent, DbParsedMetadata, QuotaStatus, QuotaEntry, DbSyncReport, DbSyncResult, ScanNonProductsProgressEvent, ScanNonProductsCompleteEvent, TodaysSaveItem } from "../global";

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
  | "needs_confirmation"
  | "paused";

type DbUploadItem = {
  id: string;
  path: string;
  status: DbUploadStatus;
  productId?: string;
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
const MAX_VISIBLE = 150;

const TERMINAL_STATUSES: DbUploadStatus[] = [
  "done", "duplicate", "skipped", "error", "needs_confirmation", "paused",
];

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
  paused: "Paused",
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
  } else if (item.status === "paused") {
    bg = "#5C7CFA"; // indigo — paused, waiting for resume
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

const DB_CHECK_TIMEOUT_MS = 25_000;
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
  const [sessionStats, setSessionStats] = useState({ added: 0, duplicates: 0, skipped: 0, errors: 0 });
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState<number | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [isPausing, setIsPausing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const pausedPathsRef = useRef<string[]>([]);
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

  // Check DB and quota on mount
  useEffect(() => {
    refreshDbConnection();
    refreshQuota();
  }, [refreshDbConnection, refreshQuota]);

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
          productId: u.productId ?? item.productId,
          title: u.title ?? item.title,
          publicUrl: u.publicUrl ?? item.publicUrl,
          error: u.error ?? item.error,
          parsed: u.parsed ?? item.parsed,
          embedding: u.embedding ?? item.embedding,
        };
      }));
    }, 300);

    const unsubComplete = window.ufm.onDbBatchComplete((data: DbBatchCompleteEvent) => {
      processingRef.current = false;
      setIsProcessing(false);
      setIsPausing(false);

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
            productId: u.productId ?? item.productId,
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

      // "paused" is terminal so a second stop can't clobber already-paused items
      const terminal: DbUploadStatus[] = ["done", "duplicate", "skipped", "analyzed", "error", "needs_confirmation", "paused"];

      if (data.stopped) {
        // User paused — mark remaining in-flight items as paused, stash paths for resume
        const stuckPaths: string[] = [];
        setItems((prev) =>
          prev.map((item) => {
            if (!terminal.includes(item.status)) {
              stuckPaths.push(item.path);
              return { ...item, status: "paused" as const, error: undefined };
            }
            return item;
          })
        );
        pausedPathsRef.current = [...pausedPathsRef.current, ...stuckPaths];
        setIsPaused(true);
      } else {
        const errMsg = data.error ?? "Processing did not complete";
        setItems((prev) =>
          prev.map((item) =>
            !terminal.includes(item.status)
              ? { ...item, status: "error" as const, error: item.error ?? errMsg }
              : item
          )
        );
        if (data.error) console.error("[DbUploadView] batch failed:", data.error);
        drainQueue();
      }

      refreshDbConnection();
      refreshQuota();
    });

    return () => {
      unsubProgress();
      unsubComplete();
      clearInterval(flushTimer);
    };
  }, [refreshDbConnection, refreshQuota]);

  const drainQueue = useCallback(() => {
    if (processingRef.current) return;
    if (queueRef.current.length === 0) return;
    const batchPaths = queueRef.current.splice(0, CHUNK_SIZE);
    processingRef.current = true;
    setIsProcessing(true);
    const batchItems: DbUploadItem[] = batchPaths.map((p) => ({
      id: newId(), path: p, status: "pending" as const,
    }));
    setItems((prev) => [...prev, ...batchItems]);
    setQueuedCount((n) => Math.max(0, n - batchPaths.length));
    window.ufm.startDbBatch(batchPaths).catch((err: Error) => {
      console.error("[DbUploadView] startDbBatch error:", err);
      processingRef.current = false;
      setIsProcessing(false);
      drainQueue();
    });
  }, []);

  const handlePause = useCallback(() => {
    setIsPausing(true);
    window.ufm.stopDbBatch().catch(() => {});
  }, []);

  const handleResume = useCallback(() => {
    const paths = pausedPathsRef.current;
    pausedPathsRef.current = [];
    setIsPaused(false);
    // Flip paused items back to pending in place — no duplicate entries added to list
    setItems((prev) =>
      prev.map((item) =>
        item.status === "paused" ? { ...item, status: "pending" as const } : item
      )
    );
    if (paths.length > 0) {
      processingRef.current = true;
      setIsProcessing(true);
      window.ufm.startDbBatch(paths).catch((err: Error) => {
        console.error("[DbUploadView] resume startDbBatch error:", err);
        processingRef.current = false;
        setIsProcessing(false);
        drainQueue();
      });
    } else {
      drainQueue();
    }
  }, [drainQueue]);

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

  const [activeTab, setActiveTab] = useState<"upload" | "today" | "search">("upload");

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const needsConfirmationItems = useMemo(
    () => items.filter((i) => i.status === "needs_confirmation"),
    [items]
  );
  const processedItems = useMemo(
    () => [...items.filter((i) => i.status !== "needs_confirmation")].reverse().slice(0, MAX_VISIBLE),
    [items]
  );
  const processedTotalCount = items.filter((i) => i.status !== "needs_confirmation").length;
  const processedHiddenCount = Math.max(0, processedTotalCount - MAX_VISIBLE);

  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [processedExpanded, setProcessedExpanded] = useState(true);

  const handleConfirmAdd = useCallback(
    async (item: DbUploadItem) => {
      if (item.status !== "needs_confirmation") return;
      setConfirmingIds((prev) => new Set(prev).add(item.id));
      try {
        const res = await window.ufm.confirmDbImage(
          item.path,
          "add",
          item.parsed
        );
        if (res.ok && res.productId) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: "done" as const, productId: res.productId, title: res.title, publicUrl: res.publicUrl }
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
        setConfirmingIds((prev) => { const s = new Set(prev); s.delete(item.id); return s; });
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

  const handleDeleteProduct = useCallback(async (item: DbUploadItem) => {
    if (!item.productId) return;
    if (!confirm(`Delete "${item.title || item.path.split("/").pop()}" from the product library?\n\nThis permanently removes it from Firestore and Firebase Storage.`)) return;
    setDeletingId(item.id);
    try {
      await window.ufm.deleteDbProduct(item.productId);
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "error" as const, error: "Deleted from DB" } : i));
      refreshDbConnection();
    } catch (err: any) {
      alert(`Delete failed: ${err?.message || String(err)}`);
    } finally {
      setDeletingId(null);
    }
  }, [refreshDbConnection]);

  return (
    <div style={{ padding: "0 24px 40px" }}>
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
          {quota && <QuotaMeter quota={quota} loading={quotaLoading} onClick={refreshQuota} />}
          <TestGeminiButton />
          <CleanMessyTitlesButton onComplete={refreshDbConnection} />
          <ReembedButton />
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

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "2px solid #E9ECEF", marginBottom: 24 }}>
        {(["upload", "today", "search"] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 20px", border: "none", background: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13, marginBottom: -2,
              borderBottom: activeTab === tab ? "2px solid #228BE6" : "2px solid transparent",
              color: activeTab === tab ? "#228BE6" : "#868E96",
            }}
          >
            {tab === "upload" ? "Upload" : tab === "today" ? "This Week's Saves" : "Search Library"}
          </button>
        ))}
      </div>

      {activeTab === "today" ? <TodaysSavesPanel /> : null}
      {activeTab === "search" ? <ProductSearchPanel /> : null}

      {/* Body — Upload tab */}
      <div style={{ display: activeTab === "upload" ? "block" : "none" }}>
        {/* Compact drop bar */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 16px",
            marginBottom: 16,
            border: `2px dashed ${isDragging ? "#228BE6" : "#CED4DA"}`,
            borderRadius: 10,
            background: isDragging ? "#E7F5FF" : "#FAFAFA",
            transition: "all 0.15s ease",
            userSelect: "none",
          }}
        >
          <span style={{ fontSize: 22 }}>📁</span>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#343A40", whiteSpace: "nowrap" }}>
            Drop images or folders here
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            style={{
              padding: "5px 12px", fontSize: 12, fontWeight: 600,
              border: "1px solid #CED4DA", borderRadius: 6,
              background: "#fff", color: "#495057", cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Pick Files
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handlePickFolder(); }}
            style={{
              padding: "5px 12px", fontSize: 12, fontWeight: 600,
              border: "1px solid #228BE6", borderRadius: 6,
              background: "#E7F5FF", color: "#1971C2", cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Pick Folder
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileInputChange}
          />
          {/* Stats + pause/resume — pushed to the right */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "#868E96" }}>
            {queuedCount > 0 && (
              <span style={{ color: "#1971C2", fontWeight: 600, whiteSpace: "nowrap" }}>
                {queuedCount.toLocaleString()} queued
              </span>
            )}
            {items.length > 0 && (
              <span style={{ whiteSpace: "nowrap" }}>
                {pendingCount > 0
                  ? `${pendingCount} processing • ${doneCount} done`
                  : `${doneCount} of ${items.length} done`}
              </span>
            )}
            {isPaused ? (
              <button
                type="button"
                onClick={handleResume}
                style={{
                  padding: "4px 14px", fontSize: 12, fontWeight: 700,
                  border: "1px solid #5C7CFA", borderRadius: 6,
                  background: "#EDF2FF", color: "#3B5BDB", cursor: "pointer",
                }}
              >
                ▶ Resume
              </button>
            ) : (isProcessing || queuedCount > 0) ? (
              <button
                type="button"
                onClick={handlePause}
                disabled={isPausing}
                style={{
                  padding: "4px 14px", fontSize: 12, fontWeight: 700,
                  border: "1px solid #CED4DA", borderRadius: 6,
                  background: isPausing ? "#F1F3F5" : "#F8F9FA",
                  color: isPausing ? "#ADB5BD" : "#495057",
                  cursor: isPausing ? "default" : "pointer",
                }}
              >
                {isPausing ? "Pausing…" : "⏸ Pause"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Full-width status list */}
        <div
          style={{
            maxHeight: 560,
            overflowY: "auto",
            border: "1px solid #E9ECEF",
            borderRadius: 10,
          }}
        >
          {items.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#ADB5BD", fontSize: 14 }}>
              No images added yet
            </div>
          ) : (
            <>
              {needsConfirmationItems.length > 0 && (
                <>
                  <div style={{
                    padding: "9px 14px",
                    background: "#FFF9DB",
                    borderBottom: "2px solid #FAB005",
                    display: "flex", alignItems: "center", gap: 8,
                    position: "sticky", top: 0, zIndex: 1,
                  }}>
                    <span style={{ fontSize: 15 }}>⚠</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#E67700" }}>
                      {needsConfirmationItems.length} product{needsConfirmationItems.length !== 1 ? "s" : ""} need your review
                    </span>
                    <span style={{ fontSize: 12, color: "#F08C00", marginLeft: 4 }}>
                      — could not be identified or processed automatically
                    </span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: 56 }} />
                      <col />
                      <col style={{ width: 200 }} />
                    </colgroup>
                    <tbody>
                      {needsConfirmationItems.map((item) => (
                        <tr key={item.id} style={{
                          borderBottom: "1px solid #FFE8A3",
                          verticalAlign: "middle",
                          background: "#FFFBEB",
                        }}>
                          <td style={{ padding: "10px 12px" }}>
                            <img
                              src={`file://${item.path}`}
                              loading="lazy"
                              alt=""
                              style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, background: "#F1F3F5", display: "block" }}
                              onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                            />
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "#212529", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.path}>
                              {item.path.split(/[/\\]/).pop()}
                            </div>
                            {item.parsed?.ocrText && (
                              <div style={{ fontSize: 11, color: "#868E96", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                OCR: {item.parsed.ocrText}
                              </div>
                            )}
                            {item.error && !item.parsed?.ocrText && (
                              <div style={{ fontSize: 11, color: "#C92A2A", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {item.error}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                onClick={() => handleConfirmAdd(item)}
                                disabled={confirmingIds.has(item.id)}
                                style={{
                                  padding: "5px 14px", borderRadius: 6, border: "none",
                                  background: confirmingIds.has(item.id) ? "#ADB5BD" : "#2F9E44",
                                  color: "#fff", fontSize: 12, fontWeight: 600,
                                  cursor: confirmingIds.has(item.id) ? "default" : "pointer",
                                }}
                              >
                                {confirmingIds.has(item.id) ? "Saving…" : "Add to DB"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConfirmSkip(item)}
                                disabled={confirmingIds.has(item.id)}
                                style={{
                                  padding: "5px 14px", borderRadius: 6,
                                  border: "1px solid #CED4DA", background: "#fff",
                                  color: "#495057", fontSize: 12, fontWeight: 600,
                                  cursor: confirmingIds.has(item.id) ? "default" : "pointer",
                                }}
                              >
                                Skip
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* ── Section B: Processed (collapsible) ───────────────── */}
              {processedTotalCount > 0 && (
                <>
                  <div
                    onClick={() => setProcessedExpanded((v) => !v)}
                    style={{
                      padding: "7px 14px",
                      background: "#F8F9FA",
                      borderBottom: processedExpanded ? "1px solid #E9ECEF" : "none",
                      borderTop: needsConfirmationItems.length > 0 ? "2px solid #DEE2E6" : "none",
                      display: "flex", alignItems: "center", gap: 8,
                      cursor: "pointer", userSelect: "none",
                      position: "sticky", top: needsConfirmationItems.length > 0 ? 38 : 0, zIndex: 1,
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#868E96" }}>{processedExpanded ? "▾" : "▸"}</span>
                    <span style={{ fontWeight: 600, fontSize: 12, color: "#495057" }}>
                      {processedTotalCount.toLocaleString()} processed
                    </span>
                    <span style={{ fontSize: 11, color: "#ADB5BD" }}>
                      {doneCount > 0 && `${doneCount} added`}
                      {doneCount > 0 && (items.filter(i => i.status === "duplicate").length > 0 || items.filter(i => i.status === "skipped").length > 0 || items.filter(i => i.status === "error").length > 0) ? " · " : ""}
                      {items.filter(i => i.status === "duplicate").length > 0 && `${items.filter(i => i.status === "duplicate").length} dupes`}
                      {items.filter(i => i.status === "skipped").length > 0 && ` · ${items.filter(i => i.status === "skipped").length} skipped`}
                      {items.filter(i => i.status === "error").length > 0 && ` · ${items.filter(i => i.status === "error").length} failed`}
                    </span>
                  </div>
                  {processedExpanded && (
                    <>
                      {processedHiddenCount > 0 && (
                        <div style={{ padding: "5px 12px", background: "#F1F3F5", borderBottom: "1px solid #E9ECEF", fontSize: 11, color: "#868E96", textAlign: "center" }}>
                          {processedHiddenCount.toLocaleString()} older items above — all counted in session stats
                        </div>
                      )}
                      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                        <colgroup>
                          <col style={{ width: 52 }} />
                          <col />
                          <col style={{ width: 190 }} />
                        </colgroup>
                        <tbody>
                          {processedItems.map((item) => (
                            <tr key={item.id} style={{ borderBottom: "1px solid #F1F3F5", verticalAlign: "middle" }}>
                              <td style={{ padding: "8px 12px" }}>
                                {TERMINAL_STATUSES.includes(item.status) ? (
                                  <img
                                    src={`file://${item.path}`}
                                    loading="lazy"
                                    alt=""
                                    style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 5, background: "#F1F3F5" }}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                  />
                                ) : (
                                  <div style={{ width: 40, height: 40, borderRadius: 5, background: "#F1F3F5" }} />
                                )}
                              </td>
                              <td style={{ padding: "8px 12px", overflow: "hidden" }}>
                                {item.title ? (
                                  <div style={{ fontWeight: 600, fontSize: 13, color: "#212529", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {item.title}
                                  </div>
                                ) : item.parsed && (item.parsed.englishTitle || item.parsed.cleanTitle) ? (
                                  <>
                                    <div style={{ fontWeight: 600, fontSize: 13, color: "#212529", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {item.parsed.englishTitle || item.parsed.cleanTitle}
                                    </div>
                                    {item.parsed.chineseTitle && (
                                      <div style={{ fontSize: 12, color: "#495057", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {item.parsed.chineseTitle}
                                      </div>
                                    )}
                                    <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                      {item.parsed.brand && <MetaChip label={item.parsed.brand} />}
                                      {item.parsed.size && <MetaChip label={item.parsed.size} />}
                                      {item.parsed.category && <MetaChip label={item.parsed.category} color="#5C6BC0" />}
                                    </div>
                                  </>
                                ) : (
                                  <div style={{ fontSize: 12, color: "#495057", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.path}>
                                    {item.path.split(/[/\\]/).pop()}
                                  </div>
                                )}
                                {item.status === "error" && (
                                  <div style={{ fontSize: 11, color: "#C92A2A", marginTop: 2 }}>
                                    Network failure
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>
                                {item.status === "done" && item.productId ? (
                                  <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                                    <StatusBadge item={item} />
                                    <button
                                      type="button"
                                      disabled={deletingId === item.id}
                                      onClick={() => handleDeleteProduct(item)}
                                      title="Delete from DB"
                                      style={{
                                        padding: "3px 7px", borderRadius: 5,
                                        border: "1px solid #FFB3B3",
                                        background: deletingId === item.id ? "#F1F3F5" : "#FFF5F5",
                                        color: deletingId === item.id ? "#ADB5BD" : "#C92A2A",
                                        fontSize: 13, cursor: deletingId === item.id ? "default" : "pointer", lineHeight: 1,
                                      }}
                                    >
                                      🗑
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
                    </>
                  )}
                </>
              )}
            </>
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

type CleanPhase = "idle" | "running" | "done";

function CleanMessyTitlesButton({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<CleanPhase>("idle");
  const [progress, setProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [result, setResult] = useState<{ deleted: number; total: number; errors: number; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubProgress = window.ufm.onCleanMessyTitlesProgress((data) => setProgress(data));
    const unsubComplete = window.ufm.onCleanMessyTitlesComplete((data) => {
      setPhase("done");
      setResult(data);
      setProgress(null);
      if (data.deleted > 0) onComplete();
    });
    return () => { unsubProgress(); unsubComplete(); };
  }, [onComplete]);

  const handleClick = () => {
    if (!confirm("Delete all products with unreadable hash titles from the database?\n\nThis permanently removes them from Firestore and Storage.")) return;
    setPhase("running");
    setResult(null);
    setError(null);
    setProgress(null);
    window.ufm.cleanMessyTitles().catch((err: Error) => {
      setError(err?.message ?? "Cleanup failed");
      setPhase("idle");
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={phase === "running"}
        title="Delete products whose title is a raw hash/filename with no readable name"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 12px", borderRadius: 8, border: "1px solid #DEE2E6",
          background: "#fff", cursor: phase === "running" ? "default" : "pointer",
          fontSize: 12, fontWeight: 600, color: "#C92A2A",
          opacity: phase === "running" ? 0.7 : 1,
        }}
      >
        {phase === "running" && (
          <span style={{
            display: "inline-block", width: 10, height: 10,
            border: "2px solid #CED4DA", borderTopColor: "#C92A2A",
            borderRadius: "50%", animation: "ufm-spin 0.7s linear infinite",
          }} />
        )}
        Clean Messy Titles
      </button>
      {phase === "running" && progress && (
        <span style={{ fontSize: 11, color: "#868E96", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {progress.current}/{progress.total} — {progress.title}
        </span>
      )}
      {phase === "done" && result && (
        <span style={{ fontSize: 11, color: result.deleted > 0 ? "#2F9E44" : "#868E96", fontWeight: 600 }}>
          {result.deleted === 0 ? "None found" : `${result.deleted} deleted`}
          {result.errors > 0 && <span style={{ color: "#C92A2A" }}> · {result.errors} err</span>}
        </span>
      )}
      {error && <span style={{ fontSize: 11, color: "#C92A2A" }}>{error}</span>}
    </div>
  );
}

type ReembedPhase = "idle" | "running" | "done";

function ReembedButton() {
  const [phase, setPhase] = useState<ReembedPhase>("idle");
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [result, setResult] = useState<{ updated: number; total: number; errors: number; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubProgress = window.ufm.onReembedProgress((data) => setProgress(data));
    const unsubComplete = window.ufm.onReembedComplete((data) => {
      setPhase("done");
      setResult(data);
      setProgress(null);
    });
    return () => { unsubProgress(); unsubComplete(); };
  }, []);

  const handleClick = () => {
    setPhase("running");
    setResult(null);
    setError(null);
    setProgress(null);
    window.ufm.reembedAllProducts().catch((err: Error) => {
      setError(err?.message ?? "Re-embed failed");
      setPhase("idle");
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={phase === "running"}
        title="Re-embed all products without Gemini embeddings"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 12px", borderRadius: 8, border: "1px solid #DEE2E6",
          background: "#fff", cursor: phase === "running" ? "default" : "pointer",
          fontSize: 12, fontWeight: 600, color: "#495057",
          opacity: phase === "running" ? 0.7 : 1,
        }}
      >
        {phase === "running" && (
          <span style={{
            display: "inline-block", width: 10, height: 10,
            border: "2px solid #CED4DA", borderTopColor: "#228BE6",
            borderRadius: "50%", animation: "ufm-spin 0.7s linear infinite",
          }} />
        )}
        Re-embed Products
      </button>
      {phase === "running" && progress && (
        <span style={{ fontSize: 11, color: "#868E96", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {progress.current}/{progress.total} — {progress.label}
        </span>
      )}
      {phase === "done" && result && (
        <span style={{ fontSize: 11, color: "#2F9E44", fontWeight: 600 }}>
          {result.updated}/{result.total} updated
          {result.errors > 0 && <span style={{ color: "#C92A2A" }}> · {result.errors} err</span>}
          {result.error && <span style={{ color: "#C92A2A" }}> · {result.error}</span>}
        </span>
      )}
      {error && <span style={{ fontSize: 11, color: "#C92A2A" }}>{error}</span>}
    </div>
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
    if (!confirm("Scan all product images with Gemini and delete non-products (flyer title graphics, banners, logos, price-only art, etc.)?\n\nThis uses ~1 Gemini API call per image. Non-products will be permanently deleted.")) return;
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
        title="Send all DB images to Gemini — delete flyer title graphics, banners, logos, etc."
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

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} day ago`;
}

function TodaysSavesPanel() {
  const [items, setItems] = useState<TodaysSaveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(() => {
    setLoading(true);
    setError(null);
    window.ufm.getTodaysSaves()
      .then(setItems)
      .catch((err: any) => setError(err?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 48, color: "#868E96" }}>
        <span style={{
          display: "inline-block", width: 20, height: 20,
          border: "3px solid #E9ECEF", borderTopColor: "#228BE6",
          borderRadius: "50%", animation: "ufm-spin 0.7s linear infinite",
        }} />
        <div style={{ marginTop: 12, fontSize: 13 }}>Loading this week's saves…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <div style={{ fontSize: 13, color: "#C92A2A", marginBottom: 12 }}>{error}</div>
        <button type="button" onClick={fetch} style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #CED4DA", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: "#868E96" }}>
          {items.length === 0 ? "No combinations saved this week yet" : `${items.length} saved this week`}
        </span>
        <button type="button" onClick={fetch} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #DEE2E6", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#495057" }}>
          ↻ Refresh
        </button>
      </div>

      {items.length > 0 && (
        <div style={{ border: "1px solid #E9ECEF", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8F9FA", borderBottom: "1px solid #E9ECEF" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, color: "#868E96", fontWeight: 600, width: 68 }}>Image</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, color: "#868E96", fontWeight: 600 }}>Product</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, color: "#868E96", fontWeight: 600, width: 110 }}>Dept</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, color: "#868E96", fontWeight: 600, width: 80 }}>Price</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, color: "#868E96", fontWeight: 600, width: 90 }}>Saved</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid #F1F3F5", verticalAlign: "middle" }}>
                  <td style={{ padding: "8px 12px" }}>
                    {item.publicUrl ? (
                      <img
                        src={item.publicUrl}
                        alt=""
                        style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, background: "#F1F3F5", display: "block" }}
                        onError={e => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                      />
                    ) : (
                      <div style={{ width: 48, height: 48, borderRadius: 6, background: "#F1F3F5" }} />
                    )}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {item.englishTitle && (
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#212529" }}>{item.englishTitle}</div>
                    )}
                    {item.chineseTitle && (
                      <div style={{ fontSize: 12, color: "#495057" }}>{item.chineseTitle}</div>
                    )}
                    {!item.englishTitle && !item.chineseTitle && (
                      <div style={{ fontSize: 12, color: "#ADB5BD" }}>(no title)</div>
                    )}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {item.department && (
                      <MetaChip label={item.department} color="#5C6BC0" />
                    )}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    {item.salePrice ? (
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#C92A2A" }}>${item.salePrice}</span>
                    ) : (
                      <span style={{ color: "#ADB5BD", fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    <span style={{ fontSize: 11, color: "#ADB5BD" }}>{relativeTime(item.createdAt)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProductSearchPanel() {
  type R = import("../global").DbSearchResult;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<R[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [infoProduct, setInfoProduct] = useState<R | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      const res = await window.ufm.searchDatabaseByText(q, 12);
      setResults(res ?? []);
      setSearchedOnce(true);
    } catch (err) {
      console.error("Library search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (r: R) => {
    const name = r.englishTitle || r.chineseTitle || r.id;
    if (!confirm(`Delete "${name}" from the product library?\n\nThis permanently removes it from Firestore and Firebase Storage.`)) return;
    setInfoProduct(null);
    setDeletingId(r.id);
    try {
      await window.ufm.deleteDbProduct(r.id);
      setResults(prev => prev.filter(x => x.id !== r.id));
    } catch (err: any) {
      alert(`Delete failed: ${err?.message || String(err)}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ padding: "4px 0 24px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, maxWidth: 520 }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search by product name…"
          style={{
            flex: 1, padding: "9px 12px", fontSize: 13,
            border: "1px solid #CED4DA", borderRadius: 8, outline: "none",
          }}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          style={{
            padding: "9px 18px", fontSize: 13, fontWeight: 600,
            background: "#228BE6", color: "#fff", border: "none",
            borderRadius: 8, cursor: loading || !query.trim() ? "default" : "pointer",
            opacity: loading || !query.trim() ? 0.6 : 1,
          }}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {loading && (
        <p style={{ color: "#868E96", fontSize: 13 }}>Searching library…</p>
      )}

      {!loading && searchedOnce && results.length === 0 && (
        <p style={{ color: "#C92A2A", fontSize: 13 }}>No products found for "{query}".</p>
      )}

      {!loading && results.length > 0 && (
        <>
          <p style={{ fontSize: 12, color: "#868E96", marginBottom: 12 }}>
            {results.length} result{results.length !== 1 ? "s" : ""}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {results.map((r) => {
              const isDeleting = deletingId === r.id;
              const isHovered = hoveredId === r.id;
              return (
                <div
                  key={r.id}
                  onMouseEnter={() => setHoveredId(r.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    position: "relative", border: "1px solid #DEE2E6", borderRadius: 8,
                    overflow: "hidden", background: "#fff",
                  }}
                >
                  {/* Product image */}
                  {r.publicUrl ? (
                    <img
                      src={r.publicUrl}
                      alt={r.englishTitle ?? r.chineseTitle ?? r.id}
                      style={{ width: "100%", height: 120, objectFit: "contain", display: "block", background: "#F8F9FA" }}
                    />
                  ) : (
                    <div style={{ width: "100%", height: 120, background: "#F1F3F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 11, color: "#ADB5BD" }}>No image</span>
                    </div>
                  )}

                  {/* Deletion loading overlay */}
                  {isDeleting && (
                    <div style={{
                      position: "absolute", inset: 0, zIndex: 10,
                      background: "rgba(255,255,255,0.82)", backdropFilter: "blur(2px)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7,
                    }}>
                      <div style={{
                        width: 20, height: 20,
                        border: "2.5px solid #FFCDD2", borderTopColor: "#C92A2A",
                        borderRadius: "50%", animation: "ufm-spin 0.7s linear infinite",
                      }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#C92A2A", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                        Deleting…
                      </span>
                    </div>
                  )}

                  {/* Hover action buttons (delete + more info) */}
                  {isHovered && !isDeleting && (
                    <div style={{
                      position: "absolute", top: 4, right: 4,
                      display: "flex", flexDirection: "column", gap: 4,
                    }}>
                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        title="Delete from product library"
                        style={{
                          width: 20, height: 20, padding: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: "rgba(201,42,42,0.88)", color: "#fff",
                          border: "none", borderRadius: "50%",
                          fontSize: 11, fontWeight: 700, lineHeight: 1, cursor: "pointer",
                        }}
                      >
                        ×
                      </button>
                      <button
                        type="button"
                        onClick={() => setInfoProduct(r)}
                        title="More info"
                        style={{
                          width: 20, height: 20, padding: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: "rgba(34,139,230,0.88)", color: "#fff",
                          border: "none", borderRadius: "50%",
                          fontSize: 10, fontWeight: 700, lineHeight: 1, cursor: "pointer",
                        }}
                      >
                        i
                      </button>
                    </div>
                  )}

                  {/* Card footer */}
                  <div style={{ padding: "8px 10px" }}>
                    {r.englishTitle && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#212529", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.englishTitle}
                      </div>
                    )}
                    {r.chineseTitle && (
                      <div style={{ fontSize: 11, color: "#495057", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.chineseTitle}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {r.size && <span style={{ fontSize: 10, color: "#868E96" }}>{r.size}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 10, color: "#2F9E44", fontWeight: 600 }}>
                        {Math.round(r.score * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Product info dialog */}
      {infoProduct && (
        <div
          onClick={() => setInfoProduct(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 12, width: 340, maxHeight: "80vh",
              overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
            }}
          >
            {/* Image */}
            {infoProduct.publicUrl ? (
              <img
                src={infoProduct.publicUrl}
                alt={infoProduct.englishTitle ?? infoProduct.id}
                style={{ width: "100%", height: 200, objectFit: "contain", display: "block", background: "#F8F9FA", borderRadius: "12px 12px 0 0" }}
              />
            ) : (
              <div style={{ width: "100%", height: 160, background: "#F1F3F5", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "12px 12px 0 0" }}>
                <span style={{ fontSize: 12, color: "#ADB5BD" }}>No image</span>
              </div>
            )}

            {/* Content */}
            <div style={{ padding: "16px 18px 20px" }}>
              {/* Title */}
              {infoProduct.englishTitle && (
                <div style={{ fontSize: 15, fontWeight: 700, color: "#212529", marginBottom: 2 }}>
                  {infoProduct.englishTitle}
                </div>
              )}
              {infoProduct.chineseTitle && (
                <div style={{ fontSize: 13, color: "#495057", marginBottom: 12 }}>
                  {infoProduct.chineseTitle}
                </div>
              )}

              {/* Info rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "Brand",         value: infoProduct.brand },
                  { label: "Size",          value: infoProduct.size },
                  { label: "Category",      value: infoProduct.category },
                  { label: "Sale Price",    value: infoProduct.salePrice ? `$${infoProduct.salePrice}` : undefined },
                  { label: "Regular Price", value: infoProduct.regularPrice ? `$${infoProduct.regularPrice}` : undefined },
                  { label: "Unit",          value: infoProduct.unit },
                  { label: "Quantity",      value: infoProduct.quantity != null ? String(infoProduct.quantity) : undefined },
                  { label: "Source",        value: infoProduct.source },
                  { label: "Match Score",   value: `${Math.round(infoProduct.score * 100)}%` },
                  { label: "Product ID",    value: infoProduct.id, mono: true },
                ].filter(row => row.value).map(row => (
                  <div key={row.label} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "#868E96", fontWeight: 600, minWidth: 96, flexShrink: 0 }}>
                      {row.label}
                    </span>
                    <span style={{ fontSize: 12, color: "#212529", fontFamily: (row as any).mono ? "monospace" : undefined, wordBreak: "break-all" }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => handleDelete(infoProduct)}
                  disabled={deletingId === infoProduct.id}
                  style={{
                    flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 600,
                    background: "#FFF5F5", color: "#C92A2A",
                    border: "1px solid #FFB3B3", borderRadius: 7, cursor: "pointer",
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setInfoProduct(null)}
                  style={{
                    flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 600,
                    background: "#F1F3F5", color: "#495057",
                    border: "1px solid #DEE2E6", borderRadius: 7, cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TestGeminiButton() {
  const [phase, setPhase] = useState<"idle" | "testing" | "done">("idle");
  const [result, setResult] = useState<{ vision: boolean | null; embed: boolean | null; label: string } | null>(null);

  const handleTest = async () => {
    setPhase("testing");
    setResult(null);
    try {
      const r = await window.ufm.testGemini();
      const visionOk = r.vision?.ok ?? false;
      const embedOk = r.embed?.ok ?? false;
      let label = "";
      if (r.error) label = r.error;
      else if (!r.apiKeyPresent) label = "No API key";
      else if (visionOk && embedOk) label = "Vision ✓  Embed ✓";
      else {
        const visionErr = r.vision?.body || r.vision?.error || (r.vision?.status ? `HTTP ${r.vision.status}` : "fail");
        const embedErr  = r.embed?.body  || r.embed?.error  || (r.embed?.status  ? `HTTP ${r.embed.status}`  : "fail");
        label = [!visionOk && `Vision: ${visionErr}`, !embedOk && `Embed: ${embedErr}`].filter(Boolean).join(" | ");
      }
      setResult({ vision: visionOk, embed: embedOk, label });
    } catch (err: any) {
      setResult({ vision: null, embed: null, label: err?.message ?? "Test failed" });
    } finally {
      setPhase("done");
    }
  };

  const allOk = result?.vision && result?.embed;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={handleTest}
        disabled={phase === "testing"}
        title="Test Gemini API connectivity — results shown in backend terminal"
        style={{
          padding: "6px 12px", borderRadius: 8, border: "1px solid #DEE2E6",
          background: "#fff", cursor: phase === "testing" ? "default" : "pointer",
          fontSize: 12, fontWeight: 600, color: "#495057",
          opacity: phase === "testing" ? 0.7 : 1,
          display: "inline-flex", alignItems: "center", gap: 6,
        }}
      >
        {phase === "testing" && (
          <span style={{
            display: "inline-block", width: 10, height: 10,
            border: "2px solid #CED4DA", borderTopColor: "#228BE6",
            borderRadius: "50%", animation: "ufm-spin 0.7s linear infinite",
          }} />
        )}
        Test Gemini
      </button>
      {phase === "done" && result && (
        <span style={{ fontSize: 11, fontWeight: 600, color: allOk ? "#2F9E44" : "#C92A2A", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {result.label}
        </span>
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
