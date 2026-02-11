import { useState, useRef, useEffect } from "react";
import { extractImageUrl } from "./extractImageUrl";

type Props = {
  itemId: string;
  initialQuery: string;
  currentImageSrc?: string;
  onReplace: (itemId: string, data: { path: string; result: any }) => void;
  onClose: () => void;
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

export default function GoogleSearchModal({ itemId, initialQuery, currentImageSrc, onReplace, onClose }: Props) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [groceryContext, setGroceryContext] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [webviewUrl, setWebviewUrl] = useState(() =>
    buildGoogleUrl(initialQuery, false)
  );
  const webviewRef = useRef<HTMLElement>(null);

  // Navigate webview when URL state changes
  useEffect(() => {
    const wv = webviewRef.current as any;
    if (wv && wv.src !== webviewUrl) {
      wv.src = webviewUrl;
    }
  }, [webviewUrl]);

  const handleSearch = () => {
    const query = searchQuery.trim();
    if (!query) return;
    setWebviewUrl(buildGoogleUrl(query, groceryContext));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
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
      const data = await window.ufm.downloadAndIngestFromUrl(url.trim());
      onReplace(itemId, data);
      onClose();
    } catch (err) {
      console.error("Replace from Google result failed:", err);
      setProcessing(false);
      alert(
        "Failed to replace image from Google result: " +
          (err instanceof Error ? err.message : String(err))
      );
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
              cursor: "pointer",
              fontSize: 20,
              color: "#868E96",
              lineHeight: 1,
              padding: "4px 8px",
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
                    // Strip file:// prefix to get raw path for Electron's native file drag
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
              onDragOver={(e) => {
                e.preventDefault();
                if (!processing) setDropActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDropActive(false);
              }}
              onDrop={handleDrop}
              style={{
                flex: 1,
                minHeight: 120,
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
                Drag a product image from the search results into this box
              </div>
            </div>

            {processing && (
              <div style={{ textAlign: "center", fontSize: 12, color: "#666", padding: 8 }}>
                Processing...
              </div>
            )}
          </div>

          {/* Webview area */}
          <div style={{ flex: 1, borderRadius: 8, overflow: "hidden", border: "1px solid #DEE2E6" }}>
            <webview
              ref={webviewRef as any}
              src={webviewUrl}
              style={{ width: "100%", height: "100%" }}
              allowpopups=""
            />
          </div>
        </div>
      </div>
    </div>
  );
}
