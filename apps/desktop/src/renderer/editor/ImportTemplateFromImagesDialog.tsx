import React, { useState, useRef, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { CardStyleDef, CustomFlyerTemplateConfig, CustomTemplatePage, DepartmentAreaDef } from "./loadFlyerTemplateConfig";

type ElectronFile = File & { path: string };

const STANDARD_DEPT_KEYS = [
  "grocery", "meat", "produce", "frozen", "seafood",
  "hot_food", "dairy", "bakery", "sushi",
];

const DEPT_COLORS: Record<string, string> = {
  grocery: "#16a34a",
  meat: "#dc2626",
  produce: "#65a30d",
  frozen: "#2563eb",
  seafood: "#0891b2",
  hot_food: "#ea580c",
  dairy: "#7c3aed",
  bakery: "#d97706",
  sushi: "#db2777",
};

function deptColor(key: string) {
  return DEPT_COLORS[key] ?? "#475569";
}

type AreaDraft = DepartmentAreaDef & { id: string };

type PageDraft = {
  imgPath: string;
  fileUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  areas: AreaDraft[];
  backgroundColor: string;
};

type DragState =
  | { type: "move"; id: string; startMouseX: number; startMouseY: number; startX: number; startY: number }
  | { type: "resize"; id: string; corner: "tl" | "tr" | "bl" | "br"; startMouseX: number; startMouseY: number; startX: number; startY: number; startW: number; startH: number };

const SNAP = 10;
const MIN_SIZE = 80;

function snap(v: number) { return Math.round(v / SNAP) * SNAP; }

type Step = "upload" | "correct" | "parsing";

type Props = {
  onParsed: (config: CustomFlyerTemplateConfig) => void;
  onClose: () => void;
};

export default function ImportTemplateFromImagesDialog({ onParsed, onClose }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parseError, setParseError] = useState<string | null>(null);

  // Overlay correction state
  const [pages, setPages] = useState<PageDraft[]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("Imported Template");

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const dragRef = useRef<DragState | null>(null);

  const page = pages[pageIdx];

  // ── Image upload ──────────────────────────────────────────────────────────

  const addFiles = (files: ElectronFile[]) => {
    const paths = files
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.path || f.name))
      .map(f => f.path)
      .filter(Boolean);
    if (!paths.length) return;
    setImagePaths(prev => {
      const set = new Set(prev);
      paths.forEach(p => set.add(p));
      return Array.from(set);
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files) as ElectronFile[]);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files) as ElectronFile[]);
  };

  const removeImage = (p: string) =>
    setImagePaths(prev => prev.filter(x => x !== p));

  // ── Parse via Gemini ──────────────────────────────────────────────────────

  const parse = async () => {
    if (!imagePaths.length) return;
    setParseError(null);
    setStep("parsing");
    try {
      const config: CustomFlyerTemplateConfig = await (window as any).ufm.parseTemplateFromImages(imagePaths);

      const drafts: PageDraft[] = config.pages.map((p, i) => {
        const imgPath = imagePaths[i] ?? imagePaths[0];
        return {
          imgPath,
          // Always show the original image as overlay preview, regardless of template backgroundImage
          fileUrl: `file:///${imgPath.replace(/\\/g, "/")}`,
          canvasWidth: p.canvasWidth,
          canvasHeight: p.canvasHeight,
          backgroundColor: p.backgroundColor ?? "#ffffff",
          areas: (p.departmentAreas ?? []).map(a => ({
            ...a,
            id: a.id ?? uuidv4(),
          })),
        };
      });

      setPages(drafts);
      setPageIdx(0);
      setSelectedAreaId(null);
      setStep("correct");
    } catch (err: any) {
      setParseError(err?.message ?? "Parse failed");
      setStep("upload");
    }
  };

  // ── Overlay scale: fit image into available container space ───────────────

  useEffect(() => {
    if (step !== "correct" || !page) return;
    const updateScale = () => {
      const el = containerRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      const s = Math.min(
        (width - 32) / page.canvasWidth,
        (height - 32) / page.canvasHeight,
        1
      );
      setScale(Math.max(0.1, s));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [step, page, pageIdx]);

  // ── Drag/resize for overlay areas ────────────────────────────────────────

  const onMouseMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - (d as any).startMouseX) / scale;
    const dy = (e.clientY - (d as any).startMouseY) / scale;

    setPages(prev => prev.map((pg, i) => {
      if (i !== pageIdx) return pg;
      return {
        ...pg,
        areas: pg.areas.map(a => {
          if (a.id !== d.id) return a;
          const r = a.productRegion;
          if (d.type === "move") {
            return {
              ...a,
              productRegion: {
                ...r,
                x: snap(Math.max(0, Math.min((d as any).startX + dx, pg.canvasWidth - r.width))),
                y: snap(Math.max(0, Math.min((d as any).startY + dy, pg.canvasHeight - r.height))),
              },
            };
          } else {
            const { startX: sx, startY: sy, startW: sw, startH: sh } = d as any;
            let { x, y, width, height } = { x: sx, y: sy, width: sw, height: sh };
            if (d.corner === "tl") {
              const nx = snap(Math.min(sx + dx, sx + sw - MIN_SIZE));
              const ny = snap(Math.min(sy + dy, sy + sh - MIN_SIZE));
              width = snap(Math.max(MIN_SIZE, width - (nx - sx)));
              height = snap(Math.max(MIN_SIZE, height - (ny - sy)));
              x = nx; y = ny;
            } else if (d.corner === "tr") {
              const ny = snap(Math.min(sy + dy, sy + sh - MIN_SIZE));
              height = snap(Math.max(MIN_SIZE, height - (ny - sy)));
              width = snap(Math.max(MIN_SIZE, width + dx));
              y = ny;
            } else if (d.corner === "bl") {
              const nx = snap(Math.min(sx + dx, sx + sw - MIN_SIZE));
              width = snap(Math.max(MIN_SIZE, width - (nx - sx)));
              height = snap(Math.max(MIN_SIZE, height + dy));
              x = nx;
            } else {
              width = snap(Math.max(MIN_SIZE, width + dx));
              height = snap(Math.max(MIN_SIZE, height + dy));
            }
            x = Math.max(0, x); y = Math.max(0, y);
            width = Math.min(width, pg.canvasWidth - x);
            height = Math.min(height, pg.canvasHeight - y);
            return { ...a, productRegion: { x, y, width, height } };
          }
        }),
      };
    }));
  }, [scale, pageIdx]);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // ── Area CRUD ─────────────────────────────────────────────────────────────

  const addArea = () => {
    if (!page) return;
    const id = uuidv4();
    const newArea: AreaDraft = {
      id,
      departmentKey: "grocery",
      label: "NEW",
      rows: 3,
      productRegion: {
        x: snap(page.canvasWidth * 0.1),
        y: snap(page.canvasHeight * 0.1),
        width: snap(page.canvasWidth * 0.8),
        height: snap(page.canvasHeight * 0.3),
      },
    };
    setPages(prev => prev.map((pg, i) =>
      i === pageIdx ? { ...pg, areas: [...pg.areas, newArea] } : pg
    ));
    setSelectedAreaId(id);
  };

  const deleteArea = (id: string) => {
    setPages(prev => prev.map((pg, i) =>
      i === pageIdx ? { ...pg, areas: pg.areas.filter(a => a.id !== id) } : pg
    ));
    setSelectedAreaId(null);
  };

  const updateArea = (id: string, patch: Partial<AreaDraft>) => {
    setPages(prev => prev.map((pg, i) =>
      i === pageIdx ? {
        ...pg,
        areas: pg.areas.map(a => a.id === id ? { ...a, ...patch } : a),
      } : pg
    ));
  };

  // ── Confirm all pages → build config ──────────────────────────────────────

  const confirm = () => {
    const configPages: CustomTemplatePage[] = pages.map((pg, pgIdx) => ({
      pageId: `p${pgIdx + 1}`,
      canvasWidth: pg.canvasWidth,
      canvasHeight: pg.canvasHeight,
      // No backgroundImage — we produce an empty template, not a photo overlay
      backgroundColor: pg.backgroundColor,
      boxes: [],
      departmentAreas: pg.areas.map(a => ({
        id: a.id,
        departmentKey: a.departmentKey,
        label: a.label,
        rows: a.rows,
        ...((a as any).cols != null ? { cols: (a as any).cols } : {}),
        productRegion: a.productRegion,
        ...((a as any).cardStyle ? { cardStyle: (a as any).cardStyle } : {}),
      })),
    }));

    onParsed({
      templateId: `imported_${Date.now()}`,
      isCustom: true,
      name: templateName,
      pages: configPages,
    });
  };

  const selectedArea = page?.areas.find(a => a.id === selectedAreaId) ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  const overlayW = (page?.canvasWidth ?? 0) * scale;
  const overlayH = (page?.canvasHeight ?? 0) * scale;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 12000,
        background: "rgba(0,0,0,0.7)",
        display: "flex", flexDirection: "column",
        fontFamily: "var(--font-sans, sans-serif)",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          flex: 1, display: "flex", flexDirection: "column",
          background: "#1e293b", margin: "24px", borderRadius: 12,
          overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid #334155", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#f8fafc" }}>
            {step === "upload" ? "Import Template from Images"
              : step === "parsing" ? "Analyzing Flyer Layout…"
              : "Review & Correct Regions"}
          </span>
          {step === "correct" && (
            <>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Template name:</span>
              <input
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #475569", background: "#334155", color: "#fff", fontSize: 13, width: 200 }}
                onMouseDown={e => e.stopPropagation()}
              />
            </>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{ padding: "4px 12px", background: "#475569", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
          >
            Close
          </button>
        </div>

        {/* ── Upload step ── */}
        {(step === "upload" || step === "parsing") && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 20 }}>
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: "100%", maxWidth: 560, minHeight: 140,
                border: `2px dashed ${dragOver ? "#3b82f6" : "#475569"}`,
                borderRadius: 10, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 8,
                cursor: "pointer", background: dragOver ? "rgba(59,130,246,0.08)" : "#0f172a",
                transition: "border-color .15s, background .15s",
              }}
            >
              <span style={{ fontSize: 32 }}>🖼</span>
              <span style={{ color: "#94a3b8", fontSize: 14 }}>Drag & drop flyer images here, or click to browse</span>
              <span style={{ color: "#64748b", fontSize: 12 }}>PNG / JPG / WEBP — one image per flyer page</span>
              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onFileChange} />
            </div>

            {imagePaths.length > 0 && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", maxWidth: 700 }}>
                {imagePaths.map((p, i) => (
                  <div key={p} style={{ position: "relative", textAlign: "center" }}>
                    <img
                      src={`file:///${p.replace(/\\/g, "/")}`}
                      style={{ width: 100, height: 140, objectFit: "cover", borderRadius: 6, border: "2px solid #334155" }}
                    />
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Page {i + 1}</div>
                    <button
                      onClick={() => removeImage(p)}
                      style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#dc2626", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {parseError && (
              <div style={{ color: "#fca5a5", fontSize: 13, background: "rgba(220,38,38,0.1)", padding: "8px 16px", borderRadius: 6 }}>
                {parseError}
              </div>
            )}

            {step === "parsing" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#94a3b8", fontSize: 14 }}>
                <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid #3b82f6", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Analyzing {imagePaths.length} image{imagePaths.length !== 1 ? "s" : ""} with Gemini…
              </div>
            ) : (
              <button
                onClick={parse}
                disabled={imagePaths.length === 0}
                style={{
                  padding: "10px 32px", background: imagePaths.length ? "#3b82f6" : "#334155",
                  color: "#fff", border: "none", borderRadius: 8, fontWeight: 700,
                  fontSize: 15, cursor: imagePaths.length ? "pointer" : "not-allowed",
                }}
              >
                Parse Template with AI
              </button>
            )}
          </div>
        )}

        {/* ── Correct step ── */}
        {step === "correct" && page && (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* Canvas area */}
            <div
              ref={containerRef}
              style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", position: "relative" }}
              onMouseDown={() => setSelectedAreaId(null)}
            >
              <div
                style={{
                  position: "relative",
                  width: overlayW, height: overlayH,
                  flexShrink: 0,
                }}
                onMouseDown={e => e.stopPropagation()}
              >
                {/* Flyer image as background */}
                <img
                  src={page.fileUrl}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", userSelect: "none", pointerEvents: "none" }}
                  draggable={false}
                />

                {/* Department area overlays */}
                {page.areas.map(area => {
                  const r = area.productRegion;
                  const isSelected = area.id === selectedAreaId;
                  const color = deptColor(area.departmentKey);
                  const handleSize = 10;
                  return (
                    <div
                      key={area.id}
                      style={{
                        position: "absolute",
                        left: r.x * scale, top: r.y * scale,
                        width: r.width * scale, height: r.height * scale,
                        border: `2px ${isSelected ? "solid" : "dashed"} ${color}`,
                        background: isSelected ? `${color}22` : `${color}11`,
                        boxSizing: "border-box",
                        cursor: "move",
                        userSelect: "none",
                      }}
                      onMouseDown={e => {
                        e.stopPropagation();
                        setSelectedAreaId(area.id);
                        dragRef.current = { type: "move", id: area.id, startMouseX: e.clientX, startMouseY: e.clientY, startX: r.x, startY: r.y };
                      }}
                    >
                      <div style={{ position: "absolute", top: 3, left: 4, fontSize: 10, fontWeight: 700, color, pointerEvents: "none", textShadow: "0 0 4px #000", whiteSpace: "nowrap" }}>
                        {area.label}
                      </div>

                      {/* Resize handles (only when selected) */}
                      {isSelected && (["tl", "tr", "bl", "br"] as const).map(corner => {
                        const handlePos: React.CSSProperties = {
                          position: "absolute", width: handleSize, height: handleSize,
                          background: color, border: "2px solid #fff", borderRadius: 2,
                          cursor: corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize",
                          ...(corner === "tl" ? { top: -handleSize / 2, left: -handleSize / 2 }
                            : corner === "tr" ? { top: -handleSize / 2, right: -handleSize / 2 }
                            : corner === "bl" ? { bottom: -handleSize / 2, left: -handleSize / 2 }
                            : { bottom: -handleSize / 2, right: -handleSize / 2 }),
                        };
                        return (
                          <div
                            key={corner}
                            style={handlePos}
                            onMouseDown={e => {
                              e.stopPropagation();
                              dragRef.current = { type: "resize", id: area.id, corner, startMouseX: e.clientX, startMouseY: e.clientY, startX: r.x, startY: r.y, startW: r.width, startH: r.height };
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right panel */}
            <div style={{ width: 240, flexShrink: 0, background: "#1e293b", borderLeft: "1px solid #334155", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Page nav */}
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => { setPageIdx(i => Math.max(0, i - 1)); setSelectedAreaId(null); }}
                  disabled={pageIdx === 0}
                  style={{ padding: "3px 8px", background: "#334155", border: "none", borderRadius: 4, color: pageIdx === 0 ? "#475569" : "#cbd5e1", cursor: pageIdx === 0 ? "not-allowed" : "pointer", fontSize: 14 }}
                >◀</button>
                <span style={{ flex: 1, textAlign: "center", fontSize: 12, color: "#94a3b8" }}>Page {pageIdx + 1} / {pages.length}</span>
                <button
                  onClick={() => { setPageIdx(i => Math.min(pages.length - 1, i + 1)); setSelectedAreaId(null); }}
                  disabled={pageIdx >= pages.length - 1}
                  style={{ padding: "3px 8px", background: "#334155", border: "none", borderRadius: 4, color: pageIdx >= pages.length - 1 ? "#475569" : "#cbd5e1", cursor: pageIdx >= pages.length - 1 ? "not-allowed" : "pointer", fontSize: 14 }}
                >▶</button>
              </div>

              {/* Actions */}
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #334155" }}>
                <button
                  onClick={addArea}
                  style={{ width: "100%", padding: "6px 0", background: "#f59e0b", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                >
                  + Add Region
                </button>
              </div>

              {/* Area list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                {page.areas.length === 0 && (
                  <div style={{ color: "#64748b", fontSize: 12, textAlign: "center", marginTop: 12 }}>
                    No regions detected.<br />Click "+ Add Region" to draw one.
                  </div>
                )}
                {page.areas.map(area => (
                  <div
                    key={area.id}
                    onClick={() => setSelectedAreaId(area.id)}
                    style={{
                      padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                      background: area.id === selectedAreaId ? "#334155" : "transparent",
                      border: `1px solid ${area.id === selectedAreaId ? deptColor(area.departmentKey) : "#334155"}`,
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: deptColor(area.departmentKey), flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#e2e8f0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {area.label}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); deleteArea(area.id); }}
                      style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}
                    >×</button>
                  </div>
                ))}
              </div>

              {/* Selected area editor */}
              {selectedArea && (
                <div style={{ borderTop: "1px solid #334155", padding: "12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>Edit Region</div>

                  <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 11, color: "#64748b" }}>Label</span>
                    <input
                      value={selectedArea.label}
                      onChange={e => updateArea(selectedArea.id, { label: e.target.value })}
                      style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 12 }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 11, color: "#64748b" }}>Department Key</span>
                    <select
                      value={selectedArea.departmentKey}
                      onChange={e => updateArea(selectedArea.id, { departmentKey: e.target.value })}
                      style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 12 }}
                    >
                      {STANDARD_DEPT_KEYS.map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                      {!STANDARD_DEPT_KEYS.includes(selectedArea.departmentKey) && (
                        <option value={selectedArea.departmentKey}>{selectedArea.departmentKey}</option>
                      )}
                    </select>
                  </label>

                  <div style={{ display: "flex", gap: 6 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
                      <span style={{ fontSize: 11, color: "#64748b" }}>Rows</span>
                      <input
                        type="number" min={1} max={20}
                        value={selectedArea.rows}
                        onChange={e => updateArea(selectedArea.id, { rows: Math.max(1, parseInt(e.target.value) || 1) })}
                        style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 12 }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
                      <span style={{ fontSize: 11, color: "#64748b" }}>Cols</span>
                      <input
                        type="number" min={1} max={12}
                        value={(selectedArea as any).cols ?? ""}
                        placeholder="auto"
                        onChange={e => updateArea(selectedArea.id, { cols: e.target.value ? Math.max(1, parseInt(e.target.value) || 1) : undefined } as any)}
                        style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 12 }}
                      />
                    </label>
                  </div>

                  {/* Card style summary (read-only, edit in TemplateBuilder) */}
                  {(selectedArea as any).cardStyle && (() => {
                    const cs: CardStyleDef = (selectedArea as any).cardStyle;
                    return (
                      <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Detected Card Style</span>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {cs.backgroundColor && (
                            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                              <div style={{ width: 12, height: 12, borderRadius: 2, background: cs.backgroundColor, border: "1px solid #334155" }} />
                              <span style={{ fontSize: 10, color: "#94a3b8" }}>bg</span>
                            </div>
                          )}
                          {cs.orientation && <span style={{ fontSize: 10, color: "#94a3b8", background: "#1e293b", padding: "1px 5px", borderRadius: 3 }}>{cs.orientation}</span>}
                          {cs.borderRadius != null && cs.borderRadius > 0 && <span style={{ fontSize: 10, color: "#94a3b8", background: "#1e293b", padding: "1px 5px", borderRadius: 3 }}>r={cs.borderRadius}px</span>}
                          {cs.titleFontSize && <span style={{ fontSize: 10, color: "#94a3b8", background: "#1e293b", padding: "1px 5px", borderRadius: 3 }}>title {cs.titleFontSize}px</span>}
                          {cs.metaFontSize && <span style={{ fontSize: 10, color: "#94a3b8", background: "#1e293b", padding: "1px 5px", borderRadius: 3 }}>meta {cs.metaFontSize}px</span>}
                          {cs.priceColor && (
                            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                              <div style={{ width: 12, height: 12, borderRadius: 2, background: cs.priceColor, border: "1px solid #334155" }} />
                              <span style={{ fontSize: 10, color: "#94a3b8" }}>price</span>
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 9, color: "#475569" }}>Fine-tune in Template Builder</span>
                      </div>
                    );
                  })()}

                  <button
                    onClick={() => deleteArea(selectedArea.id)}
                    style={{ padding: "5px 0", background: "rgba(220,38,38,0.15)", color: "#fca5a5", border: "1px solid #dc2626", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
                  >
                    Delete Region
                  </button>
                </div>
              )}

              {/* Confirm button */}
              <div style={{ padding: "12px 12px", borderTop: "1px solid #334155", flexShrink: 0 }}>
                <button
                  onClick={confirm}
                  style={{ width: "100%", padding: "8px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                >
                  Open in Template Builder
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
