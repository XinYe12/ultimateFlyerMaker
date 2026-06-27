// FILE: apps/desktop/src/renderer/editor/AddImageModal.tsx
// Tabbed modal for adding a product to an empty slot.
// Tabs: Upload (local file), Product (fill title → DB cards + Google webview).
// Series mode: stage multiple images → creates multi-flavour item with pendingFlavorSelection.

import React, { useState, useRef, useEffect } from "react";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import type { DbSearchResult } from "../global.d";
import type { AddProductFormMeta, ReplacementJob } from "../types";
import { extractImageUrl } from "./extractImageUrl";
import IngestJobQueuePanel from "./IngestJobQueuePanel";

type Tab = "upload" | "product";

type Props = {
  slotIndex: number;
  onLocalFile: (slotIndex: number, filePath: string) => void;
  onSelectDbProduct?: (url: string, formMeta: AddProductFormMeta) => void;
  onDropImage?: (url: string, formMeta: AddProductFormMeta) => void;
  onEnqueueSeries?: (urls: string[], formMeta: AddProductFormMeta) => void;
  jobs?: ReplacementJob[];
  onCancelJob?: (jobId: string) => void;
  onClose: () => void;
};

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "product", label: "Product" },
];

const DB_RESULT_LIMIT = 3;
const DB_SEARCH_TIMEOUT_MS = 10000;

function buildGoogleUrl(query: string) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

function getFormMeta(
  enTitle: string,
  zhTitle: string,
  size: string,
  salePrice: string,
  regPrice: string,
): AddProductFormMeta {
  return { enTitle, zhTitle, size, salePrice, regPrice };
}

type StagedItem = { url: string; thumb?: string };

export default function AddImageModal({
  slotIndex,
  onLocalFile,
  onSelectDbProduct,
  onDropImage,
  onEnqueueSeries,
  jobs = [],
  onCancelJob,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("product");
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement>(null);

  const [enTitle, setEnTitle] = useState("");
  const [zhTitle, setZhTitle] = useState("");
  const [size, setSize] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [regPrice, setRegPrice] = useState("");

  const [seriesMode, setSeriesMode] = useState(false);
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);

  const [dbResults, setDbResults] = useState<DbSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);

  const [webviewUrl, setWebviewUrl] = useState("");
  const [googleDropActive, setGoogleDropActive] = useState(false);
  const webviewRef = useRef<HTMLElement>(null);

  const formMeta = getFormMeta(enTitle, zhTitle, size, salePrice, regPrice);
  const hasResults = searchedOnce;
  const isExpanded = hasResults;
  const useBackgroundIngest = !!(onSelectDbProduct || onDropImage);

  useEffect(() => {
    const wv = webviewRef.current as any;
    if (wv && webviewUrl && wv.src !== webviewUrl) wv.src = webviewUrl;
  }, [webviewUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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

  const handleSearch = async () => {
    const query = [enTitle, zhTitle].filter(s => s.trim()).join(" ").trim();
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

  const isStaged = (url: string) => stagedItems.some(s => s.url === url);

  const toggleStaged = (item: StagedItem) => {
    setStagedItems(prev =>
      prev.some(s => s.url === item.url)
        ? prev.filter(s => s.url !== item.url)
        : [...prev, item]
    );
  };

  const handleSelectUrl = (url: string) => {
    if (!url.trim() || !onSelectDbProduct) return;
    onSelectDbProduct(url.trim(), formMeta);
  };

  const handleAddSeries = () => {
    if (stagedItems.length === 0 || !onEnqueueSeries) return;
    onEnqueueSeries(stagedItems.map(s => s.url), formMeta);
    setStagedItems([]);
  };

  const handleGoogleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setGoogleDropActive(false);
    const url = extractImageUrl(e.dataTransfer);
    if (!url) {
      alert("Could not detect an image URL from the dropped content.");
      return;
    }
    if (seriesMode) {
      toggleStaged({ url, thumb: url });
    } else if (onDropImage) {
      onDropImage(url, formMeta);
    }
  };

  const dropZoneStyle = (active: boolean): React.CSSProperties => ({
    border: `2px dashed ${active ? "var(--color-primary)" : "var(--color-border)"}`,
    borderRadius: "var(--radius-md)",
    background: active ? "var(--color-primary-muted)" : "var(--color-bg-subtle)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    transition: "border-color 0.15s, background 0.15s",
  });

  return (
    <Modal
      open={true}
      onOpenChange={(open) => !open && onClose()}
      closeOnOverlayClick
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{
          margin: 0,
          fontSize: "var(--text-xl)",
          fontWeight: "var(--font-bold)",
          fontFamily: "var(--font-sans)",
          color: "var(--color-text)",
        }}>
          Add Product
        </h2>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
            color: "var(--color-text-muted)",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      <div style={{
        display: "flex",
        gap: 2,
        marginBottom: 16,
        background: "var(--color-bg-subtle)",
        borderRadius: "var(--radius-sm)",
        padding: 3,
      }}>
        {TAB_LABELS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: "6px 8px",
              border: "none",
              borderRadius: "calc(var(--radius-sm) - 2px)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              fontWeight: activeTab === tab.id ? "var(--font-semibold)" : "var(--font-normal)",
              background: activeTab === tab.id ? "var(--color-bg)" : "transparent",
              color: activeTab === tab.id ? "var(--color-text)" : "var(--color-text-muted)",
              boxShadow: activeTab === tab.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: isExpanded ? "hidden" : "auto" }}>

        {activeTab === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "24px 0" }}>
            <div
              onDragOver={e => { e.preventDefault(); setUploadDragOver(true); }}
              onDragLeave={() => setUploadDragOver(false)}
              onDrop={handleUploadDrop}
              onClick={() => uploadFileRef.current?.click()}
              style={{ ...dropZoneStyle(uploadDragOver), width: "100%", padding: "40px 24px", cursor: "pointer", gap: 8 }}
            >
              <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)", color: "var(--color-text)", fontFamily: "var(--font-sans)" }}>
                Drop image here or click to browse
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}>
                JPG, PNG, WebP
              </div>
            </div>
            <input
              ref={uploadFileRef}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp"
              onChange={e => {
                const file = e.target.files?.[0] as (File & { path?: string }) | undefined;
                if (file?.path) { onLocalFile(slotIndex, file.path); onClose(); }
              }}
            />
          </div>
        )}

        {activeTab === "product" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>

            {/* Search row — titles only */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>English Title</label>
                  <input
                    type="text"
                    value={enTitle}
                    onChange={e => setEnTitle(e.target.value)}
                    onKeyDown={handleEnterKey}
                    placeholder="e.g. Norwegian Mackerel Fillet"
                    style={inputStyle}
                    onFocus={fieldFocus}
                    onBlur={fieldBlur}
                    autoFocus
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>
                    Chinese Title{" "}
                    <span style={{ fontWeight: "var(--font-normal)", color: "var(--color-text-muted)" }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={zhTitle}
                    onChange={e => setZhTitle(e.target.value)}
                    onKeyDown={handleEnterKey}
                    placeholder="e.g. 挪威鲭鱼"
                    style={inputStyle}
                    onFocus={fieldFocus}
                    onBlur={fieldBlur}
                  />
                </div>
                <Button variant="primary" onClick={handleSearch} disabled={!canSearch} style={{ flexShrink: 0, height: 38 }}>
                  {searchLoading ? "Searching…" : "Search"}
                </Button>
              </div>

              {/* Optional product details — not used for search */}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>
                    Size{" "}
                    <span style={{ fontWeight: "var(--font-normal)", color: "var(--color-text-muted)" }}>(optional)</span>
                  </label>
                  <input type="text" value={size} onChange={e => setSize(e.target.value)} placeholder="e.g. 500g" style={inputStyle} onFocus={fieldFocus} onBlur={fieldBlur} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>
                    Sale Price{" "}
                    <span style={{ fontWeight: "var(--font-normal)", color: "var(--color-text-muted)" }}>(optional)</span>
                  </label>
                  <input type="text" value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="e.g. 3.99" style={inputStyle} onFocus={fieldFocus} onBlur={fieldBlur} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>
                    Regular Price{" "}
                    <span style={{ fontWeight: "var(--font-normal)", color: "var(--color-text-muted)" }}>(optional)</span>
                  </label>
                  <input type="text" value={regPrice} onChange={e => setRegPrice(e.target.value)} placeholder="e.g. 5.99" style={inputStyle} onFocus={fieldFocus} onBlur={fieldBlur} />
                </div>
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingBottom: 2 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Series</label>
                  <button
                    type="button"
                    onClick={() => { setSeriesMode(v => !v); setStagedItems([]); }}
                    title={seriesMode ? "Series mode on" : "Series mode off"}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      background: seriesMode ? "var(--color-primary)" : "var(--color-border)",
                      border: "none",
                      cursor: "pointer",
                      position: "relative",
                      transition: "background 0.2s",
                    }}
                  >
                    <div style={{
                      position: "absolute",
                      top: 3,
                      left: seriesMode ? 23 : 3,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      transition: "left 0.2s",
                    }} />
                  </button>
                </div>
              </div>
            </div>

            {searchLoading && (
              <p style={{ color: "var(--color-text-muted)", textAlign: "center", fontSize: "var(--text-sm)", margin: 0, flexShrink: 0, fontFamily: "var(--font-sans)" }}>
                Searching database…
              </p>
            )}

            {seriesMode && !hasResults && !searchLoading && (
              <div style={{
                fontSize: "var(--text-sm)",
                color: "var(--color-primary)",
                background: "var(--color-primary-muted)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 12px",
                flexShrink: 0,
                fontFamily: "var(--font-sans)",
              }}>
                Series mode on — search, then click DB results or drag from Google to stage multiple flavour images.
              </div>
            )}

            {useBackgroundIngest && jobs.length > 0 && !hasResults && (
              <IngestJobQueuePanel jobs={jobs} onCancelJob={onCancelJob} />
            )}

            {hasResults && !searchLoading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
                <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>

                  {/* Left: DB results + queue */}
                  <div style={{ width: 180, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                    <div style={sectionHeaderStyle}>Database ({dbResults.length})</div>
                    {dbResults.length === 0 && (
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", fontStyle: "italic", fontFamily: "var(--font-sans)" }}>
                        No database match
                      </div>
                    )}
                    {dbResults.map((r, idx) => {
                      const staged = isStaged(r.publicUrl ?? "");
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (seriesMode) {
                              toggleStaged({ url: r.publicUrl ?? "", thumb: r.publicUrl });
                            } else {
                              handleSelectUrl(r.publicUrl ?? "");
                            }
                          }}
                          disabled={!useBackgroundIngest && !r.publicUrl}
                          style={{
                            padding: 0,
                            border: `2px solid ${staged ? "var(--color-primary)" : "var(--color-border)"}`,
                            borderRadius: "var(--radius-sm)",
                            background: staged ? "var(--color-primary-muted)" : "var(--color-bg)",
                            cursor: "pointer",
                            overflow: "hidden",
                            textAlign: "left",
                            position: "relative",
                            flexShrink: 0,
                            transition: "border-color 0.15s, background 0.15s",
                          }}
                        >
                          {staged && (
                            <div style={{
                              position: "absolute", top: 4, right: 4,
                              width: 18, height: 18, borderRadius: "50%",
                              background: "var(--color-primary)", color: "#fff",
                              fontSize: 11, fontWeight: 700,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              zIndex: 2,
                            }}>✓</div>
                          )}
                          <div style={badgeStyle("var(--color-success)")}>DB</div>
                          <div style={{ width: "100%", height: 90, background: "var(--color-bg-subtle)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                            {r.publicUrl ? (
                              <img src={r.publicUrl} alt={r.englishTitle || ""} style={{ width: "100%", height: "100%", objectFit: "contain" }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>No preview</span>
                            )}
                          </div>
                          <div style={{ padding: "4px 6px", fontSize: 10, color: "var(--color-text)", lineHeight: 1.3, fontFamily: "var(--font-sans)" }}>
                            {r.englishTitle || r.chineseTitle || r.id}
                          </div>
                        </button>
                      );
                    })}

                    <IngestJobQueuePanel jobs={jobs} onCancelJob={onCancelJob} />
                  </div>

                  {/* Right: Google webview + drop zone */}
                  <div style={{ flex: 1, display: "flex", gap: 10, minWidth: 0 }}>
                    <div style={{ flex: 1, borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--color-border)" }}>
                      <webview
                        ref={webviewRef as any}
                        src={webviewUrl}
                        style={{ width: "100%", height: "100%" }}
                      />
                    </div>
                    <div
                      onDragOver={e => { e.preventDefault(); setGoogleDropActive(true); }}
                      onDragLeave={e => { e.preventDefault(); setGoogleDropActive(false); }}
                      onDrop={handleGoogleDrop}
                      style={{
                        ...dropZoneStyle(googleDropActive),
                        width: 140,
                        flexShrink: 0,
                        padding: 12,
                        fontSize: "var(--text-sm)",
                        color: "var(--color-text)",
                        gap: 6,
                      }}
                    >
                      <div style={{ fontWeight: "var(--font-semibold)", fontFamily: "var(--font-sans)" }}>
                        {seriesMode ? "Drop to stage" : "Drop image here"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.4, fontFamily: "var(--font-sans)" }}>
                        {seriesMode
                          ? "Drag images from Google to stage them"
                          : "Drag a product image from Google into this box"}
                      </div>
                      {useBackgroundIngest && (
                        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 4, fontFamily: "var(--font-sans)" }}>
                          Processing continues if you close this window
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {seriesMode && (
                  <div style={{
                    flexShrink: 0,
                    borderTop: "1px solid var(--color-border)",
                    paddingTop: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: "var(--font-bold)",
                      color: "var(--color-primary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      flexShrink: 0,
                      fontFamily: "var(--font-sans)",
                    }}>
                      Staged ({stagedItems.length})
                    </div>

                    <div style={{ display: "flex", gap: 6, flex: 1, overflowX: "auto", alignItems: "center" }}>
                      {stagedItems.length === 0 && (
                        <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", fontStyle: "italic", fontFamily: "var(--font-sans)" }}>
                          Click DB results or drop from Google to stage flavour images
                        </span>
                      )}
                      {stagedItems.map((s, i) => (
                        <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                          <div style={{ width: 56, height: 56, borderRadius: 6, overflow: "hidden", border: "2px solid var(--color-primary)", background: "var(--color-bg-subtle)" }}>
                            {s.thumb && (
                              <img src={s.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setStagedItems(prev => prev.filter((_, j) => j !== i))}
                            style={{
                              position: "absolute", top: -6, right: -6,
                              width: 16, height: 16, borderRadius: "50%",
                              background: "var(--color-error)", color: "#fff",
                              border: "none", cursor: "pointer",
                              fontSize: 9, fontWeight: 700,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              lineHeight: 1,
                            }}
                          >✕</button>
                        </div>
                      ))}
                    </div>

                    <Button
                      variant="primary"
                      onClick={handleAddSeries}
                      disabled={stagedItems.length === 0 || !onEnqueueSeries}
                      style={{ flexShrink: 0 }}
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

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, flexShrink: 0 }}>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 5,
  fontWeight: "var(--font-semibold)",
  fontSize: "var(--text-sm)",
  fontFamily: "var(--font-sans)",
  color: "var(--color-text)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 11px",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--text-sm)",
  fontFamily: "var(--font-sans)",
  boxSizing: "border-box",
  outline: "none",
  background: "var(--color-bg)",
};

const fieldFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = "var(--color-primary)";
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(76,110,245,0.12)";
};

const fieldBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = "var(--color-border)";
  e.currentTarget.style.boxShadow = "none";
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: "var(--font-bold)",
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 4,
  fontFamily: "var(--font-sans)",
};

const badgeStyle = (color: string): React.CSSProperties => ({
  position: "absolute",
  top: 4,
  left: 4,
  background: color,
  color: "#fff",
  fontSize: 9,
  fontWeight: 700,
  padding: "2px 5px",
  borderRadius: 4,
  zIndex: 1,
  letterSpacing: "0.05em",
});
