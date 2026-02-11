import { useState } from "react";

type Props = {
  itemId: string;
  initialEnglishTitle: string;
  initialRegularPrice: string;
  initialSalePrice: string;
  onSave: (itemId: string, englishTitle: string, regularPrice: string, salePrice: string) => void;
  onClose: () => void;
};

export default function DiscountDetailsDialog({
  itemId,
  initialEnglishTitle,
  initialRegularPrice,
  initialSalePrice,
  onSave,
  onClose,
}: Props) {
  const [englishTitle, setEnglishTitle] = useState(() => String(initialEnglishTitle ?? ""));
  const [regularPrice, setRegularPrice] = useState(() => String(initialRegularPrice ?? ""));
  const [salePrice, setSalePrice] = useState(() => String(initialSalePrice ?? ""));

  const parsePrice = (v: unknown) => parseFloat(String(v ?? "").replace(/^\$/, ""));
  const regNum = parsePrice(regularPrice);
  const saleNum = parsePrice(salePrice);
  const priceError =
    String(regularPrice).trim() && String(salePrice).trim() &&
    !isNaN(regNum) && !isNaN(saleNum) &&
    saleNum > regNum
      ? "Sale price cannot be higher than regular price."
      : "";

  const handleSave = () => {
    if (priceError) return;
    onSave(itemId, englishTitle, regularPrice, salePrice);
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
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: 400,
          boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Add discount details</h2>
        <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
          Shown on the product card and used for Database search.
        </p>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#333", marginBottom: 4 }}>
          English title
        </label>
        <input
          type="text"
          value={englishTitle}
          onChange={(e) => setEnglishTitle(e.target.value)}
          placeholder="e.g. Norwegian Mackerel Fillet"
          autoFocus
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            fontSize: 14,
            border: "1px solid #ddd",
            borderRadius: 8,
            marginBottom: 14,
          }}
        />
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#333", marginBottom: 4 }}>
          Regular price
        </label>
        <input
          type="text"
          value={regularPrice}
          onChange={(e) => setRegularPrice(e.target.value)}
          placeholder="e.g. 25.00"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            fontSize: 14,
            border: "1px solid #ddd",
            borderRadius: 8,
            marginBottom: 14,
          }}
        />
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#333", marginBottom: 4 }}>
          Sale price
        </label>
        <input
          type="text"
          value={salePrice}
          onChange={(e) => setSalePrice(e.target.value)}
          placeholder="e.g. 19.99 or $19.99"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            fontSize: 14,
            border: "1px solid #ddd",
            borderRadius: 8,
            marginBottom: 20,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") onClose();
          }}
        />
        {priceError && (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#C92A2A" }}>{priceError}</p>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "8px 16px", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!!priceError}
            style={{
              padding: "8px 16px",
              background: priceError ? "#aaa" : "#333",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: priceError ? "not-allowed" : "pointer",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
