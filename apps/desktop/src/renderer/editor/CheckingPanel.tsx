// FILE: apps/desktop/src/renderer/editor/CheckingPanel.tsx
// ROLE: Full-screen overlay for item-by-item verification (title → image → price)

import { useState, useEffect, useRef, CSSProperties } from "react";
import DbSearchModal from "./DbSearchModal";
import GoogleSearchModal from "./GoogleSearchModal";
import { ReplacementJob } from "../types";
import { validateSalePrice, SALE_PRICE_PLACEHOLDER, SALE_PRICE_FORMAT_HINT, MULTI_BUY_RE, PER_UNIT_RE } from "../utils/priceFormat";

/** Convert any stored price display string to the canonical form expected by the input UI. */
function toCanonicalDisplay(raw: string): string {
  if (!raw) return "";
  const legacyMulti = raw.match(/^(\d+)\s+FOR\s+\$?([\d.]+)/i);
  if (legacyMulti) return `${legacyMulti[1]}/${legacyMulti[2]}`;
  if (MULTI_BUY_RE.test(raw) || PER_UNIT_RE.test(raw)) return raw;
  return raw.replace(/^\$/, "");
}

type Step = "title" | "image" | "price";

export type VerificationProgress = {
  currentIdx: number;
  step: Step;
  flags: number[];
  approved: [number, string[]][];
};

type SystemCheckResult = {
  titleMatch: boolean;
  priceMatch: boolean;
  overall: "pass" | "review" | "no-orig";
};

type CheckingPanelProps = {
  items: any[];              // editorQueue
  discountLabels: any[];     // current rendered labels
  originalDiscounts: any[];  // original ParsedDiscount[] from upload
  initialProgress?: VerificationProgress;
  onClose: () => void;
  onComplete: (flaggedIndices: number[]) => void;
  onProgressChange: (progress: VerificationProgress) => void;
  onReplaceImage?: (itemId: string, targetFlavorIndex?: number) => void;
  onSearchReplace?: (itemId: string, data: { path: string; result: any }) => void;
  onDbSelectProduct?: (itemId: string, publicUrl: string, targetFlavorIndex?: number) => void;
  onSaveDiscountDetails?: (itemId: string, en: string, regularPrice: string, salePrice: string) => void;
  replacementJobs?: ReplacementJob[];
  onEnqueueGoogleReplace?: (itemId: string, url: string, query: string, isMultiFlavor: boolean, targetFlavorIndex?: number) => void;
};

const STEPS: Step[] = ["title", "image", "price"];
const STEP_LABELS: Record<Step, string> = { title: "TITLE", image: "IMAGE", price: "PRICE" };

// ── Pure helpers for system check ──────────────────────────────────────────

function tokenize(str: string): string[] {
  return str
    .toLowerCase()
    .split(/[\s,./\\()\-_:;!?&+]+/)
    .filter((t) => t.length >= 2);
}

function extractPrice(str: string): number | null {
  const m = str.match(/([\d]+\.[\d]+|[\d]+)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return isNaN(n) ? null : n;
}

function runSystemCheck(
  items: any[],
  discountLabels: any[],
  originalDiscounts: any[]
): Map<number, SystemCheckResult> {
  const result = new Map<number, SystemCheckResult>();
  for (let i = 0; i < items.length; i++) {
    const label = discountLabels[i];
    const orig  = originalDiscounts[i];
    if (orig === undefined || orig === null) {
      result.set(i, { titleMatch: false, priceMatch: false, overall: "no-orig" });
      continue;
    }
    // Title comparison — token overlap ≥ 50%
    const edTitle = label?.title
      ? `${label.title.en ?? ""}${label.title.zh ? ` / ${label.title.zh}` : ""}`
      : (items[i]?.result?.title?.en ?? "");
    const orTitle = `${orig.en ?? ""}${orig.zh ? ` / ${orig.zh}` : ""}`;
    const edTokens = new Set(tokenize(edTitle));
    const orTokens = tokenize(orTitle);
    let titleMatch = false;
    if (edTokens.size > 0 && orTokens.length > 0) {
      const hits = orTokens.filter((t) => edTokens.has(t)).length;
      titleMatch = hits / Math.max(edTokens.size, orTokens.length) >= 0.5;
    } else if (edTokens.size === 0 && orTokens.length === 0) {
      titleMatch = true;
    }
    // Price comparison — numeric within $0.005
    const edNum = extractPrice(label?.price?.display ?? "");
    const orNum = extractPrice(orig.price?.display ?? orig.salePrice ?? "");
    const priceMatch = edNum !== null && orNum !== null && Math.abs(edNum - orNum) <= 0.005;
    result.set(i, { titleMatch, priceMatch, overall: titleMatch && priceMatch ? "pass" : "review" });
  }
  return result;
}

export default function CheckingPanel({
  items,
  discountLabels,
  originalDiscounts,
  initialProgress,
  onClose,
  onComplete,
  onProgressChange,
  onReplaceImage,
  onSearchReplace,
  onDbSelectProduct,
  onSaveDiscountDetails,
  replacementJobs,
  onEnqueueGoogleReplace,
}: CheckingPanelProps) {
  const [currentIdx, setCurrentIdx] = useState<number>(() => initialProgress?.currentIdx ?? 0);
  const [step, setStep] = useState<Step>(() => initialProgress?.step ?? "title");
  const [flags, setFlags] = useState<Set<number>>(() => new Set(initialProgress?.flags ?? []));
  const [approved, setApproved] = useState<Map<number, Set<Step>>>(() => {
    if (!initialProgress?.approved?.length) return new Map();
    return new Map(initialProgress.approved.map(([k, v]) => [k, new Set(v as Step[])]));
  });
  const [done, setDone] = useState(false);
  const [systemChecks, setSystemChecks] = useState<Map<number, SystemCheckResult>>(new Map());

  // Modal state for DB/Google modals rendered inside the panel
  const [dbSearchItemId, setDbSearchItemId] = useState<string | null>(null);
  const [googleSearchItemId, setGoogleSearchItemId] = useState<string | null>(null);

  // Inline edit state
  const [editTitle, setEditTitle] = useState<{ en: string; zh: string; size: string; regularPrice: string } | null>(null);
  const [editSalePrice, setEditSalePrice] = useState<string>("");
  const [editRegularPrice, setEditRegularPrice] = useState<string>("");
  const [salePriceTouched, setSalePriceTouched] = useState(false);
  const [checkFlavorIdx, setCheckFlavorIdx] = useState<number>(0);

  // Reset flavor index when navigating to a different item
  useEffect(() => {
    setCheckFlavorIdx(0);
  }, [currentIdx]);

  // Scroll active chip into view
  const chipStripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = chipStripRef.current;
    if (!strip) return;
    const activeChip = strip.querySelector('[data-active="true"]') as HTMLElement | null;
    activeChip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [currentIdx]);

  // Re-initialize edit state when item or step changes
  useEffect(() => {
    const item = items[currentIdx];
    const label = discountLabels[currentIdx];
    if (step === "title") {
      setEditTitle({
        en: label?.title?.en ?? item?.result?.title?.en ?? "",
        zh: label?.title?.zh ?? item?.result?.title?.zh ?? "",
        size: label?.title?.size ?? item?.result?.title?.size ?? "",
        regularPrice: label?.title?.regularPrice ?? label?.price?.regular ?? item?.result?.title?.regularPrice ?? item?.result?.discount?.regularPrice ?? "",
      });
    } else if (step === "price") {
      const priceDisplay = toCanonicalDisplay(
        label?.price?.display ?? (item?.result?.discount as any)?.salePrice ?? ""
      );
      setEditSalePrice(priceDisplay);
      setEditRegularPrice(
        label?.title?.regularPrice
        ?? label?.price?.regular
        ?? item?.result?.title?.regularPrice
        ?? item?.result?.discount?.regularPrice
        ?? ""
      );
      setSalePriceTouched(false);
    }
  }, [currentIdx, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Run system check once on mount
  useEffect(() => {
    setSystemChecks(runSystemCheck(items, discountLabels, originalDiscounts));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (items.length === 0) {
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <div style={{ padding: 40, textAlign: "center", color: "#475569" }}>
            No products to verify.
            <br />
            <button onClick={onClose} style={{ ...btnBase("#e2e8f0"), color: "#475569" }}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  const totalItems = items.length;

  // Helper to get query string for a given item
  const getQueryForItem = (itemId: string): string => {
    const it = items.find((x: any) => x.id === itemId);
    return it?.result?.discount?.en ?? it?.result?.title?.en ?? "";
  };

  // Pure computation — returns next position without touching state
  const computeAdvance = (idx: number, currentStep: Step): { nextIdx: number; nextStep: Step; isDone: boolean } => {
    const stepIdx = STEPS.indexOf(currentStep);
    if (stepIdx < STEPS.length - 1) {
      return { nextIdx: idx, nextStep: STEPS[stepIdx + 1], isDone: false };
    }
    if (idx + 1 < totalItems) {
      return { nextIdx: idx + 1, nextStep: "title", isDone: false };
    }
    return { nextIdx: idx, nextStep: currentStep, isDone: true };
  };

  const serializeProgress = (
    nextIdx: number, nextStep: Step,
    currentFlags: Set<number>, currentApproved: Map<number, Set<Step>>
  ): VerificationProgress => ({
    currentIdx: nextIdx,
    step: nextStep,
    flags: Array.from(currentFlags),
    approved: Array.from(currentApproved.entries()).map(([k, v]) => [k, Array.from(v)]),
  });

  const handleApprove = () => {
    const newApproved = new Map(approved);
    const stepSet = new Set(newApproved.get(currentIdx) ?? []);
    stepSet.add(step);
    newApproved.set(currentIdx, stepSet);
    setApproved(newApproved);

    const { nextIdx, nextStep, isDone } = computeAdvance(currentIdx, step);
    if (isDone) {
      setDone(true);
    } else {
      setCurrentIdx(nextIdx);
      setStep(nextStep);
    }
    onProgressChange(serializeProgress(isDone ? currentIdx : nextIdx, isDone ? step : nextStep, flags, newApproved));
  };

  const handleFlag = () => {
    const newFlags = new Set(flags);
    newFlags.add(currentIdx);
    setFlags(newFlags);

    const { nextIdx, nextStep, isDone } = computeAdvance(currentIdx, step);
    if (isDone) {
      setDone(true);
    } else {
      setCurrentIdx(nextIdx);
      setStep(nextStep);
    }
    onProgressChange(serializeProgress(isDone ? currentIdx : nextIdx, isDone ? step : nextStep, newFlags, approved));
  };

  const handlePrev = () => {
    if (currentIdx > 0) {
      const nextIdx = currentIdx - 1;
      setCurrentIdx(nextIdx);
      setStep("title");
      onProgressChange(serializeProgress(nextIdx, "title", flags, approved));
    }
  };

  const handleNext = () => {
    if (currentIdx < totalItems - 1) {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      setStep("title");
      onProgressChange(serializeProgress(nextIdx, "title", flags, approved));
    }
  };

  if (done) {
    const flagCount = flags.size;
    const approvedCount = totalItems - flagCount;
    return (
      <div style={overlayStyle}>
        <div style={{ ...panelStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
          <button onClick={onClose} style={{ ...{ ...btnBase("#e2e8f0"), color: "#475569" }, position: "absolute", top: 20, right: 20 }}>✕</button>
          <div style={{ fontSize: 48 }}>✅</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>Verification Complete</div>
          <div style={{ fontSize: 18, color: "#475569" }}>
            {approvedCount} approved &nbsp;·&nbsp; {flagCount} flagged
          </div>
          {flagCount > 0 && (
            <div style={{ fontSize: 14, color: "#d97706" }}>
              Flagged items: {Array.from(flags).map(i => i + 1).join(", ")}
            </div>
          )}
          <button
            onClick={() => { onComplete(Array.from(flags)); onClose(); }}
            style={{ ...btnBase("#16a34a"), marginTop: 16, fontSize: 18, padding: "14px 48px" }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  const item = items[currentIdx];
  const label = discountLabels[currentIdx];
  const orig = originalDiscounts[currentIdx];
  const noOrig = orig === undefined || orig === null;

  const editorTitle = label?.title ? `${label.title.en ?? ""}${label.title.zh ? ` / ${label.title.zh}` : ""}` : (item?.result?.title?.en ?? "—");
  const editorPrice = label?.price?.display ?? "—";
  const cutoutPath = item?.result?.cutoutPath ?? item?.result?.inputPath ?? "";

  const origTitle = noOrig ? null : `${orig.en ?? ""}${orig.zh ? ` / ${orig.zh}` : ""}`;
  const origPrice = noOrig ? null : (orig.price?.display ?? orig.salePrice ?? "—");

  // Title save: check if anything changed
  const titleChanged = editTitle !== null && (
    editTitle.en !== (label?.title?.en ?? item?.result?.title?.en ?? "") ||
    editTitle.zh !== (label?.title?.zh ?? item?.result?.title?.zh ?? "") ||
    editTitle.size !== (label?.title?.size ?? item?.result?.title?.size ?? "") ||
    editTitle.regularPrice !== (label?.title?.regularPrice ?? label?.price?.regular ?? item?.result?.title?.regularPrice ?? item?.result?.discount?.regularPrice ?? "")
  );

  const handleSaveTitle = () => {
    if (!editTitle || !item) return;
    const existingSalePrice = toCanonicalDisplay(
      label?.price?.display ?? (item?.result?.discount as any)?.salePrice ?? ""
    );
    onSaveDiscountDetails?.(item.id, editTitle.en, editTitle.regularPrice, existingSalePrice);
  };

  // Price save: check if anything changed and format is valid
  const originalSalePrice = toCanonicalDisplay(
    label?.price?.display ?? (item?.result?.discount as any)?.salePrice ?? ""
  );
  const originalRegularPrice = label?.title?.regularPrice ?? label?.price?.regular ?? item?.result?.title?.regularPrice ?? item?.result?.discount?.regularPrice ?? "";
  const priceChanged = editSalePrice !== originalSalePrice || editRegularPrice !== originalRegularPrice;
  const salePriceFormatError = validateSalePrice(editSalePrice);

  const handleSavePrice = () => {
    if (!item || salePriceFormatError) return;
    const existingEn = label?.title?.en ?? item?.result?.title?.en ?? "";
    onSaveDiscountDetails?.(item.id, existingEn, editRegularPrice, editSalePrice);
  };

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panelStyle}>
        {/* ── Header ── */}
        <div style={headerStyle}>
          <button onClick={onClose} style={closeBtnStyle} title="Close">✕</button>
          <span style={{ fontWeight: 700, fontSize: 18, color: "#0f172a" }}>Verify Products</span>
          <span style={{ color: "#7c3aed", fontWeight: 600 }}>
            Item {currentIdx + 1} / {totalItems} — {STEP_LABELS[step]}
          </span>
        </div>

        {/* ── Item queue chip strip ── */}
        <div
          ref={chipStripRef}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            overflowX: "auto",
            flexShrink: 0,
            borderBottom: "1px solid #e2e8f0",
            background: "#f8fafc",
            scrollbarWidth: "none",
          } as CSSProperties}
        >
          {items.map((it, i) => {
            const lbl = discountLabels[i];
            const isActive = i === currentIdx;
            const isFlagged = flags.has(i);
            const isDone = (approved.get(i) ?? new Set()).size === STEPS.length;
            const isReplacing = (replacementJobs ?? []).some((j) => j.itemId === it.id && j.status === "processing");
            const name = (lbl?.title?.en ?? it?.result?.title?.en ?? originalDiscounts[i]?.en ?? "—").slice(0, 14);
            return (
              <button
                key={i}
                data-active={isActive ? "true" : undefined}
                onClick={() => { setCurrentIdx(i); setStep("title"); }}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 10px",
                  borderRadius: 20,
                  border: isActive ? "1.5px solid #6d28d9" : isReplacing ? "1.5px solid #4C6EF5" : "1.5px solid #e2e8f0",
                  background: isActive ? "#ede9fe" : isReplacing ? "#EDF2FF" : "#fff",
                  cursor: "pointer", flexShrink: 0,
                  fontSize: 11, fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#5b21b6" : "#334155",
                  whiteSpace: "nowrap",
                  boxShadow: isActive ? "0 0 0 2px #c4b5fd55" : "none",
                }}
              >
                {isReplacing ? (
                  <span style={{
                    width: 9, height: 9, flexShrink: 0, borderRadius: "50%",
                    border: "1.5px solid rgba(76,110,245,0.2)", borderTopColor: "#4C6EF5",
                    animation: "ufm-spin 0.75s linear infinite", display: "inline-block",
                  }} />
                ) : (
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: isFlagged ? "#d97706" : isDone ? "#16a34a" : isActive ? "#7c3aed" : "#cbd5e1",
                  }} />
                )}
                <span style={{ fontWeight: 700, color: "#7c3aed", marginRight: 2 }}>#{i + 1}</span>
                {name}
                {isReplacing && (
                  <span style={{ fontSize: 9, color: "#4C6EF5", fontWeight: 700, marginLeft: 2 }}>⟳</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Comparison bucket ── */}
        <div style={bucketStyle}>
          <div style={{ display: "flex", gap: 16, alignItems: "stretch", marginBottom: 20 }}>
            {/* Editor side */}
            <div style={compareCardStyle}>
              <div style={compareLabelStyle}>Editor</div>
              {step === "title" && editTitle !== null && (
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <label style={editLabelStyle}>English</label>
                    <input
                      value={editTitle.en}
                      onChange={(e) => setEditTitle({ ...editTitle, en: e.target.value })}
                      style={editInputStyle}
                      placeholder="English title"
                    />
                  </div>
                  <div>
                    <label style={editLabelStyle}>Chinese (optional)</label>
                    <input
                      value={editTitle.zh}
                      onChange={(e) => setEditTitle({ ...editTitle, zh: e.target.value })}
                      style={editInputStyle}
                      placeholder="中文名称"
                    />
                  </div>
                  <div>
                    <label style={editLabelStyle}>Size (optional)</label>
                    <input
                      value={editTitle.size}
                      onChange={(e) => setEditTitle({ ...editTitle, size: e.target.value })}
                      style={editInputStyle}
                      placeholder="e.g. 500g"
                    />
                  </div>
                  <div>
                    <label style={editLabelStyle}>Regular price</label>
                    <input
                      value={editTitle.regularPrice}
                      onChange={(e) => setEditTitle({ ...editTitle, regularPrice: e.target.value })}
                      style={editInputStyle}
                      placeholder="e.g. 4.99"
                    />
                  </div>
                  {titleChanged && onSaveDiscountDetails && (
                    <button onClick={handleSaveTitle} style={{ ...btnBase("#7c3aed"), marginTop: 4, fontSize: 13, padding: "8px 16px" }}>
                      Save ✓
                    </button>
                  )}
                </div>
              )}
              {step === "image" && (
                <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%" }}>
                  {/* Flavor picker — only for multi-flavor products */}
                  {Array.isArray(item?.result?.cutoutPaths) && item.result.cutoutPaths.length > 1 && (
                    <div style={{ width: "100%" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, textAlign: "left" }}>
                        Replacing flavor:
                      </div>
                      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                        {item.result.cutoutPaths.map((p: string, idx: number) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setCheckFlavorIdx(idx)}
                            title={`Flavor ${idx + 1}`}
                            style={{
                              padding: 0, flexShrink: 0,
                              width: 52, height: 52,
                              border: checkFlavorIdx === idx ? "2.5px solid #7c3aed" : "2px solid #e2e8f0",
                              borderRadius: 8,
                              background: checkFlavorIdx === idx ? "#ede9fe" : "#f8fafc",
                              cursor: "pointer",
                              overflow: "hidden",
                            }}
                          >
                            <img
                              src={p.startsWith("http") ? p : `file://${p}`}
                              alt={`Flavor ${idx + 1}`}
                              style={{ width: "100%", height: "100%", objectFit: "contain" }}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Product image — show selected flavor when multi-flavor */}
                  {(() => {
                    const paths = item?.result?.cutoutPaths;
                    const isMulti = Array.isArray(paths) && paths.length > 1;
                    const displayPath = isMulti ? paths[checkFlavorIdx] : cutoutPath;
                    const activeJob = (replacementJobs ?? []).find((j) => j.itemId === item.id && j.status === "processing");
                    if (!displayPath) return <div style={{ color: "#94a3b8", fontStyle: "italic" }}>No image available</div>;
                    const src = displayPath.startsWith("http") ? displayPath : `file://${displayPath}`;
                    return (
                      <div style={{ position: "relative", display: "inline-flex" }}>
                        <img
                          src={src}
                          style={{ maxWidth: isMulti ? 220 : 300, maxHeight: isMulti ? 180 : 220, objectFit: "contain", opacity: activeJob ? 0.35 : 1, transition: "opacity 0.2s" }}
                          alt="Product"
                        />
                        {activeJob && (
                          <div style={{
                            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center", gap: 6,
                          }}>
                            <div style={{ width: 24, height: 24, border: "3px solid rgba(76,110,245,0.18)", borderTopColor: "#4C6EF5", borderRadius: "50%", animation: "ufm-spin 0.75s linear infinite" }} />
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#4C6EF5", textTransform: "uppercase", letterSpacing: "0.06em" }}>Replacing…</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {/* Image replacement buttons */}
                  {(onReplaceImage || onSearchReplace) && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                      {onReplaceImage && (
                        <button
                          onClick={() => {
                            const isMulti = Array.isArray(item?.result?.cutoutPaths) && item.result.cutoutPaths.length > 1;
                            onReplaceImage(item.id, isMulti ? checkFlavorIdx : undefined);
                          }}
                          style={imgReplaceBtnStyle}
                          title="Upload local file"
                        >
                          📁 Local
                        </button>
                      )}
                      {onSearchReplace && (
                        <button
                          onClick={() => setDbSearchItemId(item.id)}
                          style={imgReplaceBtnStyle}
                          title="Search product database"
                        >
                          💾 Database
                        </button>
                      )}
                      {onSearchReplace && (
                        <button
                          onClick={() => setGoogleSearchItemId(item.id)}
                          style={imgReplaceBtnStyle}
                          title="Search Google Images"
                        >
                          🔍 Google
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {step === "price" && (
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div>
                    <label style={editLabelStyle}>Sale price</label>
                    <input
                      value={editSalePrice}
                      onChange={(e) => { setEditSalePrice(e.target.value); setSalePriceTouched(true); }}
                      onBlur={() => setSalePriceTouched(true)}
                      style={{
                        ...editInputStyle,
                        fontSize: 20,
                        fontWeight: 700,
                        borderColor: salePriceTouched && salePriceFormatError ? "#dc2626" : undefined,
                      }}
                      placeholder={SALE_PRICE_PLACEHOLDER}
                    />
                    {salePriceTouched && salePriceFormatError ? (
                      <div style={{ fontSize: 10, color: "#dc2626", marginTop: 3 }}>{salePriceFormatError}</div>
                    ) : (
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>{SALE_PRICE_FORMAT_HINT}</div>
                    )}
                  </div>
                  <div>
                    <label style={editLabelStyle}>Regular price</label>
                    <input
                      value={editRegularPrice}
                      onChange={(e) => setEditRegularPrice(e.target.value)}
                      style={editInputStyle}
                      placeholder="e.g. 12.99"
                    />
                  </div>
                  {priceChanged && onSaveDiscountDetails && (
                    <button
                      onClick={handleSavePrice}
                      disabled={!!salePriceFormatError}
                      style={{
                        ...btnBase("#7c3aed"),
                        marginTop: 4,
                        fontSize: 13,
                        padding: "8px 16px",
                        opacity: salePriceFormatError ? 0.45 : 1,
                        cursor: salePriceFormatError ? "not-allowed" : "pointer",
                      }}
                    >
                      Save ✓
                    </button>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", color: "#cbd5e1", fontSize: 20, fontWeight: 700, flexShrink: 0 }}>vs</div>

            {/* Input side */}
            <div style={compareCardStyle}>
              <div style={compareLabelStyle}>Input</div>
              {noOrig ? (
                <div style={{ color: "#94a3b8", fontStyle: "italic", textAlign: "center" }}>
                  Added manually —<br />no source data
                </div>
              ) : (
                <>
                  {step === "title" && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>{orig.en || <em style={{ color: "#94a3b8" }}>No title</em>}</div>
                      {orig.zh && <div style={{ fontSize: 16, color: "#475569", marginBottom: 6 }}>{orig.zh}</div>}
                      {orig.size && <div style={{ fontSize: 13, color: "#94a3b8" }}>{orig.size}</div>}
                    </div>
                  )}
                  {step === "image" && (
                    <div style={{ textAlign: "center", color: "#94a3b8", fontStyle: "italic", lineHeight: 1.6 }}>
                      Source file has no image<br />— visually verify this<br />product image is correct
                    </div>
                  )}
                  {step === "price" && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>{origPrice}</div>
                      {orig.regularPrice && (
                        <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 8 }}>Reg: {orig.regularPrice}</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Match highlight when step is title or price */}
          {!noOrig && step === "title" && origTitle && editorTitle && (
            <div style={{ textAlign: "center", marginBottom: 12, fontSize: 13 }}>
              {origTitle.trim() === editorTitle.trim()
                ? <span style={{ color: "#16a34a" }}>✓ Exact match</span>
                : <span style={{ color: "#f59e0b" }}>Values differ — check carefully</span>}
              {systemChecks.has(currentIdx) && (
                <div style={{ marginTop: 4, fontSize: 12, color: systemChecks.get(currentIdx)!.titleMatch ? "#16a34a" : "#64748b" }}>
                  {systemChecks.get(currentIdx)!.titleMatch ? "🤖 Title: matched" : "🤖 Title: differs"}
                </div>
              )}
            </div>
          )}
          {!noOrig && step === "price" && origPrice && editorPrice && (
            <div style={{ textAlign: "center", marginBottom: 12, fontSize: 13 }}>
              {origPrice.trim() === editorPrice.trim()
                ? <span style={{ color: "#16a34a" }}>✓ Exact match</span>
                : <span style={{ color: "#f59e0b" }}>Values differ — check carefully</span>}
              {systemChecks.has(currentIdx) && (
                <div style={{ marginTop: 4, fontSize: 12, color: systemChecks.get(currentIdx)!.priceMatch ? "#16a34a" : "#64748b" }}>
                  {systemChecks.get(currentIdx)!.priceMatch ? "🤖 Price: matched" : "🤖 Price: differs"}
                </div>
              )}
            </div>
          )}

          {/* Navigation buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <button
              onClick={handlePrev}
              disabled={currentIdx === 0}
              style={{ ...btnBase("#e2e8f0"), color: "#475569", opacity: currentIdx === 0 ? 0.4 : 1 }}
            >
              ← Prev Item
            </button>

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={handleApprove} style={btnBase("#16a34a")}>
                Approve ✓
              </button>
              <button onClick={handleFlag} style={btnBase("#d97706")}>
                Flag ⚠
              </button>
            </div>

            <button
              onClick={handleNext}
              disabled={currentIdx === totalItems - 1}
              style={{ ...btnBase("#e2e8f0"), color: "#475569", opacity: currentIdx === totalItems - 1 ? 0.4 : 1 }}
            >
              Next Item →
            </button>
          </div>
        </div>
      </div>

      {/* ── Modals rendered above the panel (z-index: 21000) ── */}
      {dbSearchItemId && onDbSelectProduct && (
        <DbSearchModal
          itemId={dbSearchItemId}
          initialQuery={getQueryForItem(dbSearchItemId)}
          cutoutPaths={items.find((x: any) => x.id === dbSearchItemId)?.result?.cutoutPaths}
          onSelectProduct={(id, url, targetFlavorIndex) => {
            onDbSelectProduct(id, url, targetFlavorIndex);
            setDbSearchItemId(null);
          }}
          onClose={() => setDbSearchItemId(null)}
          zIndex={21000}
        />
      )}
      {googleSearchItemId && onSearchReplace && (() => {
        const _gItem = items.find((x: any) => x.id === googleSearchItemId);
        const _gIsMulti = Array.isArray(_gItem?.result?.cutoutPaths) && _gItem.result.cutoutPaths.length > 1;
        const _gQuery = getQueryForItem(googleSearchItemId);
        return (
          <GoogleSearchModal
            itemId={googleSearchItemId}
            initialQuery={_gQuery}
            currentImageSrc={(() => {
              const src = _gItem?.result?.cutoutPath ?? _gItem?.result?.inputPath;
              return src ? (src.startsWith("http") ? src : `file://${src}`) : undefined;
            })()}
            isMultiFlavor={_gIsMulti}
            cutoutPaths={_gItem?.result?.cutoutPaths}
            jobs={(replacementJobs ?? []).filter((j) => j.itemId === googleSearchItemId)}
            onDropImage={onEnqueueGoogleReplace
              ? (url, flavorIdx) => onEnqueueGoogleReplace(googleSearchItemId, url, _gQuery, _gIsMulti, flavorIdx)
              : undefined
            }
            onReplace={(id, data) => { onSearchReplace(id, data); setGoogleSearchItemId(null); }}
            onClose={() => setGoogleSearchItemId(null)}
            zIndex={21000}
          />
        );
      })()}
    </div>
  );
}

// ── Style helpers ──────────────────────────────────────────────────────────────

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 20000,
  background: "rgba(15,23,42,0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const panelStyle: CSSProperties = {
  background: "#f8fafc",
  borderRadius: 16,
  width: "min(1200px, 96vw)",
  height: "min(820px, 96vh)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
  position: "relative",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "14px 20px",
  borderBottom: "1px solid #e2e8f0",
  background: "#fff",
  flexShrink: 0,
};

const closeBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "#64748b",
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
  padding: "2px 6px",
  borderRadius: 4,
};

const bucketStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: "20px 24px",
  margin: "12px 16px 16px",
  flexShrink: 0,
  border: "1px solid #e2e8f0",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
};

const compareCardStyle: CSSProperties = {
  flex: 1,
  background: "#f8fafc",
  borderRadius: 10,
  padding: "16px 20px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 200,
  gap: 8,
  border: "1px solid #e2e8f0",
};

const compareLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 8,
  alignSelf: "flex-start",
};

const editLabelStyle: CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 600,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 3,
};

const editInputStyle: CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: 14,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  fontFamily: "inherit",
  background: "#fff",
  color: "#0f172a",
  boxSizing: "border-box",
};

const imgReplaceBtnStyle: CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  background: "#f8fafc",
  cursor: "pointer",
  color: "#475569",
  fontFamily: "inherit",
};

function btnBase(bg: string): CSSProperties {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 22px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "opacity 0.15s",
  };
}
