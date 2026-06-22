import React, { useState, useRef, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  CardStyleDef,
  CustomBoxDef,
  CustomFlyerTemplateConfig,
  CustomTemplatePage,
  DepartmentAreaDef,
  RegionStyleDef,
} from "./loadFlyerTemplateConfig";
import { defaultRegionStyle } from "./importTemplateCanvasHelpers";
import { saveCustomTemplate, saveCustomTemplateWithAssets } from "./customTemplateStorage";
import {
  createSampleCell,
  automationGridCardsForArea,
  defaultCardStyle,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  SampleCellDef,
  withAutomationGridDefaults,
} from "./importWizardCellHelpers";
import ImportWizardCanvas from "./ImportWizardCanvas";
import {
  nextUnderprintPresetIdx,
  UNDERPRINT_OPACITY_CYCLE,
  WizardViewMode,
} from "./importWizardViewState";

type ElectronFile = File & { path: string };

const STANDARD_DEPT_KEYS = [
  "grocery", "meat", "produce", "frozen", "seafood",
  "hot_food", "dairy", "bakery", "sushi",
] as const;

const DEPT_LABELS: Record<string, string> = {
  grocery: "Grocery",
  meat: "Meat",
  produce: "Produce",
  frozen: "Frozen",
  seafood: "Seafood",
  hot_food: "Hot Food",
  dairy: "Dairy",
  bakery: "Bakery",
  sushi: "Sushi",
};

function deptLabel(key: string) {
  return DEPT_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Field kinds allowed for user-editable weekly fields in the import wizard. */
const EDITABLE_FIELD_KINDS = ["date_range", "custom"] as const;

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

function toFileUrl(p: string) {
  return `file:///${p.replace(/\\/g, "/")}`;
}

function probeImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({
      width: img.naturalWidth > 0 ? img.naturalWidth : 800,
      height: img.naturalHeight > 0 ? img.naturalHeight : 1000,
    });
    img.onerror = () => resolve({ width: 800, height: 1000 });
    img.src = toFileUrl(imagePath);
  });
}

type AreaDraft = DepartmentAreaDef & { id: string; sampleCell?: SampleCellDef };
type BoxDraft = CustomBoxDef;

type UploadPageConfig = {
  path: string;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
};

type PageDraft = {
  imgPath: string;
  fileUrl: string;
  underprintPath?: string;
  underprintUrl?: string;
  sourceImagePath?: string;
  canvasWidth: number;
  canvasHeight: number;
  areas: AreaDraft[];
  boxes: BoxDraft[];
  backgroundColor: string;
};

type AreaDragState =
  | { type: "move"; id: string; startMouseX: number; startMouseY: number; startX: number; startY: number }
  | { type: "resize"; id: string; corner: "tl" | "tr" | "bl" | "br"; startMouseX: number; startMouseY: number; startX: number; startY: number; startW: number; startH: number };

type BoxDragState =
  | { type: "move"; id: string; startMouseX: number; startMouseY: number; startX: number; startY: number }
  | { type: "resize"; id: string; corner: "tl" | "tr" | "bl" | "br"; startMouseX: number; startMouseY: number; startX: number; startY: number; startW: number; startH: number };

const SNAP = 10;
const MIN_SIZE = 80;
const SIDEBAR_WIDTH = 400;
const CANVAS_HANDLE_MARGIN = 7;

function snap(v: number) { return Math.round(v / SNAP) * SNAP; }

function formatIpcError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "Request failed");
  const match = raw.match(/Error invoking remote method '[^']+': (?:Error: )?(.+)/s);
  return match?.[1]?.trim() || raw;
}

type SampleCellDragState =
  | { type: "move"; areaId: string; startMouseX: number; startMouseY: number; startX: number; startY: number }
  | { type: "resize"; areaId: string; corner: "tl" | "tr" | "bl" | "br"; startMouseX: number; startMouseY: number; startX: number; startY: number; startW: number; startH: number };

type Step = "upload" | "regions" | "cellStyle" | "components";

type Props = {
  onParsed: (config: CustomFlyerTemplateConfig) => void;
  onClose: () => void;
  initialConfig?: CustomFlyerTemplateConfig;
};

const STEP_TITLES: Record<Step, string> = {
  upload: "Import Template from Images",
  regions: "Department Backgrounds",
  cellStyle: "Product Cell Style",
  components: "Editable Fields",
};

const EDIT_STEP_TITLES: Record<Step, string> = {
  ...STEP_TITLES,
  regions: "Edit Department Backgrounds",
  cellStyle: "Edit Product Cell Style",
  components: "Edit Editable Fields",
};

export default function ImportTemplateFromImagesDialog({ onParsed, onClose, initialConfig }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [parsedTemplateId, setParsedTemplateId] = useState<string>("");
  const [uploadPages, setUploadPages] = useState<UploadPageConfig[]>([]);

  const [pages, setPages] = useState<PageDraft[]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("Imported Template");
  const [outlineOnly, setOutlineOnly] = useState(true);
  const [viewMode, setViewMode] = useState<WizardViewMode>("overlay");
  const [underprintPresetIdx, setUnderprintPresetIdx] = useState(0);
  const [gridPreviewActive, setGridPreviewActive] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const areaDragRef = useRef<AreaDragState | null>(null);
  const boxDragRef = useRef<BoxDragState | null>(null);
  const sampleCellDragRef = useRef<SampleCellDragState | null>(null);
  const drawDragRef = useRef<{ startMouseX: number; startMouseY: number; startCanvasX: number; startCanvasY: number } | null>(null);
  const [liveDrawRect, setLiveDrawRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const liveDrawRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const stepRef = useRef(step);
  stepRef.current = step;
  const pageIdxRef = useRef(pageIdx);
  pageIdxRef.current = pageIdx;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const underprintDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridFingerprintRef = useRef<string | null>(null);
  const scheduleUnderprintRegenRef = useRef<(pageIndex?: number) => void>(() => {});

  const page = pages[pageIdx];
  const underprintPreset = UNDERPRINT_OPACITY_CYCLE[underprintPresetIdx] ?? UNDERPRINT_OPACITY_CYCLE[0];

  // ── Image upload ──────────────────────────────────────────────────────────

  const addFiles = (files: ElectronFile[]) => {
    if (loading) return;
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
    if (loading) return;
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files) as ElectronFile[]);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files) as ElectronFile[]);
  };

  const removeImage = (p: string) => {
    if (loading) return;
    setImagePaths(prev => prev.filter(x => x !== p));
  };

  useEffect(() => {
    if (!imagePaths.length) {
      setUploadPages([]);
      return;
    }
    let cancelled = false;
    void Promise.all(imagePaths.map(async (path) => {
      const dims = await probeImageDimensions(path);
      return { path, ...dims };
    })).then((probed) => {
      if (cancelled) return;
      setUploadPages(prev => {
        const byPath = new Map(prev.map(pg => [pg.path, pg]));
        return probed.map(pg => {
          const existing = byPath.get(pg.path);
          return {
            path: pg.path,
            canvasWidth: existing?.canvasWidth ?? pg.width,
            canvasHeight: existing?.canvasHeight ?? pg.height,
            backgroundColor: existing?.backgroundColor ?? "#ffffff",
          };
        });
      });
    });
    return () => { cancelled = true; };
  }, [imagePaths]);

  // ── Pre-populate from existing config (edit mode) ─────────────────────────

  useEffect(() => {
    if (!initialConfig) return;
    const drafts: PageDraft[] = initialConfig.pages.map(p => {
      const imgPath = p.sourceImagePath ?? p.backgroundImage ?? "";
      return {
        imgPath,
        fileUrl: imgPath ? toFileUrl(imgPath) : "",
        underprintPath: p.backgroundImage,
        underprintUrl: p.backgroundImage ? toFileUrl(p.backgroundImage) : undefined,
        sourceImagePath: p.sourceImagePath,
        canvasWidth: p.canvasWidth,
        canvasHeight: p.canvasHeight,
        backgroundColor: p.backgroundColor ?? "#ffffff",
        boxes: (p.boxes ?? []).map(b => ({ ...b, id: b.id ?? uuidv4() })),
        areas: (p.departmentAreas ?? []).map(a => {
          const departmentKey = a.departmentKey || a.label || "Region";
          // Reconstruct sampleCell from persisted gridLayout cell dims so step 2 shows "Sample cell ready"
          let sampleCell: SampleCellDef | undefined;
          if (a.cardStyle) {
            const tw = a.gridLayout?.targetCellWidth;
            const th = a.gridLayout?.targetCellHeight;
            if (tw && th) {
              const w = Math.max(48, tw);
              const h = Math.max(48, th);
              sampleCell = {
                x: Math.round(Math.max(0, (a.productRegion.width - w) / 2)),
                y: Math.round(Math.max(0, (a.productRegion.height - h) / 2)),
                width: w,
                height: h,
              };
            } else {
              sampleCell = createSampleCell(a.productRegion, v => Math.round(v / SNAP) * SNAP);
            }
          }
          return {
            ...a,
            id: a.id ?? uuidv4(),
            departmentKey,
            label: departmentKey,
            regionStyle: a.regionStyle ?? defaultRegionStyle(departmentKey),
            ...(sampleCell ? { sampleCell } : {}),
          } as AreaDraft;
        }),
      };
    });
    setPages(drafts);
    setPageIdx(0);
    setTemplateName(initialConfig.name ?? "Imported Template");
    setParsedTemplateId(initialConfig.templateId);
    setStep("regions");
  }, []); // intentionally runs once on mount

  // ── Load images (manual setup — no auto-detection) ────────────────────────

  const startWizard = async () => {
    if (!uploadPages.length || loading) return;
    setLoadError(null);
    const loadTemplate = window.ufm.loadTemplateFromImages;
    if (typeof loadTemplate !== "function") {
      setLoadError("Template import is unavailable. Quit the app completely and restart it (npm run dev) so Electron reloads.");
      return;
    }
    setLoading(true);
    try {
      const config: CustomFlyerTemplateConfig = await loadTemplate({ pages: uploadPages });
      setParsedTemplateId(config.templateId);

      const drafts: PageDraft[] = config.pages.map((p, i) => {
        const imgPath = uploadPages[i]?.path ?? imagePaths[i] ?? imagePaths[0];
        const underprintPath = p.backgroundImage;
        return {
          imgPath,
          fileUrl: toFileUrl(imgPath),
          underprintPath,
          underprintUrl: underprintPath ? toFileUrl(underprintPath) : undefined,
          sourceImagePath: (p as { sourceImagePath?: string }).sourceImagePath ?? imgPath,
          canvasWidth: p.canvasWidth,
          canvasHeight: p.canvasHeight,
          backgroundColor: p.backgroundColor ?? "#ffffff",
          boxes: [],
          areas: [],
        };
      });

      setPages(drafts);
      setPageIdx(0);
      setSelectedAreaId(null);
      setSelectedBoxId(null);
      setStep("regions");
    } catch (err: unknown) {
      setLoadError(formatIpcError(err));
    } finally {
      setLoading(false);
    }
  };

  const updateUploadPage = (path: string, patch: Partial<UploadPageConfig>) => {
    setUploadPages(prev => prev.map(pg => pg.path === path ? { ...pg, ...patch } : pg));
  };

  // ── Overlay scale ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!page || step === "upload") return;
    const updateScale = () => {
      const el = containerRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      const paneDivisor = viewMode === "sideBySide" ? 2 : 1;
      const paneGap = viewMode === "sideBySide" ? 12 : 0;
      const availW = (width - 32 - paneGap) / paneDivisor;
      const pad = 32 + CANVAS_HANDLE_MARGIN * 2;
      const s = Math.min(
        availW / page.canvasWidth,
        (height - pad) / page.canvasHeight,
        1
      );
      setScale(Math.max(0.1, s));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [step, page, pageIdx, viewMode]);

  // ── Area drag/resize (regions step) ─────────────────────────────────────

  const onAreaMouseMove = useCallback((e: MouseEvent) => {
    const d = areaDragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startMouseX) / scale;
    const dy = (e.clientY - d.startMouseY) / scale;

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
                x: snap(Math.max(0, Math.min(d.startX + dx, pg.canvasWidth - r.width))),
                y: snap(Math.max(0, Math.min(d.startY + dy, pg.canvasHeight - r.height))),
              },
            };
          }
          const { startX: sx, startY: sy, startW: sw, startH: sh } = d;
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
        }),
      };
    }));
  }, [scale, pageIdx]);

  // ── Box drag/resize (components step) ─────────────────────────────────────

  const onBoxMouseMove = useCallback((e: MouseEvent) => {
    const d = boxDragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startMouseX) / scale;
    const dy = (e.clientY - d.startMouseY) / scale;

    setPages(prev => prev.map((pg, i) => {
      if (i !== pageIdx) return pg;
      return {
        ...pg,
        boxes: pg.boxes.map(b => {
          if (b.id !== d.id) return b;
          if (d.type === "move") {
            return {
              ...b,
              x: snap(Math.max(0, Math.min(d.startX + dx, pg.canvasWidth - b.width))),
              y: snap(Math.max(0, Math.min(d.startY + dy, pg.canvasHeight - b.height))),
            };
          }
          const { startX: sx, startY: sy, startW: sw, startH: sh } = d;
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
          return { ...b, x, y, width, height };
        }),
      };
    }));
  }, [scale, pageIdx]);

  const onSampleCellMouseMove = useCallback((e: MouseEvent) => {
    const d = sampleCellDragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startMouseX) / scale;
    const dy = (e.clientY - d.startMouseY) / scale;

    setPages(prev => prev.map((pg, i) => {
      if (i !== pageIdx) return pg;
      return {
        ...pg,
        areas: pg.areas.map(a => {
          if (a.id !== d.areaId || !a.sampleCell) return a;
          const pr = a.productRegion;
          const cell = { ...a.sampleCell };
          if (d.type === "move") {
            cell.x = snap(Math.max(0, Math.min(d.startX + dx, pr.width - cell.width)));
            cell.y = snap(Math.max(0, Math.min(d.startY + dy, pr.height - cell.height)));
          } else {
            const { startX: sx, startY: sy, startW: sw, startH: sh } = d;
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
            x = Math.max(0, x);
            y = Math.max(0, y);
            width = Math.min(width, pr.width - x);
            height = Math.min(height, pr.height - y);
            cell.x = x;
            cell.y = y;
            cell.width = width;
            cell.height = height;
          }
          return { ...a, sampleCell: cell };
        }),
      };
    }));
  }, [scale, pageIdx]);

  // ── Area CRUD (declared before onMouseUp so it can be referenced as a dep) ──

  const addAreaFromRect = useCallback(({ x, y, width, height }: { x: number; y: number; width: number; height: number }) => {
    const pg = pagesRef.current[pageIdxRef.current];
    if (!pg) return;
    const id = uuidv4();
    const newArea: AreaDraft = {
      id,
      departmentKey: "grocery",
      label: "grocery",
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS,
      regionStyle: defaultRegionStyle("grocery"),
      productRegion: {
        x: snap(Math.max(0, x)),
        y: snap(Math.max(0, y)),
        width: snap(Math.min(width, pg.canvasWidth - Math.max(0, x))),
        height: snap(Math.min(height, pg.canvasHeight - Math.max(0, y))),
      },
    };
    setPages(prev => prev.map((p, i) =>
      i === pageIdxRef.current ? { ...p, areas: [...p.areas, newArea] } : p
    ));
    setSelectedAreaId(id);
  }, []);

  const handleRegionDrawStart = useCallback((e: React.MouseEvent, canvasX: number, canvasY: number) => {
    drawDragRef.current = { startMouseX: e.clientX, startMouseY: e.clientY, startCanvasX: canvasX, startCanvasY: canvasY };
    liveDrawRectRef.current = null;
    setLiveDrawRect(null);
  }, []);

  const onMouseUp = useCallback(() => {
    areaDragRef.current = null;
    boxDragRef.current = null;
    sampleCellDragRef.current = null;

    const draw = drawDragRef.current;
    if (draw) {
      drawDragRef.current = null;
      const rect = liveDrawRectRef.current;
      liveDrawRectRef.current = null;
      setLiveDrawRect(null);
      if (rect && rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) {
        addAreaFromRect(rect);
      }
    }
  }, [addAreaFromRect]);

  useEffect(() => {
    const moveHandler = (e: MouseEvent) => {
      if (sampleCellDragRef.current) onSampleCellMouseMove(e);
      else if (areaDragRef.current) onAreaMouseMove(e);
      else if (boxDragRef.current) onBoxMouseMove(e);
      else if (drawDragRef.current) {
        const d = drawDragRef.current;
        const sc = scaleRef.current;
        const pg = pagesRef.current[pageIdxRef.current];
        if (!pg) return;
        const endX = d.startCanvasX + (e.clientX - d.startMouseX) / sc;
        const endY = d.startCanvasY + (e.clientY - d.startMouseY) / sc;
        const x = Math.max(0, Math.min(d.startCanvasX, endX));
        const y = Math.max(0, Math.min(d.startCanvasY, endY));
        const width = Math.min(Math.abs(endX - d.startCanvasX), pg.canvasWidth - x);
        const height = Math.min(Math.abs(endY - d.startCanvasY), pg.canvasHeight - y);
        const rect = { x, y, width, height };
        liveDrawRectRef.current = rect;
        setLiveDrawRect(rect);
      }
    };
    window.addEventListener("mousemove", moveHandler);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", moveHandler);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onAreaMouseMove, onBoxMouseMove, onSampleCellMouseMove, onMouseUp]);

  const addArea = () => {
    if (!page) return;
    const id = uuidv4();
    const newArea: AreaDraft = {
      id,
      departmentKey: "grocery",
      label: "grocery",
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS,
      regionStyle: defaultRegionStyle("grocery"),
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
    let normalized: Partial<AreaDraft> = { ...patch };
    if (patch.departmentKey != null) {
      normalized = {
        ...normalized,
        label: patch.departmentKey,
        regionStyle: patch.regionStyle ?? defaultRegionStyle(patch.departmentKey),
      };
    }
    setPages(prev => prev.map((pg, i) =>
      i === pageIdx ? {
        ...pg,
        areas: pg.areas.map(a => a.id === id ? { ...a, ...normalized } : a),
      } : pg
    ));
  };

  const updateRegionStyle = (areaId: string, patch: Partial<RegionStyleDef>) => {
    setPages(prev => prev.map((pg, i) => {
      if (i !== pageIdx) return pg;
      return {
        ...pg,
        areas: pg.areas.map(a => a.id === areaId ? {
          ...a,
          regionStyle: { ...(a.regionStyle ?? defaultRegionStyle(a.departmentKey)), ...patch },
        } : a),
      };
    }));
  };

  const updateCardStyle = (areaId: string, patch: Partial<CardStyleDef>) => {
    setPages(prev => prev.map((pg, i) => {
      if (i !== pageIdx) return pg;
      return {
        ...pg,
        areas: pg.areas.map(a => a.id === areaId ? {
          ...a,
          cardStyle: { ...(a.cardStyle ?? defaultCardStyle()), ...patch },
        } : a),
      };
    }));
  };

  const createSampleCellForArea = (areaId: string) => {
    const area = page?.areas.find(a => a.id === areaId);
    if (!area) return;
    const sampleCell = createSampleCell(area.productRegion, snap);
    setPages(prev => prev.map((pg, i) => {
      if (i !== pageIdx) return pg;
      return {
        ...pg,
        areas: pg.areas.map(a => a.id === areaId ? {
          ...withAutomationGridDefaults(a),
          sampleCell,
          cardStyle: a.cardStyle ?? defaultCardStyle(),
        } as AreaDraft : a),
      };
    }));
    setSelectedAreaId(areaId);
  };

  const clearSampleCell = (areaId: string) => {
    setPages(prev => prev.map((pg, i) => {
      if (i !== pageIdx) return pg;
      return {
        ...pg,
        areas: pg.areas.map(a => a.id === areaId ? { ...a, sampleCell: undefined, cardStyle: undefined } : a),
      };
    }));
  };

  // ── Box CRUD ──────────────────────────────────────────────────────────────

  const addBox = () => {
    if (!page) return;
    const id = uuidv4();
    const newBox: BoxDraft = {
      id,
      label: "New Editable Field",
      departmentKey: "_header",
      color: "#334155",
      textColor: "#ffffff",
      x: snap(page.canvasWidth * 0.1),
      y: snap(page.canvasHeight * 0.05),
      width: snap(page.canvasWidth * 0.8),
      height: snap(80),
      rows: 1,
      boxType: "text",
      content: "Edit me",
      fontSize: 24,
      isEditable: true,
      fieldKind: "date_range",
    };
    setPages(prev => prev.map((pg, i) =>
      i === pageIdx ? { ...pg, boxes: [...pg.boxes, newBox] } : pg
    ));
    setSelectedBoxId(id);
  };

  const deleteBox = (id: string) => {
    setPages(prev => prev.map((pg, i) =>
      i === pageIdx ? { ...pg, boxes: pg.boxes.filter(b => b.id !== id) } : pg
    ));
    setSelectedBoxId(null);
  };

  const updateBox = (id: string, patch: Partial<BoxDraft>) => {
    setPages(prev => prev.map((pg, i) =>
      i === pageIdx ? {
        ...pg,
        boxes: pg.boxes.map(b => b.id === id ? { ...b, ...patch } : b),
      } : pg
    ));
  };

  const updateAreaRows = (areaId: string, rows: number) => {
    const nextRows = Math.max(1, Math.min(20, rows));
    setPages(prev => prev.map((pg, i) => {
      if (i !== pageIdx) return pg;
      return {
        ...pg,
        areas: pg.areas.map(a => {
          if (a.id !== areaId) return a;
          return { ...withAutomationGridDefaults(a), rows: nextRows, sampleCell: a.sampleCell } as AreaDraft;
        }),
      };
    }));
    if (gridPreviewActive) {
      scheduleUnderprintRegenRef.current(pageIdx);
    }
  };

  const syncAutomationGridForPage = useCallback((pageIndex: number) => {
    setPages(prev => prev.map((pg, i) => {
      if (i !== pageIndex) return pg;
      return {
        ...pg,
        areas: pg.areas.map(a => (a.cardStyle ? { ...withAutomationGridDefaults(a), sampleCell: a.sampleCell } : a) as AreaDraft),
      };
    }));
  }, []);

  const toggleGridPreview = async () => {
    const next = !gridPreviewActive;
    setGridPreviewActive(next);
    if (next) {
      await regenerateUnderprintForPage(pageIdx);
    }
  };

  const updatePage = (patch: Partial<PageDraft>) => {
    setPages(prev => prev.map((pg, i) =>
      i === pageIdx ? { ...pg, ...patch } : pg
    ));
  };

  const handleAreaDragStart = (
    e: React.MouseEvent,
    areaId: string,
    dragMode: "move" | "resize",
    corner?: "tl" | "tr" | "bl" | "br",
    region?: { x: number; y: number; width: number; height: number }
  ) => {
    if (!region) return;
    setSelectedAreaId(areaId);
    boxDragRef.current = null;
    if (dragMode === "move") {
      areaDragRef.current = {
        type: "move",
        id: areaId,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startX: region.x,
        startY: region.y,
      };
    } else if (corner) {
      areaDragRef.current = {
        type: "resize",
        id: areaId,
        corner,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startX: region.x,
        startY: region.y,
        startW: region.width,
        startH: region.height,
      };
    }
  };

  const handleSampleCellDragStart = (
    e: React.MouseEvent,
    areaId: string,
    dragMode: "move" | "resize",
    corner?: "tl" | "tr" | "bl" | "br",
    cell?: SampleCellDef
  ) => {
    if (!cell) return;
    setSelectedAreaId(areaId);
    areaDragRef.current = null;
    boxDragRef.current = null;
    if (dragMode === "move") {
      sampleCellDragRef.current = {
        type: "move",
        areaId,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startX: cell.x,
        startY: cell.y,
      };
    } else if (corner) {
      sampleCellDragRef.current = {
        type: "resize",
        areaId,
        corner,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startX: cell.x,
        startY: cell.y,
        startW: cell.width,
        startH: cell.height,
      };
    }
  };

  const handleBoxDragStart = (
    e: React.MouseEvent,
    boxId: string,
    dragMode: "move" | "resize",
    corner?: "tl" | "tr" | "bl" | "br",
    box?: { x: number; y: number; width: number; height: number }
  ) => {
    if (!box) return;
    setSelectedBoxId(boxId);
    areaDragRef.current = null;
    if (dragMode === "move") {
      boxDragRef.current = {
        type: "move",
        id: boxId,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startX: box.x,
        startY: box.y,
      };
    } else if (corner) {
      boxDragRef.current = {
        type: "resize",
        id: boxId,
        corner,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startX: box.x,
        startY: box.y,
        startW: box.width,
        startH: box.height,
      };
    }
  };

  // ── Regenerate underprint ───────────────────────────────────────────────────

  const regenerateUnderprintForPage = useCallback(async (pageIndex: number) => {
    const pg = pagesRef.current[pageIndex];
    if (!pg) return;
    setRegenerating(true);
    try {
      const outputPath = await (window as any).ufm.regenerateUnderprint({
        sourcePath: pg.imgPath,
        outputPath: pg.underprintPath,
        canvasWidth: pg.canvasWidth,
        canvasHeight: pg.canvasHeight,
        departmentAreas: pg.areas,
      });
      setPages(prev => prev.map((p, i) => i === pageIndex ? {
        ...p,
        underprintPath: outputPath,
        underprintUrl: toFileUrl(outputPath),
      } : p));
    } catch (err: any) {
      setLoadError(err?.message ?? "Failed to regenerate underprint");
    } finally {
      setRegenerating(false);
    }
  }, []);

  const regenerateAllUnderprints = useCallback(async () => {
    for (let i = 0; i < pagesRef.current.length; i++) {
      await regenerateUnderprintForPage(i);
    }
  }, [regenerateUnderprintForPage]);

  scheduleUnderprintRegenRef.current = (pageIndex?: number) => {
    if (!gridPreviewActive) return;
    const idx = pageIndex ?? pageIdxRef.current;
    if (underprintDebounceRef.current) clearTimeout(underprintDebounceRef.current);
    underprintDebounceRef.current = setTimeout(() => {
      void regenerateUnderprintForPage(idx);
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (underprintDebounceRef.current) clearTimeout(underprintDebounceRef.current);
    };
  }, []);

  // Debounced underprint regen when grid rows change during preview
  useEffect(() => {
    if (!gridPreviewActive || !page) {
      gridFingerprintRef.current = null;
      return;
    }

    const fp = JSON.stringify({
      bg: page.backgroundColor,
      areas: page.areas.map(a => ({
        pr: a.productRegion,
        rows: a.rows,
        cols: a.cols,
        cs: a.cardStyle,
      })),
    });

    if (gridFingerprintRef.current === null) {
      gridFingerprintRef.current = fp;
      return;
    }
    if (gridFingerprintRef.current !== fp) {
      gridFingerprintRef.current = fp;
      if (!areaDragRef.current) {
        scheduleUnderprintRegenRef.current(pageIdx);
      }
    }
  }, [gridPreviewActive, page, pageIdx]);

  useEffect(() => {
    if (step !== "cellStyle") {
      setGridPreviewActive(false);
    }
  }, [step]);

  // ── Confirm → build config ────────────────────────────────────────────────

  function buildConfigPages(): CustomTemplatePage[] {
    return pages.map((pg, pgIdx) => ({
      pageId: `p${pgIdx + 1}`,
      canvasWidth: pg.canvasWidth,
      canvasHeight: pg.canvasHeight,
      backgroundImage: pg.underprintPath,
      sourceImagePath: pg.sourceImagePath ?? pg.imgPath,
      backgroundColor: pg.backgroundColor,
      boxes: pg.boxes.filter(b => !!b.isEditable),
      departmentAreas: pg.areas.map(a => {
        const normalized = a.cardStyle ? withAutomationGridDefaults(a) : a;
        // Persist sampleCell dimensions so they can be restored on next edit
        const sc = (a as AreaDraft).sampleCell;
        const gridLayout = sc
          ? { ...(normalized.gridLayout ?? {}), targetCellWidth: sc.width, targetCellHeight: sc.height }
          : normalized.gridLayout;
        return {
          id: normalized.id,
          departmentKey: normalized.departmentKey,
          label: normalized.departmentKey,
          rows: normalized.rows,
          ...(normalized.cols != null ? { cols: normalized.cols } : {}),
          productRegion: normalized.productRegion,
          ...(normalized.regionStyle ? { regionStyle: normalized.regionStyle } : {}),
          ...(normalized.cardStyle ? { cardStyle: normalized.cardStyle } : {}),
          ...(gridLayout ? { gridLayout } : {}),
        };
      }),
    }));
  }

  const saveProgress = async () => {
    const tid = parsedTemplateId || `imported_${Date.now()}`;
    if (!parsedTemplateId) setParsedTemplateId(tid);
    const config: CustomFlyerTemplateConfig = {
      templateId: tid,
      isCustom: true,
      name: templateName,
      pages: buildConfigPages(),
    };
    try {
      await saveCustomTemplateWithAssets(config);
    } catch {
      saveCustomTemplate(config);
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const confirm = () => {
    onParsed({
      templateId: parsedTemplateId || `imported_${Date.now()}`,
      isCustom: true,
      name: templateName,
      pages: buildConfigPages(),
    });
  };

  const selectedArea = page?.areas.find(a => a.id === selectedAreaId) ?? null;
  const selectedBox = page?.boxes.find(b => b.id === selectedBoxId) ?? null;
  const editableBoxes = page?.boxes.filter(b => !!b.isEditable) ?? [];

  const wizardCanvasProps = page ? {
    page,
    step: step as "regions" | "cellStyle" | "components",
    scale,
    viewMode,
    underprintOpacity: underprintPreset.opacity,
    gridPreview: step === "cellStyle" && gridPreviewActive,
    selectedAreaId,
    selectedBoxId,
    editableBoxes,
    outlineOnly,
    deptColor,
    deptLabel,
    onSelectArea: setSelectedAreaId,
    onSelectBox: setSelectedBoxId,
    onAreaDragStart: handleAreaDragStart,
    onBoxDragStart: handleBoxDragStart,
    onSampleCellDragStart: handleSampleCellDragStart,
    onCanvasMouseDown: () => { setSelectedAreaId(null); setSelectedBoxId(null); },
    onRegionDrawStart: handleRegionDrawStart,
    drawRect: liveDrawRect,
  } : null;

  const segmentedBtn = (active: boolean): React.CSSProperties => ({
    padding: "4px 10px",
    border: "none",
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "#3b82f6" : "transparent",
    color: active ? "#fff" : "#94a3b8",
  });

  const showWizardSteps = step === "regions" || step === "cellStyle" || step === "components";

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        display: "flex", flexDirection: "column",
        background: "#1e293b", overflow: "hidden",
        fontFamily: "var(--font-sans, sans-serif)",
      }}
    >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid #334155", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#f8fafc" }}>
            {(initialConfig ? EDIT_STEP_TITLES : STEP_TITLES)[step]}
          </span>
          {showWizardSteps && (
            <>
              <span style={{ fontSize: 12, color: "#64748b" }}>|</span>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {step === "regions" ? "Step 1/3" : step === "cellStyle" ? "Step 2/3" : "Step 3/3"}
              </span>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Template name:</span>
              <input
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #475569", background: "#334155", color: "#fff", fontSize: 13, width: 200 }}
                onMouseDown={e => e.stopPropagation()}
              />
              <span style={{ fontSize: 12, color: "#64748b" }}>|</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#0f172a", borderRadius: 6, padding: 2, border: "1px solid #334155" }}>
                <button type="button" style={segmentedBtn(viewMode === "overlay")} onClick={() => setViewMode("overlay")}>
                  Overlay
                </button>
                <button type="button" style={segmentedBtn(viewMode === "sideBySide")} onClick={() => setViewMode("sideBySide")}>
                  Side by side
                </button>
              </div>
              {viewMode === "overlay" && step === "cellStyle" && gridPreviewActive && (
                <button
                  type="button"
                  onClick={() => setUnderprintPresetIdx(nextUnderprintPresetIdx(underprintPresetIdx))}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid #475569",
                    background: "#334155",
                    color: "#e2e8f0",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Underprint: {underprintPreset.label}
                </button>
              )}
            </>
          )}
          <div style={{ flex: 1 }} />
          {showWizardSteps && (
            <>
              {saveSuccess && <span style={{ color: "#86efac", fontSize: 13, fontWeight: 600 }}>Saved!</span>}
              <button
                onClick={saveProgress}
                style={{ padding: "4px 14px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >
                Save
              </button>
            </>
          )}
          <button
            onClick={onClose}
            style={{ padding: "4px 12px", background: "#475569", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
          >
            ← Back
          </button>
        </div>

        {/* Upload */}
        {step === "upload" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: 32, gap: 20, overflowY: "auto" }}>
            <div
              onDrop={onDrop}
              onDragOver={e => { if (loading) return; e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => { if (!loading) fileInputRef.current?.click(); }}
              style={{
                width: "100%", maxWidth: 560, minHeight: 140,
                border: `2px dashed ${dragOver && !loading ? "#3b82f6" : "#475569"}`,
                borderRadius: 10, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 8,
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.55 : 1,
                background: dragOver && !loading ? "rgba(59,130,246,0.08)" : "#0f172a",
              }}
            >
              <span style={{ fontSize: 32 }}>🖼</span>
              <span style={{ color: "#94a3b8", fontSize: 14 }}>
                Drag & drop flyer images here, or click to browse
              </span>
              <span style={{ color: "#64748b", fontSize: 12 }}>PNG / JPG / WEBP — one image per flyer page</span>
              <input ref={fileInputRef} type="file" accept="image/*" multiple disabled={loading} style={{ display: "none" }} onChange={onFileChange} />
            </div>

            {uploadPages.length > 0 && (
              <div style={{ width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Page canvas size</div>
                <p style={{ fontSize: 11, color: "#64748b", margin: 0, lineHeight: 1.45 }}>
                  Set the template canvas size for each page. Defaults match the image dimensions. You will draw regions and fields manually in the wizard.
                </p>
                {uploadPages.map((pg, i) => (
                  <div key={pg.path} style={{ border: "1px solid #334155", borderRadius: 8, padding: 12, background: "#0f172a" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                      <img src={toFileUrl(pg.path)} style={{ width: 72, height: 96, objectFit: "cover", borderRadius: 4, border: "1px solid #334155", flexShrink: 0 }} alt="" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: "#e2e8f0", marginBottom: 8 }}>Page {i + 1}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={{ fontSize: 10, color: "#64748b" }}>Canvas width (px)</span>
                            <input type="number" min={100} max={8000} value={pg.canvasWidth}
                              onChange={e => updateUploadPage(pg.path, { canvasWidth: Math.max(100, parseInt(e.target.value) || 100) })}
                              style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #475569", background: "#1e293b", color: "#f8fafc", fontSize: 12 }} />
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={{ fontSize: 10, color: "#64748b" }}>Canvas height (px)</span>
                            <input type="number" min={100} max={8000} value={pg.canvasHeight}
                              onChange={e => updateUploadPage(pg.path, { canvasHeight: Math.max(100, parseInt(e.target.value) || 100) })}
                              style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #475569", background: "#1e293b", color: "#f8fafc", fontSize: 12 }} />
                          </label>
                        </div>
                        <label style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8 }}>
                          <span style={{ fontSize: 10, color: "#64748b" }}>Page background</span>
                          <input type="color" value={pg.backgroundColor}
                            onChange={e => updateUploadPage(pg.path, { backgroundColor: e.target.value })}
                            style={{ width: "100%", height: 28, cursor: "pointer", border: "1px solid #475569", borderRadius: 4 }} />
                        </label>
                      </div>
                      {!loading && (
                        <button
                          onClick={() => removeImage(pg.path)}
                          style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18, padding: 0 }}
                        >×</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {loadError && (
              <div style={{ color: "#fca5a5", fontSize: 13, background: "rgba(220,38,38,0.1)", padding: "8px 16px", borderRadius: 6 }}>
                {loadError}
              </div>
            )}

            <button
              onClick={startWizard}
              disabled={uploadPages.length === 0 || loading}
              style={{
                padding: "10px 32px", background: uploadPages.length && !loading ? "#3b82f6" : "#334155",
                color: "#fff", border: "none", borderRadius: 8, fontWeight: 700,
                fontSize: 15, cursor: uploadPages.length && !loading ? "pointer" : "not-allowed",
              }}
            >
              {loading ? "Loading…" : "Continue to wizard"}
            </button>
          </div>
        )}

        {/* Wizard canvas steps */}
        {showWizardSteps && page && wizardCanvasProps && (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <div
              ref={containerRef}
              style={{ flex: 1, minHeight: 0, overflow: "auto", background: "#0f172a", position: "relative" }}
              onMouseDown={() => { setSelectedAreaId(null); setSelectedBoxId(null); }}
            >
              <div style={{ display: "flex", justifyContent: "center", padding: 16, minHeight: "min-content" }}>
              {viewMode === "overlay" ? (
                <ImportWizardCanvas {...wizardCanvasProps} mode="edit" />
              ) : (
                <div style={{ display: "flex", alignSelf: "stretch", width: "100%", gap: 12, padding: "0 12px", minHeight: "min-content" }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "stretch", minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                      Reference
                    </div>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <ImportWizardCanvas {...wizardCanvasProps} mode="reference" />
                    </div>
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "stretch", minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                      Edit template
                    </div>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <ImportWizardCanvas {...wizardCanvasProps} mode="edit" />
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>

            {/* Right panel */}
            <div style={{ width: SIDEBAR_WIDTH, flexShrink: 0, background: "#1e293b", borderLeft: "1px solid #334155", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Page nav */}
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => { setPageIdx(i => Math.max(0, i - 1)); setSelectedAreaId(null); setSelectedBoxId(null); }}
                  disabled={pageIdx === 0}
                  style={{ padding: "3px 8px", background: "#334155", border: "none", borderRadius: 4, color: pageIdx === 0 ? "#475569" : "#cbd5e1", cursor: pageIdx === 0 ? "not-allowed" : "pointer", fontSize: 14 }}
                >◀</button>
                <span style={{ flex: 1, textAlign: "center", fontSize: 12, color: "#94a3b8" }}>Page {pageIdx + 1} / {pages.length}</span>
                <button
                  onClick={() => { setPageIdx(i => Math.min(pages.length - 1, i + 1)); setSelectedAreaId(null); setSelectedBoxId(null); }}
                  disabled={pageIdx >= pages.length - 1}
                  style={{ padding: "3px 8px", background: "#334155", border: "none", borderRadius: 4, color: pageIdx >= pages.length - 1 ? "#475569" : "#cbd5e1", cursor: pageIdx >= pages.length - 1 ? "not-allowed" : "pointer", fontSize: 14 }}
                >▶</button>
              </div>

              {/* Regions step panel */}
              {step === "regions" && (
                <>
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid #334155", display: "flex", flexDirection: "column", gap: 8 }}>
                    <button onClick={addArea} style={{ width: "100%", padding: "6px 0", background: "#f59e0b", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                      + Add Region
                    </button>
                    <p style={{ fontSize: 10, color: "#64748b", margin: 0, lineHeight: 1.45 }}>
                      Place each department area on the canvas. It fills with a background color — this is the department background behind product cells.
                    </p>
                  </div>
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid #334155", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 10, color: "#64748b" }}>Canvas width</span>
                      <input type="number" min={100} max={8000} value={page.canvasWidth}
                        onChange={e => updatePage({ canvasWidth: Math.max(100, parseInt(e.target.value) || 100) })}
                        style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 12 }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 10, color: "#64748b" }}>Canvas height</span>
                      <input type="number" min={100} max={8000} value={page.canvasHeight}
                        onChange={e => updatePage({ canvasHeight: Math.max(100, parseInt(e.target.value) || 100) })}
                        style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 12 }} />
                    </label>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                    {page.areas.length === 0 && (
                      <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.45, padding: "8px 0" }}>
                        No regions yet. Draw directly on the flyer, or click Add Region.
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
                        <span style={{ fontSize: 12, color: "#e2e8f0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deptLabel(area.departmentKey)}</span>
                        <button onClick={e => { e.stopPropagation(); deleteArea(area.id); }} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                  {selectedArea && (
                    <div style={{ borderTop: "1px solid #334155", padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>Label</span>
                        <select
                          value={selectedArea.departmentKey}
                          onChange={e => updateArea(selectedArea.id, { departmentKey: e.target.value })}
                          style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 12 }}
                        >
                          {(STANDARD_DEPT_KEYS.includes(selectedArea.departmentKey as typeof STANDARD_DEPT_KEYS[number])
                            ? STANDARD_DEPT_KEYS
                            : [selectedArea.departmentKey, ...STANDARD_DEPT_KEYS]
                          ).map(k => (
                            <option key={k} value={k}>
                              {deptLabel(k)}{!STANDARD_DEPT_KEYS.includes(k as typeof STANDARD_DEPT_KEYS[number]) ? " (legacy)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>Background</span>
                        <input type="color" value={selectedArea.regionStyle?.backgroundColor ?? defaultRegionStyle(selectedArea.departmentKey).backgroundColor ?? "#f1f5f9"}
                          onChange={e => updateRegionStyle(selectedArea.id, { backgroundColor: e.target.value })}
                          style={{ width: "100%", height: 28, cursor: "pointer", border: "1px solid #475569", borderRadius: 4 }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>Corner radius (px)</span>
                        <input type="number" min={0} max={100} value={selectedArea.regionStyle?.borderRadius ?? 0}
                          onChange={e => updateRegionStyle(selectedArea.id, { borderRadius: Math.max(0, parseInt(e.target.value) || 0) })}
                          style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 12 }} />
                      </label>
                    </div>
                  )}
                  <div style={{ padding: "12px", borderTop: "1px solid #334155" }}>
                    <button onClick={() => { setSelectedAreaId(null); setStep("cellStyle"); }}
                      style={{ width: "100%", padding: "8px 0", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                      Next: Cell Style →
                    </button>
                  </div>
                </>
              )}

              {/* Step 2 — Cell style */}
              {step === "cellStyle" && (
                <>
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid #334155" }}>
                    <p style={{ fontSize: 10, color: "#64748b", margin: 0, lineHeight: 1.45 }}>
                      Department backgrounds are locked. Select a department, create a sample cell, then style it.
                    </p>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                    {page.areas.map(area => (
                      <div
                        key={area.id}
                        onClick={() => setSelectedAreaId(area.id)}
                        style={{
                          padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                          background: area.id === selectedAreaId ? "#334155" : "transparent",
                          border: `1px solid ${area.id === selectedAreaId ? deptColor(area.departmentKey) : "#334155"}`,
                        }}
                      >
                        <span style={{ fontSize: 12, color: "#e2e8f0" }}>{deptLabel(area.departmentKey)}</span>
                        <div style={{ fontSize: 10, color: "#64748b" }}>
                          {area.sampleCell ? "Sample cell ready" : "No cell yet"}
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedArea && (() => {
                    const cs: CardStyleDef = selectedArea.cardStyle ?? defaultCardStyle();
                    return (
                      <div style={{ borderTop: "1px solid #334155", padding: "14px", display: "flex", flexDirection: "column", gap: 10, flex: "1 1 50%", minHeight: 0, overflowY: "auto" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
                          Sample Cell — {deptLabel(selectedArea.departmentKey)}
                        </div>
                        {!selectedArea.sampleCell ? (
                          <button
                            type="button"
                            onClick={() => createSampleCellForArea(selectedArea.id)}
                            style={{ padding: "10px 0", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                          >
                            + Create Sample Cell
                          </button>
                        ) : (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>Appearance</div>
                            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              <span style={{ fontSize: 11, color: "#64748b" }}>Fill color</span>
                              <input type="color" value={cs.backgroundColor ?? "#ffffff"}
                                onChange={e => updateCardStyle(selectedArea.id, { backgroundColor: e.target.value })}
                                style={{ width: "100%", height: 28, cursor: "pointer", border: "1px solid #475569", borderRadius: 4 }} />
                            </label>
                            <div style={{ display: "flex", gap: 6 }}>
                              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                                <span style={{ fontSize: 11, color: "#64748b" }}>Border width</span>
                                <input type="number" min={0} max={20} value={cs.borderWidth ?? 0}
                                  onChange={e => updateCardStyle(selectedArea.id, { borderWidth: parseInt(e.target.value) || 0 })}
                                  style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 12 }} />
                              </label>
                              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                                <span style={{ fontSize: 11, color: "#64748b" }}>Corner radius</span>
                                <input type="number" min={0} max={100} value={cs.borderRadius ?? 0}
                                  onChange={e => updateCardStyle(selectedArea.id, { borderRadius: parseInt(e.target.value) || 0 })}
                                  style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 12 }} />
                              </label>
                            </div>
                            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              <span style={{ fontSize: 11, color: "#64748b" }}>Border color</span>
                              <input type="color" value={cs.borderColor ?? "#cbd5e1"}
                                onChange={e => updateCardStyle(selectedArea.id, { borderColor: e.target.value })}
                                style={{ width: "100%", height: 28, cursor: "pointer", border: "1px solid #475569", borderRadius: 4 }} />
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#cbd5e1", cursor: "pointer" }}>
                              <input type="checkbox" checked={!!cs.hasShadow}
                                onChange={e => updateCardStyle(selectedArea.id, { hasShadow: e.target.checked })} />
                              Drop shadow
                            </label>
                            <button type="button" onClick={() => clearSampleCell(selectedArea.id)}
                              style={{ padding: "6px 0", background: "rgba(220,38,38,0.12)", color: "#fca5a5", border: "1px solid #dc2626", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                              Remove sample cell
                            </button>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginTop: 4 }}>
                              Product grid
                            </div>
                            <p style={{ fontSize: 10, color: "#64748b", margin: 0, lineHeight: 1.45 }}>
                              Same layout as flyer automation — {DEFAULT_COLS} products per row baseline. Adjust rows to fit your department size.
                            </p>
                            {(() => {
                              const rows = selectedArea.rows ?? DEFAULT_ROWS;
                              const slotCount = automationGridCardsForArea(selectedArea).cards.length;
                              return (
                                <>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ fontSize: 11, color: "#64748b", flex: 1 }}>Rows</span>
                                    <button type="button" disabled={rows <= 1}
                                      onClick={() => updateAreaRows(selectedArea.id, rows - 1)}
                                      style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #475569", background: "#0f172a", color: "#e2e8f0", cursor: rows <= 1 ? "not-allowed" : "pointer", fontSize: 16, fontWeight: 700 }}>
                                      −
                                    </button>
                                    <span style={{ fontSize: 13, color: "#f8fafc", fontWeight: 700, minWidth: 24, textAlign: "center" }}>{rows}</span>
                                    <button type="button" disabled={rows >= 20}
                                      onClick={() => updateAreaRows(selectedArea.id, rows + 1)}
                                      style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #475569", background: "#0f172a", color: "#e2e8f0", cursor: rows >= 20 ? "not-allowed" : "pointer", fontSize: 16, fontWeight: 700 }}>
                                      +
                                    </button>
                                  </div>
                                  <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>
                                    {slotCount} product slots ({rows} rows × {DEFAULT_COLS} cols)
                                  </p>
                                  <button
                                    type="button"
                                    disabled={regenerating}
                                    onClick={() => void toggleGridPreview()}
                                    style={{
                                      padding: "8px 0",
                                      background: gridPreviewActive ? "#334155" : "#7c3aed",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: 6,
                                      cursor: regenerating ? "wait" : "pointer",
                                      fontSize: 13,
                                      fontWeight: 700,
                                    }}
                                  >
                                    {regenerating ? "Loading preview…" : gridPreviewActive ? "Exit Grid Preview" : "Preview Product Grid"}
                                  </button>
                                </>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    );
                  })()}
                  <div style={{ padding: "12px", borderTop: "1px solid #334155", display: "flex", flexDirection: "column", gap: 8 }}>
                    <button onClick={() => { setGridPreviewActive(false); setStep("regions"); }} style={{ padding: "6px 0", background: "#334155", color: "#cbd5e1", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                      ← Back
                    </button>
                    <button
                      onClick={() => { setGridPreviewActive(false); setSelectedAreaId(null); setStep("components"); }}
                      disabled={!page.areas.some(a => a.sampleCell && a.cardStyle)}
                      style={{ padding: "8px 0", background: page.areas.some(a => a.sampleCell && a.cardStyle) ? "#3b82f6" : "#334155", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: page.areas.some(a => a.sampleCell && a.cardStyle) ? "pointer" : "not-allowed" }}
                    >
                      Next: Editable Fields →
                    </button>
                  </div>
                </>
              )}

              {/* Step 3 — Editable fields */}
              {step === "components" && (
                <>
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid #334155", display: "flex", flexDirection: "column", gap: 8 }}>
                    <button onClick={addBox} style={{ width: "100%", padding: "8px 0", background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                      + Add Editable Field
                    </button>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#cbd5e1", cursor: "pointer" }}>
                      <input type="checkbox" checked={outlineOnly} onChange={e => setOutlineOnly(e.target.checked)} />
                      Outline-only mode (align against flyer)
                    </label>
                    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
                      Add editable fields (valid dates, promo lines) and position them on the canvas.
                    </div>
                  </div>
                  <div style={{ flex: "1 1 35%", minHeight: 120, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6, borderBottom: selectedBox ? "1px solid #334155" : undefined }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Editable Fields ({editableBoxes.length})
                    </div>
                    {editableBoxes.length === 0 && (
                      <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.45, padding: "8px 0" }}>
                        No editable fields yet. Add a valid-date or promo field, or continue if this page has none.
                      </div>
                    )}
                    {editableBoxes.map(box => (
                      <div
                        key={box.id}
                        onClick={() => setSelectedBoxId(box.id)}
                        style={{
                          padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                          background: box.id === selectedBoxId ? "#334155" : "#0f172a",
                          border: `1px solid ${box.id === selectedBoxId ? "#3b82f6" : "#334155"}`,
                        }}
                      >
                        <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>{box.label}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, lineHeight: 1.35, maxHeight: 36, overflow: "hidden" }}>
                          {(box.content ?? "").slice(0, 80)}{(box.content ?? "").length > 80 ? "…" : ""}
                        </div>
                        {box.isEditable && <span style={{ fontSize: 10, color: "#f59e0b", marginTop: 4, display: "inline-block" }}>{box.fieldKind ?? "custom"}</span>}
                      </div>
                    ))}
                  </div>
                  {selectedBox && (
                    <div style={{ flex: "1 1 45%", minHeight: 0, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>Edit Field</div>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>Label</span>
                        <input value={selectedBox.label} onChange={e => updateBox(selectedBox.id, { label: e.target.value })}
                          style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 13 }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>Content</span>
                        <textarea value={selectedBox.content ?? ""} onChange={e => updateBox(selectedBox.id, { content: e.target.value })}
                          rows={3} style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 13, resize: "vertical", lineHeight: 1.35 }} />
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 11, color: "#64748b" }}>Font px</span>
                          <input type="number" min={8} max={200} value={selectedBox.fontSize ?? 24}
                            onChange={e => updateBox(selectedBox.id, { fontSize: parseInt(e.target.value) || 24 })}
                            style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 13 }} />
                        </label>
                        <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 11, color: "#64748b" }}>Text align</span>
                          <select value={selectedBox.textAlign ?? "left"} onChange={e => updateBox(selectedBox.id, { textAlign: e.target.value as CustomBoxDef["textAlign"] })}
                            style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 13 }}>
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </label>
                      </div>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>Vertical align</span>
                        <select value={selectedBox.textVertical ?? "middle"} onChange={e => updateBox(selectedBox.id, { textVertical: e.target.value as CustomBoxDef["textVertical"] })}
                          style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 13 }}>
                          <option value="top">Top</option>
                          <option value="middle">Middle</option>
                          <option value="bottom">Bottom</option>
                        </select>
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 11, color: "#64748b" }}>BG color</span>
                          <input type="color" value={selectedBox.color === "transparent" ? "#ffffff" : selectedBox.color}
                            onChange={e => updateBox(selectedBox.id, { color: e.target.value })}
                            style={{ width: "100%", height: 32, cursor: "pointer", border: "1px solid #475569", borderRadius: 4 }} />
                        </label>
                        <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 11, color: "#64748b" }}>Text color</span>
                          <input type="color" value={selectedBox.textColor}
                            onChange={e => updateBox(selectedBox.id, { textColor: e.target.value })}
                            style={{ width: "100%", height: 32, cursor: "pointer", border: "1px solid #475569", borderRadius: 4 }} />
                        </label>
                      </div>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>Field Kind</span>
                        <select value={selectedBox.fieldKind ?? "date_range"} onChange={e => updateBox(selectedBox.id, { fieldKind: e.target.value as BoxDraft["fieldKind"] })}
                          style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontSize: 13 }}>
                          {EDITABLE_FIELD_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </label>
                      <button onClick={() => deleteBox(selectedBox.id)}
                        style={{ padding: "7px 0", background: "rgba(220,38,38,0.15)", color: "#fca5a5", border: "1px solid #dc2626", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                        Delete Field
                      </button>
                    </div>
                  )}
                  <div style={{ padding: "12px 14px", borderTop: "1px solid #334155", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setStep("cellStyle")} style={{ padding: "7px 0", background: "#334155", color: "#cbd5e1", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                      ← Back
                    </button>
                    <button
                      onClick={async () => {
                        if (pages.some(pg => pg.areas.length === 0)) {
                          alert("Add at least one department region on every page before saving.");
                          return;
                        }
                        await regenerateAllUnderprints();
                        confirm();
                      }}
                      disabled={regenerating}
                      style={{ padding: "8px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: regenerating ? "wait" : "pointer" }}
                    >
                      Open in Template Builder
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
