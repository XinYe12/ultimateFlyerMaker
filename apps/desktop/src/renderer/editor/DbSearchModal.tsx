import { useState, useEffect, useRef } from "react";
import type { DbSearchResult } from "../global.d";

type Props = {
  itemId: string;
  initialQuery: string;
  cutoutPaths?: string[];
  /** Parent runs download/replace in the background (card shows "Replacing…"). */
  onSelectProduct: (itemId: string, publicUrl: string, targetFlavorIndex?: number) => void;
  onClose: () => void;
  zIndex?: number;
};

export default function DbSearchModal({
  itemId,
  initialQuery,
  cutoutPaths,
  onSelectProduct,
  onClose,
  zIndex = 10000,
}: Props) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [results, setResults] = useState<DbSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const hasMultiFlavors = Array.isArray(cutoutPaths) && cutoutPaths.length > 1;
  const [selectedFlavorIdx, setSelectedFlavorIdx] = useState<number | null>(
    hasMultiFlavors ? 0 : null,
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingId) { setEditingId(null); return; }
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, editingId]);

  const startEditing = (r: DbSearchResult) => {
    setEditingId(r.id);
    setEditingName(r.englishTitle || r.chineseTitle || "");
    setTimeout(() => editInputRef.current?.select(), 0);
  };

  const commitEdit = async (id: string) => {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    const current = results.find(r => r.id === id);
    if (current && (current.englishTitle || current.chineseTitle || "") === name) return;
    setSavingId(id);
    try {
      await window.ufm.updateProductTitle(id, name);
      setResults(prev => prev.map(r => r.id === id ? { ...r, englishTitle: name } : r));
    } catch (err) {
      console.error("Failed to update product title:", err);
    } finally {
      setSavingId(null);
    }
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) {
      alert("Enter a product name to search.");
      return;
    }
    setLoading(true);
    try {
      const res = await window.ufm.searchDatabaseByText(query);
      setResults(res ?? []);
      setSearchedOnce(true);
    } catch (err) {
      console.error("Database search failed:", err);
      onClose();
      alert("Search failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleImageSearch = async (imagePath: string) => {
    setLoading(true);
    try {
      const res = await window.ufm.searchDatabaseByImage(imagePath);
      setResults(res ?? []);
      setSearchedOnce(true);
    } catch (err) {
      console.error("Image search failed:", err);
      alert("Image search failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (publicUrl: string) => {
    if (!publicUrl?.trim()) return;
    if (hasMultiFlavors && selectedFlavorIdx == null) {
      alert("Select which flavor slot to replace first.");
      return;
    }
    onSelectProduct(itemId, publicUrl.trim(), selectedFlavorIdx ?? undefined);
    onClose();
  };

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
      onClick={onClose}
    >
      <div
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: 12,
          maxWidth: hasMultiFlavors ? 820 : 720,
          width: "90%",
          maxHeight: "85vh",
          overflow: "hidden",
          boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "row",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left flavor column — only when multi-flavor */}
        {hasMultiFlavors && (
          <div style={{
            width: 100,
            flexShrink: 0,
            borderRight: "1px solid #E9ECEF",
            overflowY: "auto",
            padding: "16px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            background: "#FAFAFA",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#94A3B8",
              textTransform: "uppercase", letterSpacing: "0.06em",
              marginBottom: 6, textAlign: "center",
            }}>
              Flavor
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cutoutPaths!.map((p, idx) => {
                const active = selectedFlavorIdx === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedFlavorIdx(idx)}
                    title={`Flavor ${idx + 1}`}
                    style={{
                      padding: 2,
                      border: active ? "2px solid #228BE6" : "2px solid #DEE2E6",
                      borderRadius: 8,
                      background: active ? "#E7F5FF" : "#fff",
                      cursor: "pointer",
                      width: 76,
                      height: 76,
                      overflow: "hidden",
                      margin: "0 auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "border-color 0.12s, background 0.12s",
                    }}
                  >
                    <img
                      src={`file://${p}`}
                      alt={`Flavor ${idx + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Right content area */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>
            {results.length > 0 ? "Choose a product" : "Search database by product name"}
          </h2>

          {loading ? (
            <p style={{ color: "#666" }}>Searching database…</p>
          ) : results.length === 0 ? (
            <>
              {searchedOnce && (
                <p style={{ color: "#c92a2a", marginBottom: 12 }}>
                  No matching products found. Try a different name.
                </p>
              )}
              <p style={{ color: "#666", marginBottom: 12 }}>
                Enter or edit the product name, then click Search.
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Baby Bok Choy"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    fontSize: 14,
                    border: "1px solid #ddd",
                    borderRadius: 8,
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  style={{
                    padding: "10px 20px",
                    background: "#228BE6",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Search
                </button>
              </div>
              <div style={{ margin: "10px 0 8px", textAlign: "center", color: "#bbb", fontSize: 12 }}>— or —</div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0] as (File & { path?: string }) | undefined;
                  if (file?.path) handleImageSearch(file.path);
                }}
                style={{
                  border: "2px dashed #ddd",
                  borderRadius: 8,
                  padding: "18px 12px",
                  textAlign: "center",
                  color: "#aaa",
                  fontSize: 13,
                  background: "#fafafa",
                  marginBottom: 16,
                  userSelect: "none",
                }}
              >
                Drop a product image here to search visually
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setResults([]); setSearchedOnce(false); }}
                style={{
                  marginBottom: 12,
                  padding: "6px 12px",
                  fontSize: 12,
                  background: "#f0f0f0",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                ← Change search
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                {results.map((r) => {
                  const isEditing = editingId === r.id;
                  const isSaving = savingId === r.id;
                  const displayName = r.englishTitle || r.chineseTitle || r.id;
                  return (
                    <div
                      key={r.id}
                      style={{
                        border: "2px solid #ddd",
                        borderRadius: 8,
                        overflow: "hidden",
                        background: "#fff",
                      }}
                    >
                      {/* Image — click to select */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => r.publicUrl && !isEditing && handleSelect(r.publicUrl)}
                        onKeyDown={(e) => e.key === "Enter" && r.publicUrl && !isEditing && handleSelect(r.publicUrl)}
                        style={{ cursor: r.publicUrl && !isEditing ? "pointer" : "default" }}
                      >
                        {r.publicUrl ? (
                          <img
                            src={r.publicUrl}
                            alt={displayName}
                            style={{ width: "100%", height: 140, objectFit: "contain", display: "block" }}
                          />
                        ) : (
                          <div style={{ width: "100%", height: 140, background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 12 }}>
                            No image
                          </div>
                        )}
                      </div>
                      {/* Name — click to edit */}
                      <div style={{ padding: "6px 8px", borderTop: "1px solid #f0f0f0" }}>
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() => commitEdit(r.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); commitEdit(r.id); }
                              if (e.key === "Escape") { e.stopPropagation(); setEditingId(null); }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: "100%", fontSize: 12, border: "1px solid #228BE6", borderRadius: 4, padding: "2px 4px", outline: "none", boxSizing: "border-box" }}
                          />
                        ) : (
                          <div
                            title="Click to edit name"
                            onClick={(e) => { e.stopPropagation(); startEditing(r); }}
                            style={{ fontSize: 12, color: isSaving ? "#999" : "#333", cursor: "text", minHeight: 18, display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isSaving ? "Saving…" : displayName}</span>
                            {!isSaving && <span style={{ color: "#bbb", fontSize: 10, flexShrink: 0 }}>✎</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!loading && results.length > 0 && (
            <p style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
              Click a result to download and replace. The card will show progress.
            </p>
          )}

          <button type="button" onClick={onClose} style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
