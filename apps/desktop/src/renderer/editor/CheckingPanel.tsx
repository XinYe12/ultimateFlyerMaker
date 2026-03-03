// FILE: apps/desktop/src/renderer/editor/CheckingPanel.tsx
// ROLE: Full-screen overlay for item-by-item verification (title → image → price)

import { useState, useEffect, useRef, CSSProperties } from "react";

type Step = "title" | "image" | "price";

export type VerificationProgress = {
  currentIdx: number;
  step: Step;
  flags: number[];
  approved: [number, string[]][];
};

type CheckingPanelProps = {
  items: any[];              // editorQueue
  discountLabels: any[];     // current rendered labels
  originalDiscounts: any[];  // original ParsedDiscount[] from upload
  initialProgress?: VerificationProgress;
  onClose: () => void;
  onComplete: (flaggedIndices: number[]) => void;
  onProgressChange: (progress: VerificationProgress) => void;
};

const STEPS: Step[] = ["title", "image", "price"];
const STEP_LABELS: Record<Step, string> = { title: "TITLE", image: "IMAGE", price: "PRICE" };

export default function CheckingPanel({ items, discountLabels, originalDiscounts, initialProgress, onClose, onComplete, onProgressChange }: CheckingPanelProps) {
  const [currentIdx, setCurrentIdx] = useState<number>(() => initialProgress?.currentIdx ?? 0);
  const [step, setStep] = useState<Step>(() => initialProgress?.step ?? "title");
  const [flags, setFlags] = useState<Set<number>>(() => new Set(initialProgress?.flags ?? []));
  const [approved, setApproved] = useState<Map<number, Set<Step>>>(() => {
    if (!initialProgress?.approved?.length) return new Map();
    return new Map(initialProgress.approved.map(([k, v]) => [k, new Set(v as Step[])]));
  });
  const [done, setDone] = useState(false);

  // Scroll active item into view in both panels
  const leftListRef = useRef<HTMLDivElement>(null);
  const rightListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    [leftListRef, rightListRef].forEach(ref => {
      if (!ref.current) return;
      const el = ref.current.querySelector(`[data-active="true"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [currentIdx]);

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

        {/* ── Two-panel lists ── */}
        <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0, borderBottom: "1px solid #e2e8f0" }}>
          {/* Left: editor thumbnails */}
          <div ref={leftListRef} style={listPanelStyle}>
            <div style={listHeaderStyle}>Editor View</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 12px" }}>
              {items.map((it, i) => {
                const lbl = discountLabels[i];
                const cp = it?.result?.cutoutPath ?? it?.result?.inputPath ?? "";
                const ttl = lbl?.title?.en ?? it?.result?.title?.en ?? "";
                const prc = lbl?.price?.display ?? "";
                const isFlagged = flags.has(i);
                const stepsDone = approved.get(i) ?? new Set<Step>();
                const isActive = i === currentIdx;
                return (
                  <div
                    key={i}
                    data-active={isActive ? "true" : undefined}
                    onClick={() => { setCurrentIdx(i); setStep("title"); }}
                    style={thumbCardStyle(isActive, isFlagged)}
                  >
                    {isFlagged && (
                      <div style={flagBadgeStyle}>⚠</div>
                    )}
                    {cp ? (
                      <img
                        src={cp.startsWith("http") ? cp : `file://${cp}`}
                        style={{ width: "100%", height: 80, objectFit: "contain", background: "#f1f5f9" }}
                        alt=""
                      />
                    ) : (
                      <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12, background: "#f1f5f9" }}>No image</div>
                    )}
                    <div style={{ padding: "4px 6px" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#0f172a", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{ttl || "—"}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{prc}</div>
                    </div>
                    {/* Step dots */}
                    <div style={{ display: "flex", gap: 4, padding: "2px 6px 4px" }}>
                      {STEPS.map(s => (
                        <div key={s} title={s} style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: stepsDone.has(s) ? "#16a34a" : flags.has(i) ? "#d97706" : "#cbd5e1",
                        }} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: input item rows */}
          <div ref={rightListRef} style={{ ...listPanelStyle, borderLeft: "1px solid #e2e8f0" }}>
            <div style={listHeaderStyle}>Input (Upload)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 12px" }}>
              {items.map((_, i) => {
                const o = originalDiscounts[i];
                const isActive = i === currentIdx;
                const isFlagged = flags.has(i);
                if (!o) {
                  return (
                    <div
                      key={i}
                      data-active={isActive ? "true" : undefined}
                      onClick={() => { setCurrentIdx(i); setStep("title"); }}
                      style={inputRowStyle(isActive, isFlagged)}
                    >
                      <span style={{ color: "#94a3b8", fontSize: 11, fontStyle: "italic" }}>Added manually</span>
                    </div>
                  );
                }
                return (
                  <div
                    key={i}
                    data-active={isActive ? "true" : undefined}
                    onClick={() => { setCurrentIdx(i); setStep("title"); }}
                    style={inputRowStyle(isActive, isFlagged)}
                  >
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#0f172a", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{o.en || "—"}</div>
                    {o.zh && <div style={{ fontSize: 11, color: "#475569", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{o.zh}</div>}
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {[o.size, o.price?.display ?? o.salePrice].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Comparison bucket ── */}
        <div style={bucketStyle}>
          <div style={{ display: "flex", gap: 16, alignItems: "stretch", marginBottom: 20 }}>
            {/* Editor side */}
            <div style={compareCardStyle}>
              <div style={compareLabelStyle}>Editor</div>
              {step === "title" && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>{label?.title?.en ?? item?.result?.title?.en ?? <em style={{ color: "#94a3b8" }}>No title</em>}</div>
                  {(label?.title?.zh || item?.result?.title?.zh) && (
                    <div style={{ fontSize: 16, color: "#475569", marginBottom: 6 }}>{label?.title?.zh ?? item?.result?.title?.zh}</div>
                  )}
                  {(label?.title?.size || item?.result?.title?.size) && (
                    <div style={{ fontSize: 13, color: "#94a3b8" }}>{label?.title?.size ?? item?.result?.title?.size}</div>
                  )}
                </div>
              )}
              {step === "image" && (
                <div style={{ textAlign: "center" }}>
                  {cutoutPath ? (
                    <img
                      src={cutoutPath.startsWith("http") ? cutoutPath : `file://${cutoutPath}`}
                      style={{ maxWidth: 300, maxHeight: 260, objectFit: "contain" }}
                      alt="Product"
                    />
                  ) : (
                    <div style={{ color: "#94a3b8", fontStyle: "italic" }}>No image available</div>
                  )}
                </div>
              )}
              {step === "price" && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>{editorPrice}</div>
                  {label?.title?.regularPrice && (
                    <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 8 }}>Reg: {label.title.regularPrice}</div>
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
            </div>
          )}
          {!noOrig && step === "price" && origPrice && editorPrice && (
            <div style={{ textAlign: "center", marginBottom: 12, fontSize: 13 }}>
              {origPrice.trim() === editorPrice.trim()
                ? <span style={{ color: "#16a34a" }}>✓ Exact match</span>
                : <span style={{ color: "#f59e0b" }}>Values differ — check carefully</span>}
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

const listPanelStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  minWidth: 0,
  background: "#f8fafc",
};

const listHeaderStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  padding: "8px 12px 4px",
  borderBottom: "1px solid #e2e8f0",
  background: "#fff",
};

const thumbCardStyle = (isActive: boolean, isFlagged: boolean): CSSProperties => ({
  background: isActive ? "#ede9fe" : "#fff",
  border: `2px solid ${isActive ? "#7c3aed" : isFlagged ? "#d97706" : "#e2e8f0"}`,
  borderRadius: 8,
  cursor: "pointer",
  overflow: "hidden",
  position: "relative",
  transition: "border-color 0.15s",
  flexShrink: 0,
  boxShadow: isActive ? "0 0 0 3px #ede9fe" : "0 1px 3px rgba(0,0,0,0.06)",
});

const flagBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 4,
  right: 4,
  background: "#d97706",
  color: "#fff",
  borderRadius: "50%",
  width: 20,
  height: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  zIndex: 2,
};

const inputRowStyle = (isActive: boolean, isFlagged: boolean): CSSProperties => ({
  background: isActive ? "#ede9fe" : "#fff",
  border: `2px solid ${isActive ? "#7c3aed" : isFlagged ? "#d97706" : "#e2e8f0"}`,
  borderRadius: 8,
  padding: "8px 10px",
  cursor: "pointer",
  minHeight: 56,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 2,
  transition: "border-color 0.15s",
  flexShrink: 0,
  overflow: "hidden",
  boxShadow: isActive ? "0 0 0 3px #ede9fe" : "0 1px 3px rgba(0,0,0,0.06)",
});

const bucketStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: "20px 24px",
  margin: 16,
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
  minHeight: 160,
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
