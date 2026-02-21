// apps/desktop/src/renderer/editor/AddProductDialog.tsx
// Modal dialog: add a product via single image+details, batch images, pasted text, or XLSX.

import React, { useState, useRef } from "react";
import Button from "../components/ui/Button";

type ElectronFile = File & { path: string };

export type AddProductData =
  | { mode: "single"; imagePath: string; title: string; zh: string; size: string; salePrice: string; regularPrice: string }
  | { mode: "batch"; imagePaths: string[] };

type Props = {
  onAdd: (data: AddProductData) => void;
  onAddFromDiscount?: (items: any[]) => void;
  onClose: () => void;
  department?: string;
};

type Mode = "single" | "batch" | "text" | "xlsx";

const MODES: { id: Mode; label: string }[] = [
  { id: "single", label: "Single" },
  { id: "batch",  label: "Batch Images" },
  { id: "text",   label: "Text" },
  { id: "xlsx",   label: "XLSX" },
];

export default function AddProductDialog({ onAdd, onAddFromDiscount, onClose, department }: Props) {
  const [mode, setMode] = useState<Mode>("single");

  // --- Single mode ---
  const [singleImagePath, setSingleImagePath] = useState("");
  const [singleDragOver, setSingleDragOver] = useState(false);
  const [title, setTitle] = useState("");
  const [zh, setZh] = useState("");
  const [size, setSize] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [regularPrice, setRegularPrice] = useState("");
  const singleFileRef = useRef<HTMLInputElement>(null);

  // --- Batch mode ---
  const [batchPaths, setBatchPaths] = useState<string[]>([]);
  const [batchDragOver, setBatchDragOver] = useState(false);
  const batchFileRef = useRef<HTMLInputElement>(null);

  // --- Text mode ---
  const [discountText, setDiscountText] = useState("");

  // --- XLSX mode ---
  const [xlsxPath, setXlsxPath] = useState<string | null>(null);
  const [xlsxDragOver, setXlsxDragOver] = useState(false);

  // --- Shared ---
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // ── price validation (same rule as DiscountDetailsDialog) ────────────────
  const parsePrice = (v: unknown) => parseFloat(String(v ?? "").replace(/^\$/, ""));
  const regNum  = parsePrice(regularPrice);
  const saleNum = parsePrice(salePrice);
  const priceError =
    String(regularPrice).trim() &&
    String(salePrice).trim() &&
    !isNaN(regNum) &&
    !isNaN(saleNum) &&
    saleNum > regNum
      ? "Sale price cannot be higher than regular price."
      : "";

  // ── helpers ──────────────────────────────────────────────────────────────

  const addImageFiles = (files: ElectronFile[], multi: boolean) => {
    const paths = files
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.path || f.name))
      .map(f => f.path);
    if (!paths.length) return;
    if (multi) {
      setBatchPaths(prev => {
        const set = new Set(prev);
        return [...prev, ...paths.filter(p => !set.has(p))];
      });
    } else {
      setSingleImagePath(paths[0]);
    }
  };

  const handleDiscountSubmit = async () => {
    if (!onAddFromDiscount) return;
    setIsParsing(true);
    setParseError(null);
    try {
      let items: any[];
      if (mode === "xlsx") {
        if (!xlsxPath) return;
        items = await window.ufm.parseDiscountXlsx(xlsxPath, department);
      } else {
        if (!discountText.trim()) return;
        items = await window.ufm.parseDiscountText(discountText);
      }
      if (!items?.length) {
        setParseError("No products found. Check the file or text and try again.");
        setIsParsing(false);
        return;
      }
      onAddFromDiscount(items);
      onClose();
    } catch (e: any) {
      setParseError(e?.message ?? "Parsing failed. Please try again.");
      setIsParsing(false);
    }
  };

  const handleOpenXlsxDialog = async () => {
    try {
      const path = await window.ufm.openXlsxDialog();
      if (path) { setXlsxPath(path); setParseError(null); }
    } catch { /* ignore */ }
  };

  // ── submit guards ────────────────────────────────────────────────────────

  const canSingle = (title.trim().length > 0 || singleImagePath.length > 0) && !priceError;
  const canBatch  = batchPaths.length > 0;
  const canText   = discountText.trim().length > 0;
  const canXlsx   = xlsxPath !== null;

  const handleSubmit = () => {
    if (mode === "single" && canSingle) {
      onAdd({ mode: "single", imagePath: singleImagePath, title: title.trim(), zh: zh.trim(), size: size.trim(), salePrice: salePrice.trim(), regularPrice: regularPrice.trim() });
      onClose();
    } else if (mode === "batch" && canBatch) {
      onAdd({ mode: "batch", imagePaths: batchPaths });
      onClose();
    } else if (mode === "text" || mode === "xlsx") {
      handleDiscountSubmit();
    }
  };

  // ── shared styles ─────────────────────────────────────────────────────────

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

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 5,
    fontWeight: "var(--font-semibold)",
    fontSize: "var(--text-sm)",
    fontFamily: "var(--font-sans)",
    color: "var(--color-text)",
  };

  const dropZoneStyle = (active: boolean): React.CSSProperties => ({
    border: `2px dashed ${active ? "var(--color-primary)" : "var(--color-border)"}`,
    borderRadius: "var(--radius-sm)",
    padding: "16px",
    textAlign: "center",
    cursor: "pointer",
    background: active ? "var(--color-primary-muted)" : "var(--color-bg-subtle)",
    transition: "border-color 0.15s, background 0.15s",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 72,
  });

  const fieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "var(--color-primary)";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(76,110,245,0.12)";
  };
  const fieldBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "var(--color-border)";
    e.currentTarget.style.boxShadow = "none";
  };

  // ── submit label ──────────────────────────────────────────────────────────

  const submitLabel = () => {
    if (isParsing) return "Parsing…";
    if (mode === "batch") return batchPaths.length > 1 ? `Add ${batchPaths.length} Products` : "Add Product";
    if (mode === "text" || mode === "xlsx") return "Add Products";
    return "Add Product";
  };

  const canSubmit = !isParsing && (
    mode === "single" ? canSingle :
    mode === "batch"  ? canBatch  :
    mode === "text"   ? canText   :
    canXlsx
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--color-bg)", borderRadius: "var(--radius-md)", padding: 26, width: 520, maxWidth: "93vw", boxShadow: "0 24px 64px rgba(0,0,0,0.3)", maxHeight: "90vh", overflowY: "auto" }}>

        <h2 style={{ margin: "0 0 14px", fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", fontFamily: "var(--font-sans)" }}>
          Add Product
        </h2>

        {/* Mode selector */}
        <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "var(--color-bg-subtle)", borderRadius: "var(--radius-sm)", padding: 3 }}>
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setParseError(null); }}
              style={{
                flex: 1,
                padding: "6px 8px",
                border: "none",
                borderRadius: "calc(var(--radius-sm) - 2px)",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
                fontWeight: mode === m.id ? "var(--font-semibold)" : "var(--font-normal)",
                background: mode === m.id ? "var(--color-bg)" : "transparent",
                color: mode === m.id ? "var(--color-text)" : "var(--color-text-muted)",
                boxShadow: mode === m.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* ── SINGLE mode ─────────────────────────────────────────────── */}
        {mode === "single" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Image drop */}
            <div>
              <label style={labelStyle}>
                Product Image{" "}
                <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>(optional)</span>
              </label>
              {singleImagePath ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-bg-subtle)", fontSize: "var(--text-sm)", fontFamily: "var(--font-sans)" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, color: "var(--color-text)" }}>
                    {singleImagePath.split("/").pop()}
                  </span>
                  <button onClick={() => setSingleImagePath("")} style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", padding: "2px 6px", fontSize: 13 }} title="Clear">✕</button>
                </div>
              ) : (
                <>
                  <div
                    onDragOver={e => { e.preventDefault(); setSingleDragOver(true); }}
                    onDragLeave={() => setSingleDragOver(false)}
                    onDrop={e => { e.preventDefault(); setSingleDragOver(false); addImageFiles(Array.from(e.dataTransfer.files) as ElectronFile[], false); }}
                    onClick={() => singleFileRef.current?.click()}
                    style={dropZoneStyle(singleDragOver)}
                  >
                    <div style={{ fontWeight: "var(--font-semibold)", color: "var(--color-text)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>Drop image here or click to browse</div>
                    <div style={{ fontSize: "var(--text-xs, 11px)", color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}>JPG, PNG, WebP</div>
                  </div>
                  <input ref={singleFileRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e => { if (e.target.files) addImageFiles(Array.from(e.target.files) as ElectronFile[], false); }} />
                </>
              )}
            </div>

            {/* Title + Chinese name side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>English Title</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Organic Apple Juice" autoFocus style={inputStyle} onFocus={fieldFocus} onBlur={fieldBlur} onKeyDown={e => { if (e.key === "Escape") onClose(); }} />
              </div>
              <div>
                <label style={labelStyle}>Chinese Name <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>(optional)</span></label>
                <input type="text" value={zh} onChange={e => setZh(e.target.value)} placeholder="e.g. 有机苹果汁" style={inputStyle} onFocus={fieldFocus} onBlur={fieldBlur} />
              </div>
            </div>

            {/* Size */}
            <div>
              <label style={labelStyle}>Size <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>(optional)</span></label>
              <input type="text" value={size} onChange={e => setSize(e.target.value)} placeholder="e.g. 32 oz, 1 lb" style={inputStyle} onFocus={fieldFocus} onBlur={fieldBlur} />
            </div>

            {/* Sale Price + Regular Price side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>Sale Price <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>(optional)</span></label>
                <input type="text" value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="e.g. 2.99" style={{ ...inputStyle, borderColor: priceError ? "var(--color-error, #ef4444)" : undefined }} onFocus={fieldFocus} onBlur={fieldBlur} />
              </div>
              <div>
                <label style={labelStyle}>Regular Price <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>(optional)</span></label>
                <input type="text" value={regularPrice} onChange={e => setRegularPrice(e.target.value)} placeholder="e.g. 4.99" style={{ ...inputStyle, borderColor: priceError ? "var(--color-error, #ef4444)" : undefined }} onFocus={fieldFocus} onBlur={fieldBlur} />
              </div>
            </div>

            {priceError && (
              <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-error, #ef4444)", fontFamily: "var(--font-sans)" }}>
                {priceError}
              </p>
            )}

          </div>
        )}

        {/* ── BATCH mode ──────────────────────────────────────────────── */}
        {mode === "batch" && (
          <div>
            <div
              onDragOver={e => { e.preventDefault(); setBatchDragOver(true); }}
              onDragLeave={() => setBatchDragOver(false)}
              onDrop={e => { e.preventDefault(); setBatchDragOver(false); addImageFiles(Array.from(e.dataTransfer.files) as ElectronFile[], true); }}
              onClick={() => batchFileRef.current?.click()}
              style={dropZoneStyle(batchDragOver)}
            >
              <div style={{ fontWeight: "var(--font-semibold)", color: "var(--color-text)", fontFamily: "var(--font-sans)" }}>Drop images here or click to browse</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}>JPG, PNG, WebP — multiple files allowed</div>
            </div>
            <input ref={batchFileRef} type="file" hidden accept="image/jpeg,image/png,image/webp" multiple onChange={e => { if (e.target.files) addImageFiles(Array.from(e.target.files) as ElectronFile[], true); }} />

            {batchPaths.length > 0 && (
              <div style={{ marginTop: 10, maxHeight: 160, overflowY: "auto" }}>
                {batchPaths.map((p, i) => (
                  <div key={p} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 8px", background: i % 2 === 0 ? "var(--color-bg-subtle)" : "var(--color-bg)", borderRadius: 4, fontSize: "var(--text-sm)", fontFamily: "var(--font-sans)" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, color: "var(--color-text)" }}>{p.split("/").pop()}</span>
                    <button onClick={e => { e.stopPropagation(); setBatchPaths(prev => prev.filter((_, j) => j !== i)); }} style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", padding: "2px 6px", fontSize: 13 }} title="Remove">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TEXT mode ───────────────────────────────────────────────── */}
        {mode === "text" && (
          <div>
            <p style={{ margin: "0 0 12px", fontSize: "var(--text-sm)", color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}>
              Paste product lines with prices. Products will be auto-matched to DB images.
            </p>
            <textarea
              value={discountText}
              onChange={e => setDiscountText(e.target.value)}
              placeholder={"Paste product lines with prices here…\ne.g. Organic Apple Juice 32oz $2.99 reg $4.99"}
              autoFocus
              style={{ ...inputStyle, height: 180, resize: "vertical" }}
              onFocus={fieldFocus}
              onBlur={fieldBlur}
            />
          </div>
        )}

        {/* ── XLSX mode ───────────────────────────────────────────────── */}
        {mode === "xlsx" && (
          <div>
            <p style={{ margin: "0 0 12px", fontSize: "var(--text-sm)", color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}>
              Drop an XLSX discount file or click to browse. Products will be auto-matched to DB images.
              {department && <span style={{ color: "var(--color-primary)", fontWeight: "var(--font-semibold)" }}> Filtering by: {department}</span>}
            </p>

            {xlsxPath ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-bg-subtle)", fontSize: "var(--text-sm)", fontFamily: "var(--font-sans)" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, color: "var(--color-text)" }}>{xlsxPath.split("/").pop()}</span>
                <button onClick={() => setXlsxPath(null)} style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", padding: "2px 6px", fontSize: 13 }} title="Clear">✕</button>
              </div>
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setXlsxDragOver(true); }}
                onDragLeave={() => setXlsxDragOver(false)}
                onDrop={e => {
                  e.preventDefault(); setXlsxDragOver(false);
                  const f = Array.from(e.dataTransfer.files).find(f => f.name.endsWith(".xlsx"));
                  if (f) { setXlsxPath((f as ElectronFile).path); setParseError(null); }
                }}
                onClick={handleOpenXlsxDialog}
                style={dropZoneStyle(xlsxDragOver)}
              >
                <div style={{ fontWeight: "var(--font-semibold)", color: "var(--color-text)", fontFamily: "var(--font-sans)" }}>Drop .xlsx here or click to browse</div>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}>Excel discount list (.xlsx)</div>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {parseError && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--color-error-muted, #fee2e2)", border: "1px solid var(--color-error, #ef4444)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-sm)", color: "var(--color-error, #b91c1c)", fontFamily: "var(--font-sans)" }}>
            {parseError}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <Button variant="secondary" onClick={onClose} disabled={isParsing}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
            {submitLabel()}
          </Button>
        </div>

      </div>
    </div>
  );
}
