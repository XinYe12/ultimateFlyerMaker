// FILE: apps/desktop/src/renderer/editor/AddImageModal.tsx
// Tabbed modal for adding a product to an empty slot.
// Tabs: Upload (local file), Product (fill title/size/price → DB cards + Google webview).
// Series mode: stage multiple images → creates multi-flavour item with pendingFlavorSelection.

import { useState, useRef, useEffect } from "react";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import { v4 as uuidv4 } from "uuid";
import { IngestItem } from "../types";
import type { DbSearchResult } from "../global.d";
import { extractImageUrl } from "./extractImageUrl";

type Tab = "upload" | "product";

type Props = {
  slotIndex: number;
  onLocalFile: (slotIndex: number, filePath: string) => void;
  onItemReady: (item: IngestItem) => void;
  onClose: () => void;
};

const TAB_LABELS: { id: Tab; label: string; icon: string }[] = [
  { id: "upload",  label: "Upload",  icon: "📁" },
  { id: "product", label: "Product", icon: "🔍" },
];

const DB_RESULT_LIMIT = 3;
const DB_SEARCH_TIMEOUT_MS = 10000;

function formatPriceDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("$") ? trimmed : `$${trimmed}`;
}

function buildGoogleUrl(query: string) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

type StagedItem = { url: string; thumb?: string };

export default function AddImageModal({ slotIndex, onLocalFile, onItemReady, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("product");
  const [processing, setProcessing] = useState(false);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement>(null);

  // ── Product tab form fields ───────────────────────────────────────────────
  const [enTitle, setEnTitle] = useState("");
  const [zhTitle, setZhTitle] = useState("");
  const [size, setSize] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [regPrice, setRegPrice] = useState("");

  // ── Series mode ───────────────────────────────────────────────────────────
  const [seriesMode, setSeriesMode] = useState(false);
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);

  // ── Product search state ──────────────────────────────────────────────────
  const [dbResults, setDbResults] = useState<DbSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);

  // ── Google webview state ──────────────────────────────────────────────────
  const [webviewUrl, setWebviewUrl] = useState("");
  const [googleDropActive, setGoogleDropActive] = useState(false);
  const webviewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const wv = webviewRef.current as any;
    if (wv && webviewUrl && wv.src !== webviewUrl) wv.src = webviewUrl;
  }, [webviewUrl]);

  const hasResults = searchedOnce;
  const isExpanded = hasResults;

  // ── Close on Escape ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !processing) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [processing, onClose]);

  // ── Upload handlers ───────────────────────────────────────────────────────

  const handleUploadDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setUploadDragOver(false);
    const file = Array.from(e.dataTransfer.files).find(f =>
      /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    ) as (File & { path?: string }) | undefined;
    if (!file?.path) return;
    onLocalFile(slotIndex, file.path);
    onClose();
  };

  // ── Product search ────────────────────────────────────────────────────────

  const handleSearch = async () => {
    const query = [enTitle, zhTitle, size].filter(Boolean).join(" ").trim();
    if (!query) return;
    setSearchLoading(true);
    setDbResults([]);
    setSearchedOnce(false);
    setStagedItems([]);
    const TIMEOUT_SENTINEL = Symbol("db-search-timeout");
    try {
      const dbPromise = window.ufm.searchDatabaseByText(query);
      const timeoutPromise = new Promise<symbol>((resolve) =>
        setTimeout(() => resolve(TIMEOUT_SENTINEL), DB_SEARCH_TIMEOUT_MS)
      );
      const result = await Promise.race([dbPromise, timeoutPromise]);
      if (result === TIMEOUT_SENTINEL) {
        setDbResults([]);
      } else {
        setDbResults((result ?? []).slice(0, DB_RESULT_LIMIT));
      }
      setWebviewUrl(buildGoogleUrl(query));
      setSearchedOnce(true);
    } catch (err) {
      console.error("Product search failed:", err);
    } finally {
      setSearchLoading(false);
    }
  };

  const canSearch = !searchLoading && (enTitle.trim() || zhTitle.trim()).length > 0;
  const handleEnterKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canSearch) handleSearch();
  };

  // ── Staging helpers ───────────────────────────────────────────────────────

  const isStaged = (url: string) => stagedItems.some(s => s.url === url);

  const toggleStaged = (item: StagedItem) => {
    setStagedItems(prev =>
      prev.some(s => s.url === item.url)
        ? prev.filter(s => s.url !== item.url)
        : [...prev, item]
    );
  };

  // ── Build enriched result from form fields ────────────────────────────────

  const buildEnrichedResult = (baseResult: any) => {
    const priceDisplay = formatPriceDisplay(salePrice);
    const hasFormData = enTitle.trim() || zhTitle.trim() || salePrice.trim();
    if (!hasFormData) return baseResult;
    return {
      ...baseResult,
      title: {
        ...(baseResult.title as any),
        ...(enTitle.trim() && { en: enTitle.trim() }),
        ...(zhTitle.trim() && { zh: zhTitle.trim() }),
        ...(size.trim() && { size: size.trim() }),
        ...(regPrice.trim() && { regularPrice: regPrice.trim() }),
      },
      discount: {
        ...(baseResult.discount as any),
        en: enTitle.trim() || (baseResult.title as any)?.en || "",
        zh: zhTitle.trim() || (baseResult.title as any)?.zh || "",
        size: size.trim() || (baseResult.title as any)?.size || "",
        ...(salePrice.trim() && { salePrice: salePrice.trim(), price: { display: priceDisplay } }),
        ...(regPrice.trim() && { regularPrice: regPrice.trim() }),
      },
    };
  };

  // ── Single-item ingest (normal mode) ─────────────────────────────────────

  const handleSelectUrl = async (url: string) => {
    if (!url.trim()) return;
    setProcessing(true);
    try {
      const { path, result } = await window.ufm.downloadAndIngestFromUrl(url.trim());
      onItemReady({ id: uuidv4(), path, status: "done", result: buildEnrichedResult(result), slotIndex });
      onClose();
    } catch (err) {
      console.error("Failed to ingest from URL:", err);
      alert("Failed to add product: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setProcessing(false);
    }
  };

  // ── Series: add all staged items ──────────────────────────────────────────

  const handleAddSeries = async () => {
    if (stagedItems.length === 0) return;
    setProcessing(true);
    try {
      const ingested = await Promise.all(
        stagedItems.map(s => window.ufm.downloadAndIngestFromUrl(s.url))
      );
      const cutoutPaths = ingested.map(r => r.result?.cutoutPath || r.path);
      const firstResult = ingested[0]?.result;

      onItemReady({
        id: uuidv4(),
        path: ingested[0].path,
        status: "done",
        result: {
          ...buildEnrichedResult(firstResult),
          cutoutPath: cutoutPaths[0],
          cutoutPaths: cutoutPaths.length > 1 ? cutoutPaths : undefined,
          allFlavorPaths: cutoutPaths,
          pendingFlavorSelection: cutoutPaths.length > 1 ? true : undefined,
        },
        slotIndex,
      });
      onClose();
    } catch (err) {
      console.error("Failed to add series:", err);
      alert("Failed to add series: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setProcessing(false);
    }
  };

  // ── Google webview drop ───────────────────────────────────────────────────

  const handleGoogleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setGoogleDropActive(false);
    if (processing) return;
    const url = extractImageUrl(e.dataTransfer);
    if (!url) {
      alert("Could not detect an image URL from the dropped content.");
      return;
    }
    if (seriesMode) {
      toggleStaged({ url, thumb: url });
    } else {
      handleSelectUrl(url);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal
      open={true}
      onOpenChange={(open) => !open && !processing && onClose()}
      closeOnOverlayClick={!processing}
      contentStyle={{
        padding: isExpanded ? 16 : 24,
        width: isExpanded ? "95vw" : 680,
        maxWidth: isExpanded ? 1400 : "92vw",
        height: isExpanded ? "92vh" : undefined,
        maxHeight: isExpanded ? undefined : "85vh",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s, height 0.2s",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: "var(--font-bold)", color: "var(--color-text)" }}>Add Product</h2>
        <button
          onClick={() => !processing && onClose()}
          disabled={processing}
          style={{ background: "none", border: "none", cursor: processing ? "wait" : "pointer", fontSize: 20, color: "var(--color-text-muted)", lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: "2px solid #F1F3F5" }}>
        {TAB_LABELS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 20px", border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #4C6EF5" : "2px solid transparent",
              marginBottom: -2, background: "none", cursor: "pointer",
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: 14, color: activeTab === tab.id ? "#4C6EF5" : "#666",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — inlined to avoid remount-on-rerender */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: isExpanded ? "hidden" : "auto" }}>

        {/* ── Upload tab ── */}
        {activeTab === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0" }}>
            <div
              onDragOver={e => { e.preventDefault(); setUploadDragOver(true); }}
              onDragLeave={() => setUploadDragOver(false)}
              onDrop={handleUploadDrop}
              onClick={() => uploadFileRef.current?.click()}
              style={{
                width: "100%", padding: "40px 24px",
                border: `2px dashed ${uploadDragOver ? "#228be6" : "#ccc"}`,
                borderRadius: 12, background: uploadDragOver ? "#e7f5ff" : "#fafafa",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <div style={{ fontSize: 48 }}>📁</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#333" }}>Drop image here or click to browse</div>
              <div style={{ fontSize: 12, color: "#888" }}>JPG, PNG, WebP</div>
            </div>
            <input
              ref={uploadFileRef} type="file" hidden accept="image/jpeg,image/png,image/webp"
              onChange={e => {
                const file = e.target.files?.[0] as (File & { path?: string }) | undefined;
                if (file?.path) { onLocalFile(slotIndex, file.path); onClose(); }
              }}
            />
          </div>
        )}

        {/* ── Product tab ── */}
        {activeTab === "product" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>

            {/* Form fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                {/* English title */}
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>English Title</label>
                  <input type="text" value={enTitle} onChange={e => setEnTitle(e.target.value)}
                    onKeyDown={handleEnterKey} placeholder="e.g. Norwegian Mackerel Fillet" style={inputStyle} />
                </div>
                {/* Chinese title */}
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>Chinese Title (optional)</label>
                  <input type="text" value={zhTitle} onChange={e => setZhTitle(e.target.value)}
                    onKeyDown={handleEnterKey} placeholder="e.g. 挪威鲭鱼" style={inputStyle} />
                </div>
                {/* Series toggle */}
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingBottom: 2 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Series</label>
                  <button
                    onClick={() => { setSeriesMode(v => !v); setStagedItems([]); }}
                    style={{
                      width: 44, height: 24, borderRadius: 12,
                      background: seriesMode ? "#4C6EF5" : "#CBD5E1",
                      border: "none", cursor: "pointer", position: "relative",
                      transition: "background 0.2s", flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 3,
                      left: seriesMode ? 23 : 3,
                      width: 18, height: 18, borderRadius: "50%",
                      background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      transition: "left 0.2s",
                    }} />
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Size</label>
                  <input type="text" value={size} onChange={e => setSize(e.target.value)}
                    onKeyDown={handleEnterKey} placeholder="e.g. 500g" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Sale Price</label>
                  <input type="text" value={salePrice} onChange={e => setSalePrice(e.target.value)}
                    onKeyDown={handleEnterKey} placeholder="e.g. 3.99" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Regular Price</label>
                  <input type="text" value={regPrice} onChange={e => setRegPrice(e.target.value)}
                    onKeyDown={handleEnterKey} placeholder="e.g. 5.99" style={inputStyle} />
                </div>
                <Button variant="primary" onClick={handleSearch} disabled={!canSearch} style={{ flexShrink: 0, height: 38 }}>
                  {searchLoading ? "Searching..." : "Search"}
                </Button>
              </div>
            </div>

            {/* Status */}
            {searchLoading && (
              <p style={{ color: "#666", textAlign: "center", fontSize: 13, margin: 0, flexShrink: 0 }}>Searching database...</p>
            )}
            {processing && (
              <p style={{ color: "#666", textAlign: "center", margin: 0, flexShrink: 0 }}>
                {seriesMode ? `Processing ${stagedItems.length} image${stagedItems.length !== 1 ? "s" : ""}...` : "Downloading and processing image..."}
              </p>
            )}

            {/* Series mode hint */}
            {seriesMode && !hasResults && !searchLoading && (
              <div style={{ fontSize: 12, color: "#4C6EF5", background: "#EDF2FF", borderRadius: 8, padding: "8px 12px", flexShrink: 0 }}>
                Series mode ON — search for the product, then click DB results or drag from Google to stage multiple flavour images.
              </div>
            )}

            {/* Results area */}
            {hasResults && !searchLoading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
                <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>

                  {/* Left: DB results */}
                  <div style={{ width: 180, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={sectionHeaderStyle}>Database ({dbResults.length})</div>
                    {dbResults.length === 0 && (
                      <div style={{ fontSize: 12, color: "#999", fontStyle: "italic" }}>No database match</div>
                    )}
                    {dbResults.map((r, idx) => {
                      const staged = isStaged(r.publicUrl ?? "");
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            if (seriesMode) {
                              toggleStaged({ url: r.publicUrl ?? "", thumb: r.publicUrl });
                            } else {
                              handleSelectUrl(r.publicUrl ?? "");
                            }
                          }}
                          disabled={processing}
                          style={{
                            padding: 0,
                            border: `2px solid ${staged ? "#4C6EF5" : "#ddd"}`,
                            borderRadius: 8,
                            background: staged ? "#EDF2FF" : "#fff",
                            cursor: processing ? "wait" : "pointer",
                            overflow: "hidden", textAlign: "left", position: "relative", flexShrink: 0,
                            transition: "border-color 0.15s, background 0.15s",
                          }}
                        >
                          {staged && (
                            <div style={{
                              position: "absolute", top: 4, right: 4,
                              width: 18, height: 18, borderRadius: "50%",
                              background: "#4C6EF5", color: "#fff",
                              fontSize: 11, fontWeight: 700,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              zIndex: 2,
                            }}>✓</div>
                          )}
                          <div style={badgeStyle("#16a34a")}>DB</div>
                          <div style={{ width: "100%", height: 90, background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                            {r.publicUrl ? (
                              <img src={r.publicUrl} alt={r.englishTitle || ""} style={{ width: "100%", height: "100%", objectFit: "contain" }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            ) : <span style={{ fontSize: 11, color: "#888" }}>No preview</span>}
                          </div>
                          <div style={{ padding: "4px 6px", fontSize: 10, color: "#333", lineHeight: 1.3 }}>
                            {r.englishTitle || r.chineseTitle || r.id}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Right: Google webview + drop zone */}
                  <div style={{ flex: 1, display: "flex", gap: 10, minWidth: 0 }}>
                    <div style={{ flex: 1, borderRadius: 8, overflow: "hidden", border: "1px solid #DEE2E6" }}>
                      <webview
                        ref={webviewRef as any}
                        src={webviewUrl}
                        style={{ width: "100%", height: "100%" }}
                        allowpopups={true}
                      />
                    </div>
                    <div
                      onDragOver={e => { e.preventDefault(); if (!processing) setGoogleDropActive(true); }}
                      onDragLeave={e => { e.preventDefault(); setGoogleDropActive(false); }}
                      onDrop={handleGoogleDrop}
                      style={{
                        width: 130, flexShrink: 0, borderRadius: 12,
                        border: `2px dashed ${googleDropActive ? "#4C6EF5" : "#CED4DA"}`,
                        background: googleDropActive ? "#EDF2FF" : "#F8F9FA",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        textAlign: "center", color: "#495057", fontSize: 12, padding: 12,
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{ fontSize: 28, marginBottom: 6 }}>📥</div>
                      <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>
                        {seriesMode ? "Drop to stage" : "Drop image here"}
                      </div>
                      <div style={{ fontSize: 11, color: "#868E96", lineHeight: 1.4 }}>
                        {seriesMode
                          ? "Drag images from Google to stage them"
                          : "Drag a product image from Google into this box"}
                      </div>
                      {processing && <div style={{ marginTop: 8, fontSize: 11, color: "#666" }}>Processing...</div>}
                    </div>
                  </div>
                </div>

                {/* Series staging area */}
                {seriesMode && (
                  <div style={{
                    flexShrink: 0, borderTop: "1px solid #E2E8F0", paddingTop: 10,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#4C6EF5", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
                      Staged ({stagedItems.length})
                    </div>

                    {/* Thumbnails */}
                    <div style={{ display: "flex", gap: 6, flex: 1, overflowX: "auto", alignItems: "center" }}>
                      {stagedItems.length === 0 && (
                        <span style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>
                          Click DB results or drop from Google to stage flavour images
                        </span>
                      )}
                      {stagedItems.map((s, i) => (
                        <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                          <div style={{ width: 56, height: 56, borderRadius: 6, overflow: "hidden", border: "2px solid #4C6EF5", background: "#f5f5f5" }}>
                            {s.thumb && (
                              <img src={s.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            )}
                          </div>
                          <button
                            onClick={() => setStagedItems(prev => prev.filter((_, j) => j !== i))}
                            style={{
                              position: "absolute", top: -6, right: -6,
                              width: 16, height: 16, borderRadius: "50%",
                              background: "#EF4444", color: "#fff",
                              border: "none", cursor: "pointer",
                              fontSize: 9, fontWeight: 700,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              lineHeight: 1,
                            }}
                          >✕</button>
                        </div>
                      ))}
                    </div>

                    {/* Add Series button */}
                    <Button
                      variant="primary"
                      onClick={handleAddSeries}
                      disabled={stagedItems.length === 0 || processing}
                      style={{ flexShrink: 0, background: "#4C6EF5" }}
                    >
                      Add {stagedItems.length > 0 ? `${stagedItems.length} ` : ""}Flavour{stagedItems.length !== 1 ? "s" : ""}
                    </Button>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </div>
    </Modal>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#555",
  marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 14,
  border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box",
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#888",
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
};

const badgeStyle = (color: string): React.CSSProperties => ({
  position: "absolute", top: 4, left: 4, background: color, color: "#fff",
  fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4, zIndex: 1,
  letterSpacing: "0.05em",
});
