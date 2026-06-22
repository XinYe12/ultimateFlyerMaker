import React, { useState, useRef, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { CustomBoxDef, CustomFlyerTemplateConfig, CustomTemplatePage, DepartmentAreaDef } from "./loadFlyerTemplateConfig";
import { saveCustomTemplate, saveCustomTemplateWithAssets } from "./customTemplateStorage";
import ImportTemplateFromImagesDialog from "./ImportTemplateFromImagesDialog";

const BUILDER_SCALE = 0.4;

const FONT_OPTIONS = [
  { label: "Default", value: "" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Bebas", value: '"Bebas Neue", Impact, sans-serif' },
  { label: "Oswald", value: "Oswald, sans-serif" },
  { label: "Anton", value: "Anton, Impact, sans-serif" },
  { label: "Impact", value: "Impact, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Barlow", value: '"Barlow Condensed", sans-serif' },
  { label: "Teko", value: "Teko, sans-serif" },
  { label: "Fjalla", value: '"Fjalla One", sans-serif' },
  { label: "Raleway", value: '"Raleway", sans-serif' },
  { label: "Nunito", value: '"Nunito", sans-serif' },
];
const ZH_FONT_OPTIONS = [
  { label: "默认 Default", value: "" },
  { label: "Source Han Sans 思源黑体", value: '"Source Han Sans", "Noto Sans SC", sans-serif' },
  { label: "PingFang SC 苹方",         value: '"PingFang SC", sans-serif' },
  { label: "Microsoft YaHei 微软雅黑", value: '"Microsoft YaHei", sans-serif' },
  { label: "SimHei 黑体",              value: "SimHei, sans-serif" },
  { label: "KaiTi 楷体",              value: "KaiTi, serif" },
  { label: "FangSong 仿宋",            value: "FangSong, serif" },
  { label: "SimSun 宋体",              value: "SimSun, serif" },
];

// Splits text into alternating CJK / non-CJK segments for mixed font rendering.
function splitByCJK(text: string): Array<{ text: string; isCJK: boolean }> {
  const segments: Array<{ text: string; isCJK: boolean }> = [];
  let buf = "";
  let lastWasCJK: boolean | null = null;
  for (const ch of text) {
    const isCJK = /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch);
    if (lastWasCJK !== null && isCJK !== lastWasCJK) {
      segments.push({ text: buf, isCJK: lastWasCJK });
      buf = "";
    }
    buf += ch;
    lastWasCJK = isCJK;
  }
  if (buf) segments.push({ text: buf, isCJK: lastWasCJK ?? false });
  return segments;
}

const SNAP_GRID = 10;
const MIN_BOX_SIZE = 100;

type DragState =
  | { type: "move"; boxId: string; startMouseX: number; startMouseY: number; startX: number; startY: number }
  | { type: "resize"; boxId: string; corner: "tl" | "tr" | "bl" | "br"; startMouseX: number; startMouseY: number; startX: number; startY: number; startW: number; startH: number };

type DeptAreaDragState =
  | { type: "move"; areaId: string; startMouseX: number; startMouseY: number; startX: number; startY: number }
  | { type: "resize"; areaId: string; corner: "tl" | "tr" | "bl" | "br"; startMouseX: number; startMouseY: number; startX: number; startY: number; startW: number; startH: number };

function snap(v: number): number {
  return Math.round(v / SNAP_GRID) * SNAP_GRID;
}

function imageUrl(p?: string): string | undefined {
  if (!p) return undefined;
  if (p.startsWith("data:") || p.startsWith("http://") || p.startsWith("https://")) return p;
  if (p.startsWith("file://")) return p;
  if (p.startsWith("/")) return p;
  return `file:///${p.replace(/\\/g, "/")}`;
}

const FIELD_KINDS = [
  "date_range", "store_name", "address", "footer", "decorative", "custom",
] as const;

function defaultPage(): CustomTemplatePage {
  return {
    pageId: uuidv4(),
    canvasWidth: 1650,
    canvasHeight: 2400,
    boxes: [],
    departmentAreas: [],
    backgroundColor: "#ffffff",
  };
}

type Props = {
  onSave: (templateId: string) => void;
  onClose: () => void;
  /** If provided, edit an existing template */
  initialConfig?: CustomFlyerTemplateConfig;
};

function expandSqueezedRegion(
  r: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; width: number; height: number } {
  const availableHeight = canvasHeight - r.y - 40;
  if (r.height >= availableHeight * 0.5) return r;
  return {
    ...r,
    width: Math.min(r.width, canvasWidth - r.x),
    height: availableHeight,
  };
}

function normalizePages(pages: CustomTemplatePage[]): CustomTemplatePage[] {
  return pages.map(p => ({
    ...p,
    departmentAreas: (p.departmentAreas ?? []).map(a => {
      const expanded = expandSqueezedRegion(a.productRegion, p.canvasWidth, p.canvasHeight);
      return {
        ...a,
        id: a.id ?? a.departmentKey,
        productRegion: expanded,
      };
    }),
  }));
}

export default function TemplateBuilder({ onSave, onClose, initialConfig }: Props) {
  const [templateName, setTemplateName] = useState(initialConfig?.name ?? "My Template");
  const [pages, setPages] = useState<CustomTemplatePage[]>(() =>
    normalizePages(initialConfig?.pages ?? [defaultPage()])
  );
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [selectedDeptAreaId, setSelectedDeptAreaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showReferenceOverlay, setShowReferenceOverlay] = useState(false);

  const dragRef = useRef<DragState | null>(null);
  const deptAreaDragRef = useRef<DeptAreaDragState | null>(null);
  const boxImageInputRef = useRef<HTMLInputElement>(null);

  type CropDragState = {
    boxId: string;
    side: 'left' | 'right' | 'top' | 'bottom';
    startX: number; startY: number;
    startValue: number;
    boxWidth: number; boxHeight: number;
  };
  const cropDragRef = useRef<CropDragState | null>(null);

  type TextDragState = {
    boxId: string;
    startMouseX: number; startMouseY: number;
    startOffsetX: number; startOffsetY: number;
  };
  const textDragRef = useRef<TextDragState | null>(null);

  const activePage = pages[activePageIdx] ?? pages[0];

  // Attach global mouse handlers for drag
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const dad = deptAreaDragRef.current;
      if (dad) {
        const dx = (e.clientX - dad.startMouseX) / BUILDER_SCALE;
        const dy = (e.clientY - dad.startMouseY) / BUILDER_SCALE;
        setPages(prev => prev.map((p, i) => {
          if (i !== activePageIdx) return p;
          const areas = p.departmentAreas ?? [];
          const idx = areas.findIndex(a => (a.id ?? a.departmentKey) === dad.areaId);
          if (idx < 0) return p;
          const d = areas[idx];
          const r = d.productRegion;
          if (dad.type === "move") {
            const newX = snap(Math.max(0, Math.min(dad.startX + dx, p.canvasWidth - r.width)));
            const newY = snap(Math.max(0, Math.min(dad.startY + dy, p.canvasHeight - r.height)));
            const updated = { ...d, productRegion: { ...r, x: newX, y: newY } };
            return { ...p, departmentAreas: [...areas.slice(0, idx), updated, ...areas.slice(idx + 1)] };
          } else {
            const sx = dad.startX, sy = dad.startY, sw = dad.startW, sh = dad.startH;
            let { x, y, width, height } = { x: sx, y: sy, width: sw, height: sh };
            if (dad.corner === "tl") {
              const newX = snap(Math.min(sx + dx, sx + sw - MIN_BOX_SIZE));
              const newY = snap(Math.min(sy + dy, sy + sh - MIN_BOX_SIZE));
              width = snap(Math.max(MIN_BOX_SIZE, width - (newX - sx)));
              height = snap(Math.max(MIN_BOX_SIZE, height - (newY - sy)));
              x = newX; y = newY;
            } else if (dad.corner === "tr") {
              const newY = snap(Math.min(sy + dy, sy + sh - MIN_BOX_SIZE));
              height = snap(Math.max(MIN_BOX_SIZE, height - (newY - sy)));
              width = snap(Math.max(MIN_BOX_SIZE, width + dx));
              y = newY;
            } else if (dad.corner === "bl") {
              const newX = snap(Math.min(sx + dx, sx + sw - MIN_BOX_SIZE));
              width = snap(Math.max(MIN_BOX_SIZE, width - (newX - sx)));
              height = snap(Math.max(MIN_BOX_SIZE, height + dy));
              x = newX;
            } else {
              width = snap(Math.max(MIN_BOX_SIZE, width + dx));
              height = snap(Math.max(MIN_BOX_SIZE, height + dy));
            }
            x = Math.max(0, x); y = Math.max(0, y);
            width = Math.min(width, p.canvasWidth - x);
            height = Math.min(height, p.canvasHeight - y);
            const updated = { ...d, productRegion: { x, y, width, height } };
            return { ...p, departmentAreas: [...areas.slice(0, idx), updated, ...areas.slice(idx + 1)] };
          }
        }));
        return;
      }

      const cd = cropDragRef.current;
      if (cd) {
        const dx = (e.clientX - cd.startX) / BUILDER_SCALE;
        const dy = (e.clientY - cd.startY) / BUILDER_SCALE;
        setPages(prev => prev.map((p, i) => {
          if (i !== activePageIdx) return p;
          return {
            ...p,
            boxes: p.boxes.map(b => {
              if (b.id !== cd.boxId) return b;
              const cropL = b.cropLeft ?? 0;
              const cropR = b.cropRight ?? 0;
              const cropT = b.cropTop ?? 0;
              const cropB = b.cropBottom ?? 0;
              if (cd.side === 'left') {
                const newVal = Math.max(0, Math.min(cd.startValue + dx, cd.boxWidth - cropR - 1));
                return { ...b, cropLeft: Math.round(newVal) };
              } else if (cd.side === 'right') {
                const newVal = Math.max(0, Math.min(cd.startValue - dx, cd.boxWidth - cropL - 1));
                return { ...b, cropRight: Math.round(newVal) };
              } else if (cd.side === 'top') {
                const newVal = Math.max(0, Math.min(cd.startValue + dy, cd.boxHeight - cropB - 1));
                return { ...b, cropTop: Math.round(newVal) };
              } else {
                const newVal = Math.max(0, Math.min(cd.startValue - dy, cd.boxHeight - cropT - 1));
                return { ...b, cropBottom: Math.round(newVal) };
              }
            }),
          };
        }));
        return;
      }

      const td = textDragRef.current;
      if (td) {
        const dx = (e.clientX - td.startMouseX) / BUILDER_SCALE;
        const dy = (e.clientY - td.startMouseY) / BUILDER_SCALE;
        setPages(prev => prev.map((p, i) => {
          if (i !== activePageIdx) return p;
          return {
            ...p,
            boxes: p.boxes.map(b => {
              if (b.id !== td.boxId) return b;
              return {
                ...b,
                textOffsetX: Math.round(td.startOffsetX + dx),
                textOffsetY: Math.round(td.startOffsetY + dy),
              };
            }),
          };
        }));
        return;
      }

      const d = dragRef.current;
      if (!d) return;

      const dx = (e.clientX - (d.type === "move" ? d.startMouseX : d.startMouseX)) / BUILDER_SCALE;
      const dy = (e.clientY - (d.type === "move" ? d.startMouseY : d.startMouseY)) / BUILDER_SCALE;

      setPages(prev => prev.map((p, i) => {
        if (i !== activePageIdx) return p;
        return {
          ...p,
          boxes: p.boxes.map(b => {
            if (b.id !== d.boxId) return b;
            if (d.type === "move") {
              const newX = snap(Math.max(0, Math.min(d.startX + dx, p.canvasWidth - b.width)));
              const newY = snap(Math.max(0, Math.min(d.startY + dy, p.canvasHeight - b.height)));
              return { ...b, x: newX, y: newY };
            } else {
              // resize
              let { x, y, width, height } = { x: d.startX, y: d.startY, width: d.startW, height: d.startH };
              if (d.corner === "tl") {
                const newX = snap(Math.min(x + dx, x + width - MIN_BOX_SIZE));
                const newY = snap(Math.min(y + dy, y + height - MIN_BOX_SIZE));
                width = snap(Math.max(MIN_BOX_SIZE, width - (newX - x)));
                height = snap(Math.max(MIN_BOX_SIZE, height - (newY - y)));
                x = newX; y = newY;
              } else if (d.corner === "tr") {
                const newY = snap(Math.min(y + dy, y + height - MIN_BOX_SIZE));
                height = snap(Math.max(MIN_BOX_SIZE, height - (newY - y)));
                width = snap(Math.max(MIN_BOX_SIZE, width + dx));
                y = newY;
              } else if (d.corner === "bl") {
                const newX = snap(Math.min(x + dx, x + width - MIN_BOX_SIZE));
                width = snap(Math.max(MIN_BOX_SIZE, width - (newX - x)));
                height = snap(Math.max(MIN_BOX_SIZE, height + dy));
                x = newX;
              } else {
                // br
                width = snap(Math.max(MIN_BOX_SIZE, width + dx));
                height = snap(Math.max(MIN_BOX_SIZE, height + dy));
              }
              // clamp to canvas
              x = Math.max(0, x); y = Math.max(0, y);
              width = Math.min(width, p.canvasWidth - x);
              height = Math.min(height, p.canvasHeight - y);
              return { ...b, x, y, width, height };
            }
          }),
        };
      }));
    };

    const onMouseUp = () => { dragRef.current = null; cropDragRef.current = null; deptAreaDragRef.current = null; textDragRef.current = null; };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Backspace") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (selectedBoxId) { e.preventDefault(); deleteBox(selectedBoxId); }
      else if (selectedDeptAreaId) { e.preventDefault(); deleteDepartmentArea(selectedDeptAreaId); }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activePageIdx, selectedBoxId, selectedDeptAreaId]);

  const updateBox = useCallback((boxId: string, patch: Partial<CustomBoxDef>) => {
    setPages(prev => prev.map((p, i) =>
      i !== activePageIdx ? p : {
        ...p,
        boxes: p.boxes.map(b => b.id === boxId ? { ...b, ...patch } : b),
      }
    ));
  }, [activePageIdx]);

  const updatePage = useCallback((patch: Partial<CustomTemplatePage>) => {
    setPages(prev => prev.map((p, i) =>
      i !== activePageIdx ? p : { ...p, ...patch }
    ));
  }, [activePageIdx]);

  const updateDepartmentArea = useCallback((areaId: string, patch: Partial<DepartmentAreaDef>) => {
    setPages(prev => prev.map((p, i) => {
      if (i !== activePageIdx) return p;
      const areas = p.departmentAreas ?? [];
      const idx = areas.findIndex(a => (a.id ?? a.departmentKey) === areaId);
      if (idx < 0) return p;
      const d = areas[idx];
      const updated = { ...d, ...patch };
      if (patch.productRegion) updated.productRegion = { ...d.productRegion, ...patch.productRegion };
      return { ...p, departmentAreas: [...areas.slice(0, idx), updated, ...areas.slice(idx + 1)] };
    }));
  }, [activePageIdx]);

  const addDepartment = () => {
    const areas = activePage.departmentAreas ?? [];
    const maxY = areas.length > 0
      ? Math.max(...areas.map(a => a.productRegion.y + a.productRegion.height))
      : 0;
    const y = Math.min(maxY + 20, activePage.canvasHeight - 300);
    const height = Math.max(300, activePage.canvasHeight - y - 40);
    const newArea: DepartmentAreaDef = {
      id: "dept_" + Date.now(),
      departmentKey: "dept_" + Date.now(),
      label: "New Department",
      rows: 2,
      productRegion: {
        x: 0,
        y,
        width: activePage.canvasWidth,
        height,
      },
    };
    setPages(prev => prev.map((p, i) =>
      i !== activePageIdx ? p : {
        ...p,
        departmentAreas: [...(p.departmentAreas ?? []), newArea],
      }
    ));
    setSelectedBoxId(null);
    setSelectedDeptAreaId(newArea.id ?? newArea.departmentKey);
  };

  const deleteDepartmentArea = (areaId: string) => {
    setPages(prev => prev.map((p, i) =>
      i !== activePageIdx ? p : {
        ...p,
        departmentAreas: (p.departmentAreas ?? []).filter(a => (a.id ?? a.departmentKey) !== areaId),
      }
    ));
    if (selectedDeptAreaId === areaId) setSelectedDeptAreaId(null);
  };

  const addBox = () => {
    const base = {
      id: uuidv4(),
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      cropLeft: 0,
      cropRight: 0,
      cropTop: 0,
      cropBottom: 0,
    };
    const newBox: CustomBoxDef = {
      ...base,
      label: "",
      departmentKey: "",
      color: "#3b82f6",
      textColor: "#ffffff",
      content: "",
      x: Math.max(0, Math.round((activePage.canvasWidth - 200) / 2)),
      y: 20,
      width: Math.min(200, activePage.canvasWidth),
      height: 80,
      rows: 0,
      textAlign: 'center',
      textVertical: 'middle',
      fontFamily: '',
      fontSize: 36,
    };
    setPages(prev => prev.map((p, i) =>
      i !== activePageIdx ? p : { ...p, boxes: [...p.boxes, newBox] }
    ));
    setSelectedBoxId(newBox.id);
    setSelectedDeptAreaId(null);
  };

  const deleteBox = (boxId: string) => {
    setPages(prev => prev.map((p, i) =>
      i !== activePageIdx ? p : { ...p, boxes: p.boxes.filter(b => b.id !== boxId) }
    ));
    if (selectedBoxId === boxId) setSelectedBoxId(null);
  };

  const addPage = () => {
    setPages(prev => [...prev, defaultPage()]);
    setActivePageIdx(pages.length);
  };

  const removePage = () => {
    if (pages.length <= 1) return;
    const newPages = pages.filter((_, i) => i !== activePageIdx);
    setPages(newPages);
    setActivePageIdx(Math.min(activePageIdx, newPages.length - 1));
  };

  const handleSave = async () => {
    setError(null);
    if (!templateName.trim()) { setError("Template name is required."); return; }

    for (const page of pages) {
      const areas = page.departmentAreas ?? [];
      if (areas.length > 0) {
        const labels = areas.map(a => a.label);
        const uniqueLabels = new Set(labels);
        if (labels.some(l => !l.trim())) { setError("All department areas must have a non-empty label."); return; }
        if (uniqueLabels.size !== labels.length) { setError("All department labels must be unique within a page."); return; }
      } else {
        const productBoxes = page.boxes.filter(b => !b.boxType || b.boxType === 'product');
        const keys = productBoxes.map(b => b.departmentKey);
        const uniqueKeys = new Set(keys);
        if (keys.some(k => !k.trim())) { setError("All product boxes must have a non-empty department key."); return; }
        if (uniqueKeys.size !== keys.length) { setError("All department keys must be unique within a page."); return; }
      }
    }

    const templateId = initialConfig?.templateId ?? "custom_" + Date.now();

    // Migrate: if page has product boxes but no departmentAreas, create them
    const migratedPages = pages.map(p => {
      const productBoxes = p.boxes.filter(b => !b.boxType || b.boxType === 'product');
      if (productBoxes.length > 0 && !(p.departmentAreas?.length)) {
        const departmentAreas = productBoxes.map(b => ({
          id: `dept_${b.id}`,
          departmentKey: b.departmentKey,
          label: b.label,
          rows: b.rows,
          productRegion: {
            x: b.x,
            y: b.y + b.height,
            width: Math.min(b.width, p.canvasWidth - b.x),
            height: Math.max(300, p.canvasHeight - (b.y + b.height) - 40),
          },
        }));
        return { ...p, departmentAreas };
      }
      return p;
    });

    const config: CustomFlyerTemplateConfig = {
      templateId,
      isCustom: true,
      name: templateName.trim(),
      pages: migratedPages,
    };
    try {
      await saveCustomTemplateWithAssets(config);
    } catch {
      saveCustomTemplate(config);
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const selectedBox = activePage.boxes.find(b => b.id === selectedBoxId) ?? null;
  const selectedDeptArea = (activePage.departmentAreas ?? []).find(a => (a.id ?? a.departmentKey) === selectedDeptAreaId) ?? null;

  const canvasScaledW = activePage.canvasWidth * BUILDER_SCALE;
  const canvasScaledH = activePage.canvasHeight * BUILDER_SCALE;

  const handleBoxMouseDown = (e: React.MouseEvent, boxId: string) => {
    e.stopPropagation();
    setSelectedBoxId(boxId);
    setSelectedDeptAreaId(null);
    const box = activePage.boxes.find(b => b.id === boxId);
    if (!box) return;
    dragRef.current = { type: "move", boxId, startMouseX: e.clientX, startMouseY: e.clientY, startX: box.x, startY: box.y };
  };

  const handleHandleMouseDown = (e: React.MouseEvent, boxId: string, corner: "tl" | "tr" | "bl" | "br") => {
    e.stopPropagation();
    e.preventDefault();
    const box = activePage.boxes.find(b => b.id === boxId);
    if (!box) return;
    dragRef.current = { type: "resize", boxId, corner, startMouseX: e.clientX, startMouseY: e.clientY, startX: box.x, startY: box.y, startW: box.width, startH: box.height };
  };

  const containerStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 10000,
    display: "flex", flexDirection: "column",
    background: "#f0f2f5",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 12,
    padding: "10px 16px",
    background: "#1e293b",
    color: "#fff",
    flexShrink: 0,
  };

  const bodyStyle: React.CSSProperties = {
    flex: 1, overflow: "hidden",
    display: "flex",
  };

  const canvasAreaStyle: React.CSSProperties = {
    flex: 1, overflow: "auto",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    padding: 0,
  };

  const panelStyle: React.CSSProperties = {
    width: 280, flexShrink: 0,
    background: "#fff",
    borderLeft: "1px solid #e2e8f0",
    padding: 16,
    overflowY: "auto",
  };

  const footerStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 12,
    padding: "8px 16px",
    background: "#fff",
    borderTop: "1px solid #e2e8f0",
    flexShrink: 0,
    flexWrap: "wrap",
  };

  const inputStyle: React.CSSProperties = {
    padding: "4px 8px", borderRadius: 4,
    border: "1px solid #cbd5e1", fontSize: 13,
    fontFamily: "var(--font-sans, sans-serif)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 2, display: "block",
  };

  const fieldStyle: React.CSSProperties = { marginBottom: 12 };

  return (
    <>
    <div style={containerStyle} onMouseDown={() => { setSelectedBoxId(null); setSelectedDeptAreaId(null); }}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8" }}>Template Name:</span>
        <input
          value={templateName}
          onChange={e => setTemplateName(e.target.value)}
          style={{ ...inputStyle, background: "#334155", border: "1px solid #475569", color: "#fff", width: 220 }}
          onMouseDown={e => e.stopPropagation()}
        />
        <div style={{ flex: 1 }} />
        {error && <span style={{ color: "#fca5a5", fontSize: 13 }}>{error}</span>}
        {saveSuccess && <span style={{ color: "#86efac", fontSize: 13, fontWeight: 600 }}>Saved!</span>}
        <button
          onClick={() => setShowImportDialog(true)}
          style={{ padding: "6px 16px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
        >
          Import from Images
        </button>
        <button
          onClick={handleSave}
          style={{ padding: "6px 20px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
        >
          Save
        </button>
        <button
          onClick={onClose}
          style={{ padding: "6px 14px", background: "#475569", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
        >
          Close
        </button>
      </div>

      {/* Body */}
      <div style={bodyStyle}>
        {/* Canvas area */}
        <div style={canvasAreaStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            {/* Add box / Add Department */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>Add:</span>
              <button
                onClick={e => { e.stopPropagation(); addDepartment(); }}
                style={{ padding: "6px 16px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
              >
                + Department Area
              </button>
              <span style={{ fontSize: 13, color: "#94a3b8" }}>|</span>
              <button
                onClick={e => { e.stopPropagation(); addBox(); }}
                style={{ padding: "6px 20px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
              >
                + Add Box
              </button>
            </div>

            {/* Page background */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>Page bg:</span>
              <input
                type="color"
                value={activePage.backgroundColor ?? "#ffffff"}
                onChange={e => updatePage({ backgroundColor: e.target.value })}
                style={{ width: 36, height: 28, cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 4 }}
                onMouseDown={e => e.stopPropagation()}
              />
              {activePage.sourceImagePath && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={showReferenceOverlay}
                    onChange={e => setShowReferenceOverlay(e.target.checked)}
                    onMouseDown={e => e.stopPropagation()}
                  />
                  Show reference
                </label>
              )}
            </div>

            {/* Canvas */}
            <div
              style={{
                width: canvasScaledW, height: canvasScaledH,
                background: activePage.backgroundImage
                  ? `url(${imageUrl(activePage.backgroundImage)}) center/cover`
                  : (activePage.backgroundColor ?? "#fff"),
                position: "relative",
                cursor: "default",
              }}
              onMouseDown={e => { e.stopPropagation(); setSelectedBoxId(null); setSelectedDeptAreaId(null); }}
            >
              {showReferenceOverlay && activePage.sourceImagePath && (
                <img
                  src={imageUrl(activePage.sourceImagePath)}
                  alt=""
                  style={{
                    position: "absolute", inset: 0, width: "100%", height: "100%",
                    objectFit: "cover", opacity: 0.3, pointerEvents: "none", userSelect: "none",
                  }}
                  draggable={false}
                />
              )}
              {/* Department areas (dashed rectangles) */}
              {(activePage.departmentAreas ?? []).map(area => {
                const areaId = area.id ?? area.departmentKey;
                const isSelected = areaId === selectedDeptAreaId;
                const r = area.productRegion;
                const handleSize = 10;
                return (
                  <div
                    key={areaId}
                    style={{
                      position: "absolute",
                      left: r.x * BUILDER_SCALE,
                      top: r.y * BUILDER_SCALE,
                      width: r.width * BUILDER_SCALE,
                      height: r.height * BUILDER_SCALE,
                      border: isSelected ? "2px solid #f59e0b" : "2px dashed #f59e0b",
                      background: "rgba(245, 158, 11, 0.08)",
                      boxSizing: "border-box",
                      cursor: "move",
                      userSelect: "none",
                    }}
                    onMouseDown={e => {
                      e.stopPropagation();
                      setSelectedDeptAreaId(areaId);
                      setSelectedBoxId(null);
                      deptAreaDragRef.current = { type: "move", areaId, startMouseX: e.clientX, startMouseY: e.clientY, startX: r.x, startY: r.y };
                    }}
                  >
                    <div style={{ position: "absolute", top: 4, left: 4, fontSize: 10, fontWeight: 600, color: "#b45309", pointerEvents: "none" }}>
                      {area.label || area.departmentKey}
                    </div>
                    {isSelected && (["tl", "tr", "bl", "br"] as const).map(corner => (
                      <div
                        key={corner}
                        style={{
                          position: "absolute",
                          width: handleSize,
                          height: handleSize,
                          background: "#f59e0b",
                          border: "1px solid #fff",
                          borderRadius: 2,
                          cursor: corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize",
                          zIndex: 10,
                          ...(corner === "tl" ? { left: -handleSize / 2, top: -handleSize / 2 } : {}),
                          ...(corner === "tr" ? { right: -handleSize / 2, top: -handleSize / 2 } : {}),
                          ...(corner === "bl" ? { left: -handleSize / 2, bottom: -handleSize / 2 } : {}),
                          ...(corner === "br" ? { right: -handleSize / 2, bottom: -handleSize / 2 } : {}),
                        }}
                        onMouseDown={e => {
                          e.stopPropagation();
                          e.preventDefault();
                          deptAreaDragRef.current = { type: "resize", areaId, corner, startMouseX: e.clientX, startMouseY: e.clientY, startX: r.x, startY: r.y, startW: r.width, startH: r.height };
                        }}
                      />
                    ))}
                  </div>
                );
              })}
              {activePage.boxes.map(box => {
                const isSelected = box.id === selectedBoxId;
                const handleSize = 10;
                return (
                  <div
                    key={box.id}
                    style={{
                      position: "absolute",
                      left: box.x * BUILDER_SCALE,
                      top: box.y * BUILDER_SCALE,
                      width: box.width * BUILDER_SCALE,
                      height: box.height * BUILDER_SCALE,
                      background: "transparent",
                      boxSizing: "border-box",
                      borderRadius: (box.borderRadius ?? 0) * BUILDER_SCALE,
                      border: box.borderWidth ? `${box.borderWidth * BUILDER_SCALE}px solid ${box.borderColor ?? "#000"}` : "none",
                      outline: isSelected ? "2px solid #3b82f6" : "none",
                      outlineOffset: isSelected ? -2 : 0,
                      overflow: "hidden",
                      cursor: "move",
                      userSelect: "none",
                    }}
                    onMouseDown={e => handleBoxMouseDown(e, box.id)}
                  >
                    {/* Clipped color fill (or image) */}
                    <div style={{
                      position: "absolute", inset: 0,
                      background: box.boxType === 'image' && box.imagePath
                        ? `url(${box.imagePath}) center/contain`
                        : box.color,
                      clipPath: `inset(${(box.cropTop ?? 0) * BUILDER_SCALE}px ${(box.cropRight ?? 0) * BUILDER_SCALE}px ${(box.cropBottom ?? 0) * BUILDER_SCALE}px ${(box.cropLeft ?? 0) * BUILDER_SCALE}px)`,
                    }} />
                    {box.boxType === 'image' && !box.imagePath && (
                      <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#94a3b8", fontSize: 10, pointerEvents: "none",
                      }}>
                        Image
                      </div>
                    )}

                    {/* Text / label content */}
                    {(!box.boxType || box.boxType === 'product' || box.boxType === 'text' || (box.boxType === 'image' && !box.imagePath)) && (() => {
                      const hasFreePos = box.textOffsetX != null || box.textOffsetY != null;
                      const textContent = box.content?.trim() ? box.content : (box.boxType === 'product' || !box.boxType) ? box.label : '';
                      const innerStyle: React.CSSProperties = {
                        padding: "4px 6px",
                        color: box.textColor,
                        fontWeight: box.boxType === 'text' ? 600 : 700,
                        fontSize: Math.max(8, (box.fontSize ?? 24) * BUILDER_SCALE),
                        lineHeight: 1.2,
                        textAlign: box.textAlign ?? 'left',
                        fontFamily: box.fontFamily || undefined,
                        userSelect: "none",
                        cursor: isSelected ? "grab" : "default",
                        whiteSpace: "pre-wrap",
                      };
                      if (hasFreePos) {
                        return (
                          <div
                            style={{
                              position: "absolute",
                              left: (box.textOffsetX ?? 0) * BUILDER_SCALE,
                              top: (box.textOffsetY ?? 0) * BUILDER_SCALE,
                              pointerEvents: isSelected ? "auto" : "none",
                            }}
                            onMouseDown={isSelected ? (e) => {
                              e.stopPropagation();
                              textDragRef.current = {
                                boxId: box.id,
                                startMouseX: e.clientX,
                                startMouseY: e.clientY,
                                startOffsetX: box.textOffsetX ?? 0,
                                startOffsetY: box.textOffsetY ?? 0,
                              };
                            } : undefined}
                          >
                            <div style={innerStyle}>{box.zhFontFamily ? splitByCJK(textContent).map((seg, i) => (
                              <span key={i} style={{ fontFamily: seg.isCJK ? box.zhFontFamily : (box.fontFamily || undefined), verticalAlign: 'middle', lineHeight: 1 }}>{seg.text}</span>
                            )) : textContent}</div>
                          </div>
                        );
                      }
                      return (
                        <div
                          style={{
                            position: "absolute", inset: 0,
                            display: "flex",
                            alignItems: box.textVertical === 'middle' ? 'center' : box.textVertical === 'bottom' ? 'flex-end' : 'flex-start',
                            justifyContent: box.textAlign === 'center' ? 'center' : box.textAlign === 'right' ? 'flex-end' : 'flex-start',
                            pointerEvents: isSelected ? "auto" : "none",
                            overflow: "hidden",
                          }}
                          onMouseDown={isSelected ? (e) => {
                            e.stopPropagation();
                            const boxEl = e.currentTarget;
                            const rect = boxEl.getBoundingClientRect();
                            // Compute where the text element is within the box and start dragging from there
                            const textEl = boxEl.firstElementChild as HTMLElement | null;
                            const tRect = textEl ? textEl.getBoundingClientRect() : rect;
                            const startOffsetX = Math.round((tRect.left - rect.left) / BUILDER_SCALE);
                            const startOffsetY = Math.round((tRect.top - rect.top) / BUILDER_SCALE);
                            textDragRef.current = {
                              boxId: box.id,
                              startMouseX: e.clientX,
                              startMouseY: e.clientY,
                              startOffsetX,
                              startOffsetY,
                            };
                          } : undefined}
                        >
                          <div style={innerStyle}>{box.zhFontFamily ? splitByCJK(textContent).map((seg, i) => (
                            <span key={i} style={{ fontFamily: seg.isCJK ? box.zhFontFamily : (box.fontFamily || undefined), verticalAlign: 'middle', lineHeight: 1 }}>{seg.text}</span>
                          )) : textContent}</div>
                        </div>
                      );
                    })()}

                    {/* Crop frame + resize handles (all inside the crop frame so corners follow the crop) */}
                    {isSelected && (() => {
                      const cL = (box.cropLeft  ?? 0) * BUILDER_SCALE;
                      const cR = (box.cropRight ?? 0) * BUILDER_SCALE;
                      const cT = (box.cropTop   ?? 0) * BUILDER_SCALE;
                      const cB = (box.cropBottom ?? 0) * BUILDER_SCALE;
                      const fw = box.width  * BUILDER_SCALE - cL - cR;
                      const fh = box.height * BUILDER_SCALE - cT - cB;
                      const EDGE = 6;
                      return (
                        <div style={{ position: 'absolute', left: cL, top: cT, width: fw, height: fh, zIndex: 8, pointerEvents: 'none' }}>
                          {/* Side crop handles */}
                          <div style={{ position: 'absolute', left: 0, top: 0, width: EDGE, height: '100%', borderLeft: '2px dashed #4C6EF5', cursor: 'ew-resize', zIndex: 9, pointerEvents: 'auto', boxSizing: 'border-box' }}
                            onMouseDown={e => { e.stopPropagation(); cropDragRef.current = { boxId: box.id, side: 'left', startX: e.clientX, startY: e.clientY, startValue: box.cropLeft ?? 0, boxWidth: box.width, boxHeight: box.height }; }} />
                          <div style={{ position: 'absolute', right: 0, top: 0, width: EDGE, height: '100%', borderRight: '2px dashed #4C6EF5', cursor: 'ew-resize', zIndex: 9, pointerEvents: 'auto', boxSizing: 'border-box' }}
                            onMouseDown={e => { e.stopPropagation(); cropDragRef.current = { boxId: box.id, side: 'right', startX: e.clientX, startY: e.clientY, startValue: box.cropRight ?? 0, boxWidth: box.width, boxHeight: box.height }; }} />
                          <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: EDGE, borderTop: '2px dashed #4C6EF5', cursor: 'ns-resize', zIndex: 9, pointerEvents: 'auto', boxSizing: 'border-box' }}
                            onMouseDown={e => { e.stopPropagation(); cropDragRef.current = { boxId: box.id, side: 'top', startX: e.clientX, startY: e.clientY, startValue: box.cropTop ?? 0, boxWidth: box.width, boxHeight: box.height }; }} />
                          <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: EDGE, borderBottom: '2px dashed #4C6EF5', cursor: 'ns-resize', zIndex: 9, pointerEvents: 'auto', boxSizing: 'border-box' }}
                            onMouseDown={e => { e.stopPropagation(); cropDragRef.current = { boxId: box.id, side: 'bottom', startX: e.clientX, startY: e.clientY, startValue: box.cropBottom ?? 0, boxWidth: box.width, boxHeight: box.height }; }} />
                          {/* Corner resize handles — inside crop frame so they follow the crop boundary */}
                          {(["tl", "tr", "bl", "br"] as const).map(corner => (
                            <div
                              key={corner}
                              style={{
                                position: "absolute",
                                width: handleSize, height: handleSize,
                                background: "#3b82f6",
                                border: "1px solid #fff",
                                borderRadius: 2,
                                cursor: corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize",
                                zIndex: 10,
                                pointerEvents: 'auto',
                                ...(corner === "tl" ? { left: -handleSize / 2, top: -handleSize / 2 } : {}),
                                ...(corner === "tr" ? { right: -handleSize / 2, top: -handleSize / 2 } : {}),
                                ...(corner === "bl" ? { left: -handleSize / 2, bottom: -handleSize / 2 } : {}),
                                ...(corner === "br" ? { right: -handleSize / 2, bottom: -handleSize / 2 } : {}),
                              }}
                              onMouseDown={e => handleHandleMouseDown(e, box.id, corner)}
                            />
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Properties panel */}
        <div style={panelStyle} onMouseDown={e => e.stopPropagation()}>
          {selectedDeptArea ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", marginBottom: 16 }}>Department Area</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12 }}>Where product cards are placed</div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Bind to Department Box</label>
                <select
                  value={selectedDeptArea.departmentKey}
                  onChange={e => {
                    const key = e.target.value;
                    const box = (activePage.boxes ?? []).find(b => b.departmentKey === key);
                    const displayName = (box?.content?.trim() || box?.label?.trim()) ?? key;
                    updateDepartmentArea(selectedDeptAreaId!, { departmentKey: key, label: displayName });
                  }}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                >
                  {(() => {
                    const linkedBoxes = (activePage.boxes ?? []).filter(b => b.departmentKey?.trim());
                    const keys = new Set(linkedBoxes.map(b => b.departmentKey));
                    const currentKey = selectedDeptArea.departmentKey;
                    return (
                      <>
                        {linkedBoxes.map(b => {
                          const name = b.content?.trim() || b.label?.trim() || b.departmentKey;
                          return (
                            <option key={b.id} value={b.departmentKey}>
                              {name} ({b.departmentKey})
                            </option>
                          );
                        })}
                        {linkedBoxes.length === 0 && (
                          <option value={currentKey}>Set a Department Link on a box first</option>
                        )}
                        {linkedBoxes.length > 0 && !keys.has(currentKey) && (
                          <option value={currentKey}>{currentKey} (orphaned)</option>
                        )}
                      </>
                    );
                  })()}
                </select>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Links this area to a department box (e.g. Grocery banner)</div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Label</label>
                <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={selectedDeptArea.label} onChange={e => updateDepartmentArea(selectedDeptAreaId!, { label: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Product Rows</label>
                  <input type="number" min={1} max={20} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={selectedDeptArea.rows} onChange={e => updateDepartmentArea(selectedDeptAreaId!, { rows: Math.max(1, parseInt(e.target.value) || 1) })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Columns</label>
                  <input type="number" min={1} max={12} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={(selectedDeptArea as any).cols ?? ""} placeholder="auto" onChange={e => updateDepartmentArea(selectedDeptAreaId!, { cols: e.target.value ? Math.max(1, parseInt(e.target.value) || 1) : undefined } as any)} />
                </div>
              </div>

              {/* Card Style */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, marginTop: 4 }}>Card Style</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Card BG</label>
                  <input type="color" value={(selectedDeptArea as any).cardStyle?.backgroundColor ?? "#ffffff"}
                    onChange={e => updateDepartmentArea(selectedDeptAreaId!, { cardStyle: { ...(selectedDeptArea as any).cardStyle, backgroundColor: e.target.value } } as any)}
                    style={{ width: "100%", height: 28, cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 4 }} onMouseDown={e => e.stopPropagation()} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Orientation</label>
                  <select value={(selectedDeptArea as any).cardStyle?.orientation ?? "vertical"}
                    onChange={e => updateDepartmentArea(selectedDeptAreaId!, { cardStyle: { ...(selectedDeptArea as any).cardStyle, orientation: e.target.value } } as any)}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}>
                    <option value="vertical">Vertical</option>
                    <option value="horizontal">Horizontal</option>
                    <option value="top">Top</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Corner Radius</label>
                  <input type="number" min={0} max={100} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={(selectedDeptArea as any).cardStyle?.borderRadius ?? 0}
                    onChange={e => updateDepartmentArea(selectedDeptAreaId!, { cardStyle: { ...(selectedDeptArea as any).cardStyle, borderRadius: parseInt(e.target.value) || 0 } } as any)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Border W</label>
                  <input type="number" min={0} max={20} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={(selectedDeptArea as any).cardStyle?.borderWidth ?? 0}
                    onChange={e => updateDepartmentArea(selectedDeptAreaId!, { cardStyle: { ...(selectedDeptArea as any).cardStyle, borderWidth: parseInt(e.target.value) || 0 } } as any)} />
                </div>
              </div>
              {((selectedDeptArea as any).cardStyle?.borderWidth ?? 0) > 0 && (
                <div style={fieldStyle}>
                  <label style={labelStyle}>Border Color</label>
                  <input type="color" value={(selectedDeptArea as any).cardStyle?.borderColor ?? "#e2e8f0"}
                    onChange={e => updateDepartmentArea(selectedDeptAreaId!, { cardStyle: { ...(selectedDeptArea as any).cardStyle, borderColor: e.target.value } } as any)}
                    style={{ width: 36, height: 28, cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 4 }} onMouseDown={e => e.stopPropagation()} />
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Title Color</label>
                  <input type="color" value={(selectedDeptArea as any).cardStyle?.titleColor ?? "#1e293b"}
                    onChange={e => updateDepartmentArea(selectedDeptAreaId!, { cardStyle: { ...(selectedDeptArea as any).cardStyle, titleColor: e.target.value } } as any)}
                    style={{ width: "100%", height: 28, cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 4 }} onMouseDown={e => e.stopPropagation()} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Price Color</label>
                  <input type="color" value={(selectedDeptArea as any).cardStyle?.priceColor ?? "#1e293b"}
                    onChange={e => updateDepartmentArea(selectedDeptAreaId!, { cardStyle: { ...(selectedDeptArea as any).cardStyle, priceColor: e.target.value } } as any)}
                    style={{ width: "100%", height: 28, cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 4 }} onMouseDown={e => e.stopPropagation()} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Title px</label>
                  <input type="number" min={6} max={300} placeholder="auto" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={(selectedDeptArea as any).cardStyle?.titleFontSize ?? ""}
                    onChange={e => updateDepartmentArea(selectedDeptAreaId!, { cardStyle: { ...(selectedDeptArea as any).cardStyle, titleFontSize: e.target.value ? parseInt(e.target.value) : undefined } } as any)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Meta px</label>
                  <input type="number" min={6} max={200} placeholder="auto" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={(selectedDeptArea as any).cardStyle?.metaFontSize ?? ""}
                    onChange={e => updateDepartmentArea(selectedDeptAreaId!, { cardStyle: { ...(selectedDeptArea as any).cardStyle, metaFontSize: e.target.value ? parseInt(e.target.value) : undefined } } as any)} />
                </div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Price Position</label>
                <select value={(selectedDeptArea as any).cardStyle?.pricePosition ?? "bottom-right"}
                  onChange={e => updateDepartmentArea(selectedDeptAreaId!, { cardStyle: { ...(selectedDeptArea as any).cardStyle, pricePosition: e.target.value } } as any)}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-center">Bottom Center</option>
                  <option value="right">Right</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>X</label>
                  <input type="number" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={selectedDeptArea.productRegion.x} onChange={e => updateDepartmentArea(selectedDeptAreaId!, { productRegion: { ...selectedDeptArea.productRegion, x: parseInt(e.target.value) || 0 } })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Y</label>
                  <input type="number" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={selectedDeptArea.productRegion.y} onChange={e => updateDepartmentArea(selectedDeptAreaId!, { productRegion: { ...selectedDeptArea.productRegion, y: parseInt(e.target.value) || 0 } })} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Width</label>
                  <input type="number" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={selectedDeptArea.productRegion.width} onChange={e => updateDepartmentArea(selectedDeptAreaId!, { productRegion: { ...selectedDeptArea.productRegion, width: Math.max(MIN_BOX_SIZE, parseInt(e.target.value) || MIN_BOX_SIZE) } })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Height</label>
                  <input type="number" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={selectedDeptArea.productRegion.height} onChange={e => updateDepartmentArea(selectedDeptAreaId!, { productRegion: { ...selectedDeptArea.productRegion, height: Math.max(MIN_BOX_SIZE, parseInt(e.target.value) || MIN_BOX_SIZE) } })} />
                </div>
              </div>
              <button onClick={() => deleteDepartmentArea(selectedDeptAreaId!)} style={{ width: "100%", padding: "7px 0", background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13, marginTop: 4 }}>
                Delete Department Area
              </button>
            </>
          ) : selectedBox ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", marginBottom: 16 }}>Box Properties</div>

              {/* Colors */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Background</label>
                  <input type="color" value={selectedBox.color === "transparent" ? "#ffffff" : selectedBox.color} onChange={e => updateBox(selectedBox.id, { color: e.target.value })} style={{ width: "100%", height: 32, cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 4 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Text Color</label>
                  <input type="color" value={selectedBox.textColor} onChange={e => updateBox(selectedBox.id, { textColor: e.target.value })} style={{ width: "100%", height: 32, cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 4 }} />
                </div>
              </div>

              {/* Text content */}
              <div style={fieldStyle}>
                <label style={labelStyle}>Text Content</label>
                {selectedBox.isEditable ? (
                  <textarea style={{ ...inputStyle, width: "100%", boxSizing: "border-box", minHeight: 60, resize: "vertical" }} value={selectedBox.content ?? ''} onChange={e => updateBox(selectedBox.id, { content: e.target.value })} placeholder="Leave empty for no text" />
                ) : (
                  <div style={{ ...inputStyle, width: "100%", boxSizing: "border-box", minHeight: 48, background: "#f1f5f9", color: "#64748b", fontSize: 12, lineHeight: 1.4 }}>
                    Fixed template element — embedded in the background image. This text is not editable when generating weekly flyers.
                  </div>
                )}
              </div>
              {selectedBox.isEditable && (
                <>
                  <div style={fieldStyle}>
                    <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={!!selectedBox.isEditable}
                        onChange={e => updateBox(selectedBox.id, { isEditable: e.target.checked })}
                      />
                      Editable field (user updates weekly)
                    </label>
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Field Kind</label>
                    <select
                      value={selectedBox.fieldKind ?? "date_range"}
                      onChange={e => updateBox(selectedBox.id, { fieldKind: e.target.value as CustomBoxDef["fieldKind"] })}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    >
                      <option value="date_range">date_range</option>
                      <option value="custom">custom</option>
                    </select>
                  </div>
                </>
              )}
              <div style={fieldStyle}>
                <label style={labelStyle}>Highlight Color</label>
                <input type="color" value={selectedBox.highlightColor ?? '#fbbf24'} onChange={e => updateBox(selectedBox.id, { highlightColor: e.target.value })} style={{ width: "100%", height: 28, cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 4 }} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Highlight Range (start, end chars)</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <input type="number" min={0} style={{ ...inputStyle, flex: 1 }} placeholder="Start" value={selectedBox.highlightRange?.start ?? ''} onChange={e => { const v = parseInt(e.target.value) || 0; updateBox(selectedBox.id, { highlightRange: { start: v, end: selectedBox.highlightRange?.end ?? v } }); }} />
                  <input type="number" min={0} style={{ ...inputStyle, flex: 1 }} placeholder="End" value={selectedBox.highlightRange?.end ?? ''} onChange={e => { const v = parseInt(e.target.value) || 0; updateBox(selectedBox.id, { highlightRange: { start: selectedBox.highlightRange?.start ?? 0, end: v } }); }} />
                </div>
              </div>

              {/* Image */}
              <div style={fieldStyle}>
                <label style={labelStyle}>Image</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => boxImageInputRef.current?.click()} style={{ flex: 1, padding: "6px 12px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer", color: "#475569" }}>
                    {selectedBox.imagePath ? "Change image" : "Choose image"}
                  </button>
                  {selectedBox.imagePath && (
                    <button type="button" onClick={() => updateBox(selectedBox.id, { imagePath: undefined })} style={{ padding: "6px 10px", border: "1px solid #fca5a5", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer", color: "#ef4444" }} title="Remove image">×</button>
                  )}
                </div>
                <input ref={boxImageInputRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => updateBox(selectedBox.id, { imagePath: r.result as string }); r.readAsDataURL(f); } e.target.value = ""; }} />
              </div>

              {/* Text position */}
              <div style={fieldStyle}>
                <label style={labelStyle}>Text Position</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, width: 96 }}>
                  {(['top', 'middle', 'bottom'] as const).map(v =>
                    (['left', 'center', 'right'] as const).map(h => {
                      const active = (selectedBox.textAlign ?? 'left') === h && (selectedBox.textVertical ?? 'top') === v;
                      return (
                        <button key={`${v}-${h}`} onClick={() => updateBox(selectedBox.id, { textAlign: h, textVertical: v })} style={{ width: 28, height: 28, border: "1px solid #cbd5e1", borderRadius: 4, cursor: "pointer", background: active ? "#3b82f6" : "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                          <div style={{ width: 14, height: 14, display: "flex", flexDirection: "column", alignItems: h === 'left' ? 'flex-start' : h === 'center' ? 'center' : 'flex-end', justifyContent: v === 'top' ? 'flex-start' : v === 'middle' ? 'center' : 'flex-end', gap: 2 }}>
                            <div style={{ width: 8, height: 2, borderRadius: 1, background: active ? "#fff" : "#94a3b8" }} />
                            <div style={{ width: 6, height: 2, borderRadius: 1, background: active ? "#fff" : "#94a3b8" }} />
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Font */}
              <div style={fieldStyle}>
                <label style={labelStyle}>Font (English)</label>
                <select value={selectedBox.fontFamily ?? ""} onChange={e => updateBox(selectedBox.id, { fontFamily: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}>
                  {FONT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value} style={{ fontFamily: opt.value || undefined }}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {/* Chinese Font */}
              <div style={fieldStyle}>
                <label style={labelStyle}>Font (Chinese)</label>
                <select value={selectedBox.zhFontFamily ?? ""} onChange={e => updateBox(selectedBox.id, { zhFontFamily: e.target.value || undefined })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}>
                  {ZH_FONT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value} style={{ fontFamily: opt.value || undefined }}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Font Size</label>
                <select
                  value={String(selectedBox.fontSize ?? 24)}
                  onChange={e => updateBox(selectedBox.id, { fontSize: parseInt(e.target.value) || 24 })}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                >
                  {(() => {
                    const sizes = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 120];
                    const current = selectedBox.fontSize ?? 24;
                    const opts = sizes.includes(current) ? sizes : [...sizes, current].sort((a, b) => a - b);
                    return opts.map(n => <option key={n} value={n}>{n}px</option>);
                  })()}
                </select>
              </div>

              {/* Size */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Width</label>
                  <input type="number" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={selectedBox.width} onChange={e => updateBox(selectedBox.id, { width: Math.max(20, parseInt(e.target.value) || MIN_BOX_SIZE) })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Height</label>
                  <input type="number" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={selectedBox.height} onChange={e => updateBox(selectedBox.id, { height: Math.max(20, parseInt(e.target.value) || MIN_BOX_SIZE) })} />
                </div>
              </div>

              {/* Border */}
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Border Radius (px)</label>
                <input type="number" min={0} step={1} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={selectedBox.borderRadius ?? 0} onChange={e => updateBox(selectedBox.id, { borderRadius: Math.max(0, parseInt(e.target.value) || 0) })} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Border</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="number" min={0} step={1} placeholder="Width px" style={{ ...inputStyle, flex: 1 }} value={selectedBox.borderWidth ?? 0} onChange={e => updateBox(selectedBox.id, { borderWidth: Math.max(0, parseInt(e.target.value) || 0) })} />
                  {(selectedBox.borderWidth ?? 0) > 0 && (
                    <input type="color" value={selectedBox.borderColor ?? "#000000"} onChange={e => updateBox(selectedBox.id, { borderColor: e.target.value })} style={{ width: 32, height: 28, border: "1px solid #cbd5e1", borderRadius: 4, cursor: "pointer", padding: 2, background: "none" }} title="Border color" />
                  )}
                </div>
              </div>

              {/* Department link */}
              <div style={{ marginBottom: 12, padding: "10px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                <label style={{ ...labelStyle, color: "#64748b" }}>Department Link (optional)</label>
                <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={selectedBox.departmentKey} onChange={e => updateBox(selectedBox.id, { departmentKey: e.target.value.toLowerCase().replace(/\s+/g, "_") })} placeholder="e.g. grocery" />
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Links this box to a department area for product placement.</div>
              </div>

              <button onClick={() => deleteBox(selectedBox.id)} style={{ width: "100%", padding: "7px 0", background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13, marginTop: 4 }}>
                Delete Box
              </button>
            </>
          ) : (
            <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", marginTop: 32 }}>
              Click a box or department area to edit
            </div>
          )}
        </div>
      </div>

      {/* Footer: page bar + canvas size */}
      <div style={footerStyle}>
        <span style={{ fontWeight: 600, fontSize: 13, color: "#475569" }}>Pages:</span>
        {pages.map((p, i) => (
          <button
            key={p.pageId}
            onClick={() => { setActivePageIdx(i); setSelectedBoxId(null); setSelectedDeptAreaId(null); }}
            style={{
              padding: "4px 14px", borderRadius: 6, border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: i === activePageIdx ? "#3b82f6" : "#e2e8f0",
              color: i === activePageIdx ? "#fff" : "#475569",
            }}
          >
            Page {i + 1}
          </button>
        ))}
        <button onClick={addPage} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", fontSize: 13, cursor: "pointer", color: "#475569" }}>+ Add Page</button>
        {pages.length > 1 && (
          <button onClick={removePage} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", fontSize: 13, cursor: "pointer", color: "#ef4444" }}>- Remove Page</button>
        )}

        <div style={{ width: 1, height: 20, background: "#e2e8f0", margin: "0 8px" }} />

        <span style={{ fontWeight: 600, fontSize: 13, color: "#475569" }}>Canvas:</span>
        <span style={{ fontSize: 13, color: "#475569" }}>W</span>
        <input
          type="number"
          style={{ ...inputStyle, width: 72 }}
          value={activePage.canvasWidth}
          onChange={e => {
            const v = Math.max(400, parseInt(e.target.value) || 400);
            setPages(prev => prev.map((p, i) => i === activePageIdx ? { ...p, canvasWidth: v } : p));
          }}
        />
        <span style={{ fontSize: 13, color: "#475569" }}>H</span>
        <input
          type="number"
          style={{ ...inputStyle, width: 72 }}
          value={activePage.canvasHeight}
          onChange={e => {
            const v = Math.max(400, parseInt(e.target.value) || 400);
            setPages(prev => prev.map((p, i) => i === activePageIdx ? { ...p, canvasHeight: v } : p));
          }}
        />
        <span style={{ fontSize: 11, color: "#94a3b8" }}>design pixels</span>
      </div>
    </div>

    {showImportDialog && (
      <ImportTemplateFromImagesDialog
        onParsed={config => {
          setTemplateName(config.name);
          setPages(normalizePages(config.pages));
          setActivePageIdx(0);
          setSelectedBoxId(null);
          setSelectedDeptAreaId(null);
          setShowImportDialog(false);
        }}
        onClose={() => setShowImportDialog(false)}
      />
    )}
    </>
  );
}
