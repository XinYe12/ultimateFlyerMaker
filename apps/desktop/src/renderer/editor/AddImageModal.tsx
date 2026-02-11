// FILE: apps/desktop/src/renderer/editor/AddImageModal.tsx
// Tabbed modal for adding an image to an empty slot.
// Tabs: Upload (local file), Database search, Google image search (embedded webview).

import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { IngestItem } from "../types";
import type { DbSearchResult, GoogleSearchResult } from "../global.d";
import { extractImageUrl } from "./extractImageUrl";

type Tab = "upload" | "database" | "google";

type Props = {
  slotIndex: number;
  onLocalFile: (slotIndex: number, filePath: string) => void;
  onItemReady: (item: IngestItem) => void;
  onClose: () => void;
};

const TAB_LABELS: { id: Tab; label: string; icon: string }[] = [
  { id: "upload",   label: "Upload",   icon: "📁" },
  { id: "database", label: "Database", icon: "💾" },
  { id: "google",   label: "Google",   icon: "🔍" },
];

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

export default function AddImageModal({ slotIndex, onLocalFile, onItemReady, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [processing, setProcessing] = useState(false);

  // ── Database tab state ────────────────────────────────────────────────────
  const [dbQuery, setDbQuery] = useState("");
  const [dbResults, setDbResults] = useState<DbSearchResult[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbSearchedOnce, setDbSearchedOnce] = useState(false);

  // ── Google tab state ──────────────────────────────────────────────────────
  const [googleQuery, setGoogleQuery] = useState("");
  const [groceryContext, setGroceryContext] = useState(false);
  const [googleDropActive, setGoogleDropActive] = useState(false);
  const [webviewUrl, setWebviewUrl] = useState("");
  const webviewRef = useRef<HTMLElement>(null);

  // Navigate webview when URL state changes
  useEffect(() => {
    const wv = webviewRef.current as any;
    if (wv && webviewUrl && wv.src !== webviewUrl) {
      wv.src = webviewUrl;
    }
  }, [webviewUrl]);

  const isGoogleTab = activeTab === "google";

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    const filePath = await window.ufm.openImageDialog();
    if (!filePath) return;
    onLocalFile(slotIndex, filePath);
    onClose();
  };

  const handleDbSearch = async () => {
    if (!dbQuery.trim()) return;
    setDbLoading(true);
    try {
      const results = await window.ufm.searchDatabaseByText(dbQuery.trim());
      setDbResults(results ?? []);
      setDbSearchedOnce(true);
    } catch (err) {
      console.error("DB search failed:", err);
    } finally {
      setDbLoading(false);
    }
  };

  const handleGoogleSearch = () => {
    if (!googleQuery.trim()) return;
    setWebviewUrl(buildGoogleUrl(googleQuery.trim(), groceryContext));
  };

  const handleGoogleDrop = (e: any) => {
    e.preventDefault();
    setGoogleDropActive(false);
    if (processing) return;

    const url = extractImageUrl(e.dataTransfer);

    if (!url) {
      alert("Could not detect an image URL from the dropped content.");
      return;
    }

    handleSelectUrl(url);
  };

  const handleSelectUrl = async (url: string) => {
    if (!url.trim()) return;
    setProcessing(true);
    try {
      const { path, result } = await window.ufm.downloadAndIngestFromUrl(url.trim());
      onItemReady({
        id: uuidv4(),
        path,
        status: "done",
        result,
        slotIndex,
      });
      onClose();
    } catch (err) {
      console.error("Failed to ingest from URL:", err);
      alert("Failed to add image: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setProcessing(false);
    }
  };

  // ── Shared result grid ────────────────────────────────────────────────────
  function ResultGrid({
    results,
    getUrl,
    getLabel,
    getThumbnail,
  }: {
    results: any[];
    getUrl: (r: any) => string;
    getLabel: (r: any) => string;
    getThumbnail: (r: any) => string | undefined;
  }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {results.map((r, idx) => (
          <button
            key={idx}
            onClick={() => handleSelectUrl(getUrl(r))}
            disabled={processing}
            style={{
              padding: 0,
              border: "2px solid #ddd",
              borderRadius: 8,
              background: "#fff",
              cursor: processing ? "wait" : "pointer",
              overflow: "hidden",
              textAlign: "left",
            }}
          >
            <div
              style={{
                width: "100%",
                height: 120,
                background: "#f5f5f5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {getThumbnail(r) ? (
                <img
                  src={getThumbnail(r)}
                  alt={getLabel(r)}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <span style={{ fontSize: 12, color: "#888" }}>No preview</span>
              )}
            </div>
            <div style={{ padding: "6px 8px", fontSize: 11, color: "#333", lineHeight: 1.3 }}>
              {getLabel(r)}
            </div>
          </button>
        ))}
      </div>
    );
  }

  // ── Tab content ───────────────────────────────────────────────────────────

  function UploadTab() {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0" }}>
        <div style={{ fontSize: 64 }}>📁</div>
        <p style={{ margin: 0, color: "#666", fontSize: 14, textAlign: "center" }}>
          Select an image from your computer.<br />
          It will be processed automatically (OCR, background removal).
        </p>
        <button
          onClick={handleUpload}
          style={{
            padding: "12px 32px",
            background: "#4CAF50",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Browse Files
        </button>
      </div>
    );
  }

  function DatabaseTab() {
    return (
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            value={dbQuery}
            onChange={(e) => setDbQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleDbSearch()}
            placeholder="e.g. Norwegian Mackerel Fillet"
            autoFocus
            style={{
              flex: 1, padding: "10px 12px", fontSize: 14,
              border: "1px solid #ddd", borderRadius: 8,
            }}
          />
          <button
            onClick={handleDbSearch}
            disabled={dbLoading || !dbQuery.trim()}
            style={{
              padding: "10px 20px", background: "#9C27B0", color: "#fff",
              border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer",
            }}
          >
            {dbLoading ? "Searching..." : "Search"}
          </button>
        </div>

        {dbLoading && <p style={{ color: "#666", textAlign: "center" }}>Searching database...</p>}
        {processing && <p style={{ color: "#666", textAlign: "center" }}>Downloading and processing image...</p>}

        {!dbLoading && !processing && dbSearchedOnce && dbResults.length === 0 && (
          <p style={{ color: "#c92a2a", textAlign: "center" }}>No results found. Try a different name.</p>
        )}

        {!dbLoading && !processing && dbResults.length > 0 && (
          <ResultGrid
            results={dbResults}
            getUrl={(r) => r.publicUrl ?? ""}
            getLabel={(r) => r.englishTitle || r.chineseTitle || r.id}
            getThumbnail={(r) => r.publicUrl}
          />
        )}
      </div>
    );
  }

  function GoogleTab() {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* Search bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            value={googleQuery}
            onChange={(e) => setGoogleQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGoogleSearch()}
            placeholder="Search for product image..."
            autoFocus={activeTab === "google"}
            style={{
              flex: 1, padding: "10px 12px", fontSize: 14,
              border: "1px solid #ddd", borderRadius: 8,
            }}
          />
          <button
            onClick={handleGoogleSearch}
            disabled={!googleQuery.trim()}
            style={{
              padding: "10px 20px", background: "#4285F4", color: "#fff",
              border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer",
            }}
          >
            Search
          </button>

          {/* Grocery context toggle */}
          <button
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
        </div>

        {/* Webview + drop zone row */}
        <div style={{ flex: 1, display: "flex", gap: 12, minHeight: 0 }}>
          {/* Webview */}
          <div style={{ flex: 1, borderRadius: 8, overflow: "hidden", border: "1px solid #DEE2E6" }}>
            {webviewUrl ? (
              <webview
                ref={webviewRef as any}
                src={webviewUrl}
                style={{ width: "100%", height: "100%" }}
                allowpopups=""
              />
            ) : (
              <div style={{
                width: "100%", height: "100%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "#F8F9FA", color: "#868E96", fontSize: 14,
              }}>
                Type a search query and click Search to see Google Image results
              </div>
            )}
          </div>

          {/* Drop zone sidebar */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!processing) setGoogleDropActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setGoogleDropActive(false);
            }}
            onDrop={handleGoogleDrop}
            style={{
              width: 150,
              flexShrink: 0,
              borderRadius: 12,
              border: `2px dashed ${googleDropActive ? "#4C6EF5" : "#CED4DA"}`,
              background: googleDropActive ? "#EDF2FF" : "#F8F9FA",
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
              Drag a product image from the search results into this box
            </div>
            {processing && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#666" }}>Processing...</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
      onClick={processing ? undefined : onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: isGoogleTab ? 16 : 24,
          width: isGoogleTab ? "95vw" : 680,
          maxWidth: isGoogleTab ? 1400 : "92vw",
          height: isGoogleTab ? "92vh" : undefined,
          maxHeight: isGoogleTab ? undefined : "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
          transition: "width 0.2s, height 0.2s, max-width 0.2s",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Add Image</h2>
          <button
            onClick={onClose}
            disabled={processing}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 20, color: "#868E96", lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid #F1F3F5" }}>
          {TAB_LABELS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 20px",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #4C6EF5" : "2px solid transparent",
                marginBottom: -2,
                background: "none",
                cursor: "pointer",
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: 14,
                color: activeTab === tab.id ? "#4C6EF5" : "#666",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: isGoogleTab ? undefined : "auto", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {activeTab === "upload"   && <UploadTab />}
          {activeTab === "database" && <DatabaseTab />}
          {activeTab === "google"   && <GoogleTab />}
        </div>
      </div>
    </div>
  );
}
