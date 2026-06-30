import { useState } from "react";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import {
  validateSalePrice,
  SALE_PRICE_PLACEHOLDER,
  SALE_PRICE_FORMAT_HINT,
} from "../utils/priceFormat";

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
  fontFamily: "var(--font-sans)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--text-sm)",
  fontWeight: "var(--font-semibold)",
  color: "var(--color-text)",
  marginBottom: "var(--space-1)",
};

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  marginTop: 4,
  marginBottom: 14,
};

const errorStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#dc2626",
  marginTop: 4,
  marginBottom: 14,
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
  const [salePriceTouched, setSalePriceTouched] = useState(false);

  const salePriceFormatError = validateSalePrice(salePrice);

  const parsePrice = (v: unknown) =>
    parseFloat(String(v ?? "").replace(/^\$/, ""));
  const regNum = parsePrice(regularPrice);
  const saleNumRaw = salePrice.trim().match(/\$?([\d.]+)/)?.[1] ?? "";
  const saleNum = parsePrice(saleNumRaw);
  const priceRangeError =
    String(regularPrice).trim() &&
    String(salePrice).trim() &&
    !isNaN(regNum) &&
    !isNaN(saleNum) &&
    saleNum > regNum
      ? "Sale price cannot be higher than regular price."
      : "";

  const hasError = (salePriceTouched && !!salePriceFormatError) || !!priceRangeError;

  const handleSave = () => {
    if (salePriceFormatError || priceRangeError) return;
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
        style={{ ...inputStyle, marginBottom: 14 }}
      />

      <label style={labelStyle}>Regular price</label>
      <input
        type="text"
        value={regularPrice}
        onChange={(e) => setRegularPrice(e.target.value)}
        placeholder="e.g. 25.00"
        style={{ ...inputStyle, marginBottom: 14 }}
      />

      <label style={labelStyle}>Sale price</label>
      <input
        type="text"
        value={salePrice}
        onChange={(e) => {
          setSalePrice(e.target.value);
          setSalePriceTouched(true);
        }}
        onBlur={() => setSalePriceTouched(true)}
        placeholder={SALE_PRICE_PLACEHOLDER}
        style={{
          ...inputStyle,
          borderColor: salePriceTouched && salePriceFormatError ? "#dc2626" : undefined,
          outline: salePriceTouched && salePriceFormatError ? "none" : undefined,
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") onClose();
        }}
      />
      {salePriceTouched && salePriceFormatError ? (
        <p style={errorStyle}>{salePriceFormatError}</p>
      ) : (
        <p style={hintStyle}>{SALE_PRICE_FORMAT_HINT}</p>
      )}

      {priceRangeError && (
        <p style={{ ...errorStyle, marginTop: 0 }}>{priceRangeError}</p>
      )}

      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          justifyContent: "flex-end",
          marginTop: 6,
        }}
      >
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          type="button"
          onClick={handleSave}
          disabled={hasError}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}
