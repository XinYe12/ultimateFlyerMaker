import { useState, useRef, useEffect } from "react";
import { extractImageUrl } from "./extractImageUrl";
import { ReplacementJob } from "../types";

type Props = {
  itemId: string;
  initialQuery: string;
  currentImageSrc?: string;
  isMultiFlavor?: boolean;
  jobs?: ReplacementJob[];
  /** Fire-and-forget drop handler. When provided, drops are non-blocking and the modal stays open. */
  onDropImage?: (url: string) => void;
  onReplace: (itemId: string, data: { path: string; result: any }) => void;
  onClose: () => void;
  zIndex?: number;
};

function buildGoogleUrl(rawQuery: string, contextOn: boolean) {
  let q = rawQuery;
  if (contextOn) {
    const lower = rawQuery.toLowerCase();
    const alreadyHasContext =
      lower.includes("asian") || lower.includes("grocery") ||
      lower.includes("supermarket") || lower.includes("chinese") ||
      lower.includes("korean") || lower.includes("japanese");
    if (!alreadyHasContext) q = `${rawQuery} asian grocery product`;
  }
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`;
}

export default function GoogleSearchModal({ itemId, initialQuery, currentImageSrc, isMultiFlavor, jobs = [], onDropImage, onReplace, onClose, zIndex = 10000 }: Props) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [groceryContext, setGroceryContext] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  // Fallback blocking state — only used when onDropImage is not provided
  const [processing, setProcessing] = useState(false);
  const [webviewUrl, setWebviewUrl] = useState(() =>
    buildGoogleUrl(initialQuery, false)
  );
  const webviewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const wv = webviewRef.current as any;
    if (wv && wv.src !== webviewUrl) {
      wv.src = webviewUrl;
    }
  }, [webviewUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !processing) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [processing, onClose]);

  const handleSearch = () => {
    const query = searchQuery.trim();
    if (!query) return;
    setWebviewUrl(buildGoogleUrl(query, groceryContext));
  };

  const handleSelectUrlFallback = async (url: string) => {
    if (!url.trim()) return;
    setProcessing(true);
    try {
      const data = await window.ufm.downloadAndIngestFromUrl(url.trim());
      onReplace(itemId, { ...data, _sourceUrl: url.trim(), _searchQuery: searchQuery });
      onClose();
    } catch (err: any) {
      setProcessing(false);
      alert("Failed to replace image: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    if (!onDropImage && processing) return;
    const url = extractImageUrl(e.dataTransfer);
    if (!url) {
      alert("Could not detect an image URL from the dropped content.");
      return;
    }
    if (onDropImage) {
      onDropImage(url);
    } else {
      handleSelectUrlFallback(url);
    }
  };

  const activeJobs = jobs.filter(j => j.status === "processing");
  const doneJobs = jobs.filter(j => j.status === "done");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex,
      }}
      onClick={() => !processing && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 16,
          width: "95vw",
          maxWidth: 1400,
          height: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header bar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, whiteSpace: "nowrap" }}>
            Google Image Search
          </h2>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search for product image..."
            autoFocus
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #ddd",
              borderRadius: 8,
              minWidth: 0,
            }}
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={!searchQuery.trim()}
            style={{
              padding: "8px 20px",
              background: "#4285F4",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            Search
          </button>

          {/* Grocery context toggle */}
          <button
            type="button"
            onClick={() => setGroceryContext((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 10px",
              borderRadius: 20,
              border: `1.5px solid ${groceryContext ? "#4C6EF5" : "#ccc"}`,
              background: groceryContext ? "#EDF2FF" : "#f8f8f8",
              color: groceryContext ? "#4C6EF5" : "#999",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            title={groceryContext
              ? "Grocery context ON — click to turn off"
              : "Grocery context OFF — click to add Asian grocery context"}
          >
            🛒 {groceryContext ? "ON" : "OFF"}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            style={{
              background: "none",
              border: "none",
              cursor: processing ? "not-allowed" : "pointer",
              fontSize: 20,
              color: "#868E96",
              lineHeight: 1,
              padding: "4px 8px",
              opacity: processing ? 0.4 : 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Main area: sidebar + webview ── */}
        <div style={{ flex: 1, display: "flex", gap: 12, minHeight: 0 }}>
          {/* Left sidebar */}
          <div
            style={{
              width: 170,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              overflowY: "auto",
            }}
          >
            {/* Current product image — native file drag into webview for Google Lens */}
            {currentImageSrc && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#868E96", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Current image
                </div>
                <div
                  draggable
                  onDragStart={(e) => {
                    e.preventDefault();
                    const filePath = currentImageSrc.startsWith("file://")
                      ? decodeURIComponent(currentImageSrc.replace("file://", ""))
                      : currentImageSrc;
                    window.ufm.startDrag(filePath);
                  }}
                  style={{
                    width: 148,
                    height: 148,
                    borderRadius: 10,
                    border: "2px solid #DEE2E6",
                    background: "#F8F9FA",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    cursor: "grab",
                  }}
                >
                  <img
                    src={currentImageSrc}
                    alt="Current product"
                    draggable={false}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", pointerEvents: "none" }}
                  />
                </div>
                <div style={{ fontSize: 10, color: "#ADB5BD", textAlign: "center", lineHeight: 1.3 }}>
                  Drag into search for Google Lens
                </div>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDropActive(false); }}
              onDrop={handleDrop}
              style={{
                minHeight: 100,
                borderRadius: 12,
                border: `2px dashed ${dropActive ? "#4C6EF5" : "#CED4DA"}`,
                background: dropActive ? "#EDF2FF" : "#F8F9FA",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                color: "#495057",
                fontSize: 12,
                padding: 12,
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 6 }}>📥</div>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>
                Drop image here
              </div>
              <div style={{ fontSize: 11, color: "#868E96", lineHeight: 1.4 }}>
                {isMultiFlavor
                  ? "Drop images for each flavor — queue as many as needed"
                  : "Drag a product image from the search results into this box"}
              </div>
            </div>

            {/* Processing queue */}
            {jobs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#868E96", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Queue ({doneJobs.length}/{jobs.length})
                </div>
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    style={{ background: "#F8F9FA", borderRadius: 8, padding: "8px 10px" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      {job.status === "processing" && (
                        <div style={{
                          width: 12, height: 12,
                          border: "2px solid #dee2e6",
                          borderTopColor: "#4C6EF5",
                          borderRadius: "50%",
                          animation: "ufm-spin 0.75s linear infinite",
                          flexShrink: 0,
                        }} />
                      )}
                      {job.status === "done" && (
                        <span style={{ color: "#2f9e44", fontSize: 13, lineHeight: 1, flexShrink: 0 }}>✓</span>
                      )}
                      {job.status === "error" && (
                        <span style={{ color: "#e03131", fontSize: 13, lineHeight: 1, flexShrink: 0 }}>✕</span>
                      )}
                      <span style={{ fontSize: 11, color: "#495057" }}>
                        {job.status === "processing" ? "Processing…"
                          : job.status === "done" ? "Done"
                          : "Failed"}
                      </span>
                    </div>

                    {/* Progress bar track */}
                    <div style={{ height: 3, borderRadius: 2, background: "#dee2e6", overflow: "hidden" }}>
                      {job.status === "processing" && (
                        <div style={{
                          height: "100%",
                          width: "30%",
                          borderRadius: 2,
                          background: "#4C6EF5",
                          animation: "ufm-progress-pulse 1.4s ease-in-out infinite",
                        }} />
                      )}
                      {job.status === "done" && (
                        <div style={{ height: "100%", width: "100%", borderRadius: 2, background: "#2f9e44" }} />
                      )}
                      {job.status === "error" && (
                        <div style={{ height: "100%", width: "100%", borderRadius: 2, background: "#fa5252" }} />
                      )}
                    </div>

                    {job.status === "error" && job.errorMessage && (
                      <div style={{ fontSize: 10, color: "#e03131", marginTop: 4, lineHeight: 1.35 }}>
                        {job.errorMessage}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Fallback processing indicator (when onDropImage is not provided) */}
            {processing && (
              <div style={{ textAlign: "center", fontSize: 12, color: "#666", padding: 8 }}>
                Processing…
              </div>
            )}
          </div>

          {/* Webview area */}
          <div style={{ flex: 1, borderRadius: 8, overflow: "hidden", border: "1px solid #DEE2E6" }}>
            <webview
              ref={webviewRef as any}
              src={webviewUrl}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
