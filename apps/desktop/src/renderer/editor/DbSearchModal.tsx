import { useState } from "react";
import type { DbSearchResult } from "../global.d";

type Props = {
  itemId: string;
  initialQuery: string;
  onReplace: (itemId: string, data: { path: string; result: any }) => void;
  onClose: () => void;
};

export default function DbSearchModal({ itemId, initialQuery, onReplace, onClose }: Props) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [results, setResults] = useState<DbSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [replacing, setReplacing] = useState(false);

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

  const handleSelect = async (publicUrl: string) => {
    if (!publicUrl?.trim()) return;
    setReplacing(true);
    try {
      const data = await window.ufm.downloadAndIngestFromUrl(publicUrl.trim());
      onReplace(itemId, data);
      onClose();
    } catch (err) {
      console.error("Replace from URL failed:", err);
      setReplacing(false);
      alert("Failed to replace image: " + (err instanceof Error ? err.message : String(err)));
    }
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
        zIndex: 10000,
      }}
      onClick={() => !replacing && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          maxWidth: 720,
          width: "90%",
          maxHeight: "85vh",
          overflow: "auto",
          boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>
          {results.length > 0 ? "Choose a product" : "Search database by product name"}
        </h2>
        {loading ? (
          <p style={{ color: "#666" }}>Searching database…</p>
        ) : replacing ? (
          <p style={{ color: "#666" }}>Downloading and processing image…</p>
        ) : results.length === 0 ? (
          <>
            {searchedOnce && (
              <p style={{ color: "#c92a2a", marginBottom: 12 }}>
                No matching products found. Try a different name.
              </p>
            )}
            <p style={{ color: "#666", marginBottom: 12 }}>
              Enter or edit the product name, then click Search. New images may have no title yet.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. Norwegian Mackerel Fillet"
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
                  background: "#9C27B0",
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
              }}
            >
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => r.publicUrl && handleSelect(r.publicUrl)}
                  disabled={!r.publicUrl}
                  style={{
                    padding: 0,
                    border: "2px solid #ddd",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "#fff",
                    cursor: r.publicUrl ? "pointer" : "not-allowed",
                  }}
                >
                  {r.publicUrl ? (
                    <img
                      src={r.publicUrl}
                      alt={r.englishTitle ?? r.chineseTitle ?? r.id}
                      style={{
                        width: "100%",
                        height: 140,
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: 140,
                        background: "#f0f0f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      No image
                    </div>
                  )}
                  <div
                    style={{
                      padding: 8,
                      fontSize: 12,
                      textAlign: "left",
                      color: "#333",
                    }}
                  >
                    {r.englishTitle || r.chineseTitle || r.id}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        {!loading && results.length > 0 && (
          <p style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
            No match? Click "Change search" to try a different name.
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          disabled={replacing}
          style={{
            marginTop: 16,
            padding: "8px 16px",
            cursor: replacing ? "wait" : "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
