import { useState, useEffect } from "react";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";

type Props = {
  itemId: string;
  initialEnglishTitle: string;
  initialRegularPrice: string;
  initialSalePrice: string;
  onSave: (
    itemId: string,
    englishTitle: string,
    regularPrice: string,
    salePrice: string
  ) => void;
  onClose: () => void;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  fontSize: "var(--text-base)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  marginBottom: 14,
  fontFamily: "var(--font-sans)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--text-sm)",
  fontWeight: "var(--font-semibold)",
  color: "var(--color-text)",
  marginBottom: "var(--space-1)",
};

export default function DiscountDetailsDialog({
  itemId,
  initialEnglishTitle,
  initialRegularPrice,
  initialSalePrice,
  onSave,
  onClose,
}: Props) {
  const [englishTitle, setEnglishTitle] = useState(() =>
    String(initialEnglishTitle ?? "")
  );
  const [regularPrice, setRegularPrice] = useState(() =>
    String(initialRegularPrice ?? "")
  );
  const [salePrice, setSalePrice] = useState(() =>
    String(initialSalePrice ?? "")
  );

  const parsePrice = (v: unknown) =>
    parseFloat(String(v ?? "").replace(/^\$/, ""));
  const regNum = parsePrice(regularPrice);
  const saleNum = parsePrice(salePrice);
  const priceError =
    String(regularPrice).trim() &&
    String(salePrice).trim() &&
    !isNaN(regNum) &&
    !isNaN(saleNum) &&
    saleNum > regNum
      ? "Sale price cannot be higher than regular price."
      : "";

  const handleSave = () => {
    if (priceError) return;
    onSave(itemId, englishTitle, regularPrice, salePrice);
  };

  return (
    <Modal open={true} onOpenChange={(open) => !open && onClose()}>
      <h2
        style={{
          margin: "0 0 var(--space-4)",
          fontSize: "var(--text-xl)",
          fontWeight: "var(--font-semibold)",
          color: "var(--color-text)",
        }}
      >
        Add discount details
      </h2>
      <p
        style={{
          color: "var(--color-text-muted)",
          fontSize: "var(--text-sm)",
          marginBottom: "var(--space-4)",
        }}
      >
        Shown on the product card and used for Database search.
      </p>
      <label style={labelStyle}>English title</label>
      <input
        type="text"
        value={englishTitle}
        onChange={(e) => setEnglishTitle(e.target.value)}
        placeholder="e.g. Norwegian Mackerel Fillet"
        autoFocus
        style={inputStyle}
      />
      <label style={labelStyle}>Regular price</label>
      <input
        type="text"
        value={regularPrice}
        onChange={(e) => setRegularPrice(e.target.value)}
        placeholder="e.g. 25.00"
        style={inputStyle}
      />
      <label style={labelStyle}>Sale price</label>
      <input
        type="text"
        value={salePrice}
        onChange={(e) => setSalePrice(e.target.value)}
        placeholder="e.g. 19.99 or $19.99"
        style={{ ...inputStyle, marginBottom: 20 }}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") onClose();
        }}
      />
      {priceError && (
        <p
          style={{
            margin: "0 0 var(--space-3)",
            fontSize: "var(--text-sm)",
            color: "var(--color-error)",
          }}
        >
          {priceError}
        </p>
      )}
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          justifyContent: "flex-end",
        }}
      >
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          type="button"
          onClick={handleSave}
          disabled={!!priceError}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}
