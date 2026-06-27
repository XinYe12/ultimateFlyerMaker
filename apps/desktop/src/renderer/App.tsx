// apps/desktop/src/renderer/App.tsx

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";

import "./App.css";
import DraftSavedToast from "./components/DraftSavedToast";
import EditorHeader from "./components/EditorHeader";
import EditorAutomationBlocker from "./components/EditorAutomationBlocker";
import ErrorBoundary from "./components/ErrorBoundary";
import RecoveryOverlay from "./components/RecoveryOverlay";

import EditorSidebar from "./editor/EditorSidebar";
import EditorLeftPanel, { type LeftPanelTab } from "./editor/EditorLeftPanel";
import { PanelImageItem } from "./editor/ProjectImagePanel";
import AddProductDialog, { AddProductData } from "./editor/AddProductDialog";

import { useIngestQueue } from "./useIngestQueue";
import { useJobQueue } from "./hooks/useJobQueue";
import { IngestItem, FlyerJob, DepartmentId, CardLayout, CardDef, ReplacementJob, AddProductFormMeta } from "./types";
import EditorCanvas from "./editor/EditorCanvas";
import DbSearchModal from "./editor/DbSearchModal";
import GoogleSearchModal from "./editor/GoogleSearchModal";
import DiscountDetailsDialog from "./editor/DiscountDetailsDialog";
import DaysBannerEditDialog from "./editor/DaysBannerEditDialog";
import SeriesFlavorPicker from "./editor/SeriesFlavorPicker";
import CheckingPanel from "./editor/CheckingPanel";
import { autoLayoutCards } from "../../../shared/flyer/layout/autoLayoutCards";
import { loadFlyerTemplateConfig, isCardDepartment, findPageForDepartment, CustomFlyerTemplateConfig, type FlyerTemplateConfig } from "./editor/loadFlyerTemplateConfig";
import { clearDepartmentDraft } from "./editor/draftStorage";
import { CARD_GAP } from "../../../shared/flyer/layout/layoutCardRows";
import JobQueueView from "./jobs/JobQueueView";
import DbUploadView from "./db-upload/DbUploadView";
import TemplateSelectView from "./editor/TemplateSelectView";
import ImportTemplateFromImagesDialog from "./editor/ImportTemplateFromImagesDialog";
import { saveCustomTemplate, saveCustomTemplateWithAssets, upgradeTemplateUnderprintsIfNeeded } from "./editor/customTemplateStorage";
import { applySnapshotToQueue } from "./editor/editorHistory";
import { useEditorHistory } from "./editor/useEditorHistory";
import { reconcileCardLayoutForDepartment, reconcileRowCountsWithLayouts } from "./editor/templateDepartmentLayout";
import { deriveRowCount, deriveActiveRowCount } from "../../../shared/flyer/layout/layoutCardRows";
import { applyTextStylePatch, type TextFieldSection } from "./editor/textFieldStyle";
import SettingsView from "./settings/SettingsView";
import SetupView from "./settings/SetupView";
import WorkflowProgressBar from "./components/WorkflowProgressBar";
import DepartmentSaveProgress from "./components/DepartmentSaveProgress";
import type { DbBatchProgressEvent, DbPipelineTimingMs } from "./global";

type AppView = "setup" | "home" | "templateSelect" | "importTemplate" | "queue" | "editor" | "db-upload" | "settings";
export type DeptSaveEntry = { dept: string; done: number; total: number; status: "saving" | "done" | "error" };

const DEPT_LABELS: Record<string, string> = {
  grocery: "Grocery",
  frozen: "Frozen",
  hot_food: "Hot Food",
  sushi: "Sushi",
  meat: "Meat",
  seafood: "Seafood",
  fruit: "Fruit",
  vegetable: "Vegetable",
  hot_sale: "Hot Sale",
  produce: "Produce",
};

function formatAddProductPriceDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("$") ? trimmed : `$${trimmed}`;
}

function buildEnrichedResultFromForm(baseResult: any, formMeta: AddProductFormMeta) {
  const enTitle = formMeta.enTitle?.trim() ?? "";
  const zhTitle = formMeta.zhTitle?.trim() ?? "";
  const size = formMeta.size?.trim() ?? "";
  const salePrice = formMeta.salePrice?.trim() ?? "";
  const regPrice = formMeta.regPrice?.trim() ?? "";
  const priceDisplay = formatAddProductPriceDisplay(salePrice);
  const hasFormData = enTitle || zhTitle || salePrice;
  if (!hasFormData) return baseResult;
  return {
    ...baseResult,
    title: {
      ...(baseResult?.title ?? {}),
      ...(enTitle && { en: enTitle }),
      ...(zhTitle && { zh: zhTitle }),
      ...(size && { size }),
      ...(regPrice && { regularPrice: regPrice }),
      confidence: (baseResult?.title as any)?.confidence ?? "high",
      source: (baseResult?.title as any)?.source ?? "manual",
    },
    aiTitle: {
      ...(baseResult?.aiTitle ?? {}),
      ...(enTitle && { en: enTitle }),
      ...(zhTitle && { zh: zhTitle }),
      ...(size && { size }),
      confidence: (baseResult?.aiTitle as any)?.confidence ?? "high",
      source: (baseResult?.aiTitle as any)?.source ?? "manual",
    },
    discount: {
      ...(baseResult?.discount ?? {}),
      en: enTitle || (baseResult?.title as any)?.en || "",
      zh: zhTitle || (baseResult?.title as any)?.zh || "",
      size: size || (baseResult?.title as any)?.size || "",
      ...(salePrice && { salePrice, price: { display: priceDisplay } }),
      ...(regPrice && { regularPrice: regPrice }),
    },
  };
}

function buildAddProductPlaceholderResult(formMeta: AddProductFormMeta) {
  const enTitle = formMeta.enTitle?.trim() ?? "";
  const zhTitle = formMeta.zhTitle?.trim() ?? "";
  return buildEnrichedResultFromForm({
    inputPath: "",
    cutoutPath: null,
    layout: null,
    title: { en: enTitle, zh: zhTitle, confidence: "high" as const, source: "manual" as const },
    ocr: [],
    llmResult: null,
  }, formMeta);
}

export default function App() {
  // ---------------- VIEW STATE ----------------
  const [view, setView] = useState<AppView>("home");
  const [settingsReturnView, setSettingsReturnView] = useState<AppView>("home");
  const [editingTemplate, setEditingTemplate] = useState<CustomFlyerTemplateConfig | null>(null);

  // Check for missing required API keys on mount — show setup screen if needed
  useEffect(() => {
    window.ufm.getMissingKeys().then((missing: string[]) => {
      if (missing.length > 0) setView("setup");
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [viewingJob, setViewingJob] = useState<FlyerJob | null>(null);

  // ---------------- EDITOR STATE ----------------
  const [templateId, setTemplateId] = useState("weekly_v1");
  const [selectedTemplateId, setSelectedTemplateId] = useState("weekly_v1");
  const [department, setDepartment] = useState("grocery");
  const [availableDepartments, setAvailableDepartments] = useState<string[]>(["grocery"]);
  const { queue: editorQueue, loadItems, enqueue, remove, updateItem, addItem, applyCutoutPatch, applyCutoutError } = useIngestQueue();
  const editorQueueRef = useRef(editorQueue);
  editorQueueRef.current = editorQueue;
  const applyCutoutPatchRef = useRef(applyCutoutPatch);
  applyCutoutPatchRef.current = applyCutoutPatch;
  const applyCutoutErrorRef = useRef(applyCutoutError);
  applyCutoutErrorRef.current = applyCutoutError;
  const jobQueueHook = useJobQueue();
  const { jobs, deleteJob, deleteJobsForTemplate, syncJobFromEditorItems } = jobQueueHook;
  const [discountLabels, setDiscountLabels] = useState<{
    id: string;
    title?: { en: string; zh: string; size: string; regularPrice: string };
    price?: { display: string; quantity?: number | null; unit?: string; regular?: string; days?: string[] };
  }[]>([]);
  const discountLabelsRef = useRef(discountLabels);
  discountLabelsRef.current = discountLabels;
  const [slotOverrides, setSlotOverrides] = useState<Record<number, { x: number; y: number; width: number; height: number }>>({});
  const [cardLayouts, setCardLayouts] = useState<Record<string, CardLayout>>({});
  const [userRowCounts, setUserRowCounts] = useState<Record<string, number>>({});
  const [dbSearchItemId, setDbSearchItemId] = useState<string | null>(null);
  const [googleSearchItemId, setGoogleSearchItemId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [copiedItem, setCopiedItem] = useState<IngestItem | null>(null);
  const [replacementJobs, setReplacementJobs] = useState<ReplacementJob[]>([]);
  const [chromeCollapsed, setChromeCollapsed] = useState<boolean>(() =>
    localStorage.getItem("ufm_chrome_collapsed") === "1"
  );
  const toggleChrome = () => {
    setChromeCollapsed(v => {
      const next = !v;
      localStorage.setItem("ufm_chrome_collapsed", next ? "1" : "0");
      return next;
    });
  };
  const multiFlavorSessionRef = useRef<Map<string, string[]>>(new Map());
  const prevCardItemIdsRef = useRef<Set<string>>(new Set());
  /** After explicit Clear Department, skip auto-creating an empty card grid until items are added. */
  const suppressEmptyCardLayoutRef = useRef(false);
  const clearAllVerifyRef = useRef(false);
  const [batchUpload, setBatchUpload] = useState<{ total: number; processed: number; isActive: boolean } | null>(null);
  const [discountDetailsDialog, setDiscountDetailsDialog] = useState<{
    itemId: string;
    englishTitle: string;
    regularPrice: string;
    salePrice: string;
  } | null>(null);
  const [bannerDaysDialog, setBannerDaysDialog] = useState<{
    itemId: string;
    currentDays: string[];
  } | null>(null);
  const [seriesPickerItemId, setSeriesPickerItemId] = useState<string | null>(null);
  // Track which series items have already been auto-shown (so we don't re-open after Cancel)
  const seriesAutoShownRef = useRef<Set<string>>(new Set());
  // Holds accepted Serper items for DB promotion on export (updated whenever editor queue changes)
  const serperPromotionRef = useRef<Array<{ en: string; zh: string; size: string; cutoutPath: string }>>([]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState<LeftPanelTab>("images");
  const [leftPanelMenuOpen, setLeftPanelMenuOpen] = useState(false);
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [editorImportActive, setEditorImportActive] = useState(false);
  const [editorImportProgress, setEditorImportProgress] = useState({ done: 0, total: 0 });
  const editorImportJobIdRef = useRef<string | null>(null);
  const [processorStatus, setProcessorStatus] = useState<{
    isProcessing: boolean;
    currentJobId: string | null;
    queueLength: number;
  }>({ isProcessing: false, currentJobId: null, queueLength: 0 });
  const [originalDiscounts, setOriginalDiscounts] = useState<any[]>([]);
  const [showCheckingPanel, setShowCheckingPanel] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [verificationDone, setVerificationDone] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState<any>(null);
  const [departmentLocked, setDepartmentLocked] = useState(false);
  const [flyerExported, setFlyerExported] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(1.0);
  const windowZoomRef = useRef(1.0);
  const [canvasKey, setCanvasKey] = useState(0);
  const [departmentSaves, setDepartmentSaves] = useState<DeptSaveEntry[]>([]);
  const [showRecoveryOverlay, setShowRecoveryOverlay] = useState(false);

  const liveViewingJob = viewingJob
    ? (jobs.find(j => j.id === viewingJob.id) ?? viewingJob)
    : null;

  const isXlsxParsing = Boolean(
    liveViewingJob?.discount?.type === "xlsx"
    && (liveViewingJob.discount.status === "pending"
      || liveViewingJob.discount.status === "parsing")
  );

  const jobClaimsActive = liveViewingJob?.status === "queued"
    || liveViewingJob?.status === "processing";

  const isViewingJobInProcessor = Boolean(
    liveViewingJob
    && (
      processorStatus.currentJobId === liveViewingJob.id
      || (liveViewingJob.status === "queued" && processorStatus.queueLength > 0)
    )
  );

  const isEditorImportInProcessor = Boolean(
    editorImportActive
    && editorImportJobIdRef.current
    && (
      processorStatus.currentJobId === editorImportJobIdRef.current
      || processorStatus.queueLength > 0
    )
  );

  const isJobAutomationRunning = jobClaimsActive && isViewingJobInProcessor;

  const isEditorAutomationActive = view === "editor"
    && !showRecoveryOverlay
    && (
      isXlsxParsing
      || isJobAutomationRunning
      || isEditorImportInProcessor
    );

  const editorAutomationMessage = isXlsxParsing
    ? "Loading discount spreadsheet…"
    : "Searching for product images…";

  const editorAutomationProgress = isJobAutomationRunning
    ? {
        done: liveViewingJob?.progress?.processedImages ?? 0,
        total: liveViewingJob?.progress?.totalImages ?? 0,
      }
    : isEditorImportInProcessor
      ? editorImportProgress
      : { done: 0, total: 0 };

  const [toastState, setToastState] = useState<{ visible: boolean; message: string; variant: "success" | "error" }>({
    visible: false, message: "Draft saved", variant: "success",
  });
  const shownErrorIds = useRef<Set<string>>(new Set(jobs.filter(j => j.status === "failed").map(j => j.id)));
  const [startupTiming, setStartupTiming] = useState<{
    totalMs: number;
    rendererReadyMs: number;
    phases: { whenReady?: number; backendSpawn?: number; backendHealthy?: number; firebase?: number; viteReady?: number; windowCreated?: number; rendererReady?: number };
  } | null>(null);
  const [libraryPipelineLog, setLibraryPipelineLog] = useState<
    { id: string; path: string; status: string; timing: DbPipelineTimingMs }[]
  >([]);
  const editorSyncRunCount = useRef(0);
  const lastViewingJobIdRef = useRef<string | null>(null);
  const templateConfigRef = useRef<FlyerTemplateConfig | null>(null);
  const [templateConfig, setTemplateConfig] = useState<FlyerTemplateConfig | null>(null);
  const xlsxItemsLoadedRef = useRef(false);

  // Phase-2 cutout results arrive via push channel — register once on mount
  useEffect(() => {
    const unsubOk  = window.ufm.onCutoutComplete((d: { id: string; cutoutPath: string; layout: { size: string } }) => applyCutoutPatchRef.current(d.id, { cutoutPath: d.cutoutPath, layout: d.layout }));
    const unsubErr = window.ufm.onCutoutError((d: { id: string; error: string }) => applyCutoutErrorRef.current(d.id, d.error));
    return () => { unsubOk(); unsubErr(); };
  }, []);

  // Ctrl+/-/0 zoom: canvas-only in editor and template wizard; setZoomFactor elsewhere.
  // Entering the editor or wizard resets window zoom to 1.0 so toolbar/sidebar stay normal.
  // Leaving those views restores the previous window zoom level.
  useEffect(() => {
    if (view === "editor" || view === "importTemplate") {
      window.ufm.setWindowZoom(1.0);
    } else {
      if (windowZoomRef.current !== 1.0) window.ufm.setWindowZoom(windowZoomRef.current);
    }
  }, [view]);

  useEffect(() => {
    const unsub = window.ufm.onCanvasZoom(({ delta, reset }: { delta?: number; reset?: boolean }) => {
      if (view === "editor") {
        setCanvasZoom(prev => {
          if (reset) return 1.0;
          return Math.min(3.0, Math.max(0.3, Math.round((prev + (delta ?? 0)) * 10) / 10));
        });
      } else if (view !== "importTemplate") {
        const next = reset ? 1.0 : Math.min(3.0, Math.max(0.3, Math.round((windowZoomRef.current + (delta ?? 0)) * 10) / 10));
        windowZoomRef.current = next;
        window.ufm.setWindowZoom(next);
      }
    });
    return unsub;
  }, [view]);

  // Save-combination progress/complete listeners
  useEffect(() => {
    const unsubProgress = window.ufm.onSaveCombinationProgress((d: { index: number; total: number }) => {
      setDepartmentSaves(prev => {
        const idx = prev.findIndex(e => e.status === "saving");
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], done: d.index + 1, total: d.total };
        return next;
      });
    });
    const unsubComplete = window.ufm.onSaveCombinationComplete((d: { saved: number; skipped: number; errors: number; error?: string }) => {
      setDepartmentSaves(prev => {
        const idx = prev.findIndex(e => e.status === "saving");
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], done: d.saved, status: d.error ? "error" : "done" };
        return next;
      });
      setTimeout(() => {
        setDepartmentSaves(prev => {
          const idx = prev.findIndex(e => e.status !== "saving");
          return idx === -1 ? prev : prev.filter((_, i) => i !== idx);
        });
      }, 2500);
      if (d.error) {
        setToastState({ visible: true, message: `Save failed: ${d.error}`, variant: "error" });
      } else {
        const msg = d.saved > 0
          ? `Saved ${d.saved} product${d.saved !== 1 ? "s" : ""} to DB${d.skipped > 0 ? `, skipped ${d.skipped}` : ""}`
          : `Nothing saved${d.skipped > 0 ? ` (${d.skipped} items had no image)` : ""}`;
        setToastState({ visible: true, message: msg, variant: d.saved > 0 ? "success" : "error" });
      }
    });
    return () => { unsubProgress(); unsubComplete(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Batch upload progress — App-level listeners drive the global indicator only
  useEffect(() => {
    const TERMINAL = new Set(["done", "duplicate", "skipped", "error"]);
    const unsubProgress = window.ufm.onDbBatchProgress((d: { status: string }) => {
      setBatchUpload((prev) => {
        const base = prev ?? { total: 0, processed: 0, isActive: true };
        return {
          isActive: true,
          total:     d.status === "hashing"      ? base.total + 1     : base.total,
          processed: TERMINAL.has(d.status)       ? base.processed + 1 : base.processed,
        };
      });
    });
    const unsubComplete = window.ufm.onDbBatchComplete(() => {
      setBatchUpload((prev) => (prev ? { ...prev, isActive: false } : null));
      setTimeout(() => setBatchUpload(null), 3000);
    });
    return () => { unsubProgress(); unsubComplete(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Product Library batch: record per-image pipeline timings (main process → IPC).
  useEffect(() => {
    const MAX = 24;
    const unsub = window.ufm.onDbBatchProgress((d: DbBatchProgressEvent) => {
      const timing = d.pipelineTimingMs;
      if (!timing) return;
      const id = `plt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      setLibraryPipelineLog((prev) =>
        [{ id, path: d.path, status: d.status, timing }, ...prev].slice(0, MAX)
      );
    });
    return () => unsub();
  }, []);

  // On mount: if we're recovering from a crash, show progress overlay then auto-hide
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    editorImportJobIdRef.current = null;
    setEditorImportActive(false);
    setEditorImportProgress({ done: 0, total: 0 });
    window.ufm.didCrashLastRun().then((crashed: boolean) => {
      if (!crashed) return;
      setShowRecoveryOverlay(true);
      timeoutId = setTimeout(() => setShowRecoveryOverlay(false), 2500);
    });
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Poll main-process job queue so the editor block layer clears after restart/abort/complete
  useEffect(() => {
    if (view !== "editor") return;
    let cancelled = false;
    const poll = () => {
      window.ufm.getJobQueueStatus().then((status) => {
        if (cancelled) return;
        setProcessorStatus(status);
      }).catch(() => {});
    };
    poll();
    const id = window.setInterval(poll, 700);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [view, viewingJob?.id, editorImportActive]);

  // Keep viewingJob in sync when automation reaches a terminal state
  useEffect(() => {
    if (!viewingJob) return;
    const live = jobs.find(j => j.id === viewingJob.id);
    if (!live || live.status === viewingJob.status) return;
    const terminal = live.status === "completed" || live.status === "failed" || live.status === "drafting";
    if (terminal) setViewingJob(live);
  }, [jobs, viewingJob?.id, viewingJob?.status]);

  // Fetch startup timing from the main process once the renderer is mounted.
  // rendererReadyMs = now - t0Absolute is the true user-felt startup time.
  useEffect(() => {
    window.ufm.getStartupTiming().then((data: Awaited<ReturnType<typeof window.ufm.getStartupTiming>>) => {
      if (!data) return;
      const rendererReadyMs = Date.now() - data.t0Absolute;
      setStartupTiming({
        ...data,
        rendererReadyMs,
        phases: { ...data.phases, rendererReady: rendererReadyMs },
      });
    });
  }, []);

  // Escape key exits edit mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isEditorAutomationActive) setEditMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isEditorAutomationActive]);

  // Ctrl+C / Ctrl+V — copy-paste product cards in the editor
  useEffect(() => {
    if (view !== "editor" || isEditorAutomationActive) return;
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "c") {
        const item = editorQueue.find((it: any) => it.id === selectedItemId);
        if (item) { e.preventDefault(); setCopiedItem(item as IngestItem); }
      } else if (e.key === "v") {
        if (!copiedItem) return;
        e.preventDefault();
        const newItem: IngestItem = { ...copiedItem, id: crypto.randomUUID(), slotIndex: undefined };
        addItem(newItem);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view, isEditorAutomationActive, selectedItemId, copiedItem, editorQueue, addItem]);

  // Auto-exit edit mode when switching away from card department
  useEffect(() => {
    if (!isDeptCardBased()) setEditMode(false);
  }, [department]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close transient editor UI while automation is running
  useEffect(() => {
    if (!isEditorAutomationActive) return;
    setLeftPanelOpen(false);
    setShowAddProductDialog(false);
    setEditMode(false);
  }, [isEditorAutomationActive]);

  // Post-clear verification: log editor + job state on the render after handleClearAllDepartments
  useEffect(() => {
    if (!clearAllVerifyRef.current) return;
    clearAllVerifyRef.current = false;
    const templateJobCount = jobs.filter(j => j.templateId === templateId).length;
    const payload = {
      editorQueueLen: editorQueue.length,
      templateJobCount,
      viewingJobId: viewingJob?.id ?? null,
      department,
      cardLayoutItemIds: (cardLayouts[department] ?? []).filter(c => c.itemId).length,
      discountLabelCount: discountLabels.length,
    };
    // #region agent log
    (window as any).ufm?.debugLog?.({ sessionId: 'c3b215', location: 'App.tsx:postClearVerify', message: 'state after clear-all render', data: payload, hypothesisId: 'F', runId: 'post-fix-v3' });
    fetch('http://127.0.0.1:7361/ingest/57de729c-1f3f-4911-afe7-7b1a23fd9ad6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c3b215'},body:JSON.stringify({sessionId:'c3b215',location:'App.tsx:postClearVerify',message:'state after clear-all render',data:payload,timestamp:Date.now(),hypothesisId:'F',runId:'post-fix-v3'})}).catch(()=>{});
    // #endregion
  }, [editorQueue, jobs, templateId, viewingJob, department, cardLayouts, discountLabels]);

  // Sync items from job state to editorQueue as they stream in
  useEffect(() => {
    if (view !== "editor" || !viewingJob) return;
    const liveJob = jobs.find(j => j.id === viewingJob.id);
    if (!liveJob) return;

    const jobImages = liveJob.result?.processedImages ?? [];
    const jobLabels = liveJob.result?.discountLabels ?? [];

    if (jobImages.length === 0) return;

    const existingIds = new Set(editorQueueRef.current.map(item => item.id));
    const newImages = jobImages.filter(
      (img: any) => img.status === "done" && img.result && !existingIds.has(img.id)
    );

    if (newImages.length > 0) {
      // #region agent log
      (window as any).ufm?.debugLog?.({ sessionId: 'c3b215', location: 'App.tsx:jobStreamSync', message: 're-adding items from job stream', data: { newCount: newImages.length, viewingJobId: viewingJob.id, editorQueueLen: editorQueueRef.current.length }, hypothesisId: 'I', runId: 'post-fix-v3' });
      // #endregion
    }

    // Always process labels even when no new images — for XLSX jobs, labels arrive in
    // the final "complete" event after all items have already streamed in via itemComplete.
    const existingLabelIds = new Set(discountLabelsRef.current.map((l: any) => l.id));
    const newLabels = jobLabels.filter((l: any) => !existingLabelIds.has(l.id));
    if (newLabels.length > 0) {
      setDiscountLabels(prev => [...prev, ...newLabels]);
    }

    if (newImages.length === 0) return;

    newImages.forEach((img: any) => {
      addItem({
        id: img.id,
        path: img.path,
        status: "done" as const,
        result: img.result,
        slotIndex: img.slotIndex,
      });
    });

    const config = templateConfigRef.current;
    if (liveJob.department && config) {
      const mergedIds = [
        ...editorQueueRef.current.map(it => it.id),
        ...newImages.map((img: any) => img.id),
      ];
      const uniqueIds = [...new Set(mergedIds)];
      setCardLayouts(prev => {
        const layout = reconcileCardLayoutForDepartment(
          config,
          liveJob.department,
          uniqueIds,
          prev[liveJob.department],
          { targetRows: userRowCounts[liveJob.department] }
        );
        if (layout === prev[liveJob.department]) return prev;
        return { ...prev, [liveJob.department]: layout };
      });
    }
  }, [view, viewingJob?.id, jobs, userRowCounts]); // eslint-disable-line react-hooks/exhaustive-deps

  // load template config → extract available departments
  useEffect(() => {
    setTemplateConfig(null);
    templateConfigRef.current = null;

    const applyConfig = (config: FlyerTemplateConfig) => {
      templateConfigRef.current = config;
      setTemplateConfig(config);
      const depts = new Set<string>();
      config.pages.forEach(page => {
        Object.keys(page.departments).forEach(d => depts.add(d));
      });
      const deptList = Array.from(depts);
      setAvailableDepartments(deptList);
      if (!depts.has(department)) {
        setDepartment(deptList[0] ?? "grocery");
      }
    };

    loadFlyerTemplateConfig(templateId).then(async config => {
      applyConfig(config);
      // For custom (imported) templates, re-generate underprinst if the generation
      // algorithm changed (schema version bump). This runs once per template upgrade.
      if (templateId.startsWith("imported_")) {
        const upgraded = await upgradeTemplateUnderprintsIfNeeded(templateId);
        if (upgraded) {
          // Reload with fresh underprint paths and remount EditorCanvas to bust image cache.
          loadFlyerTemplateConfig(templateId).then(applyConfig);
          setCanvasKey(k => k + 1);
        }
      }
    });
  }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get the current department's card layout
  const currentCardLayout = cardLayouts[department] ?? null;

  const hydrateDepartmentCardLayout = useCallback((
    dept: string,
    items: IngestItem[],
    jobCardLayouts?: Record<string, CardLayout>
  ) => {
    const config = templateConfigRef.current;
    if (!config) {
      if (jobCardLayouts && Object.keys(jobCardLayouts).length > 0) {
        setCardLayouts(prev => ({ ...prev, ...jobCardLayouts }));
      }
      return;
    }

    const page = findPageForDepartment(config, dept);
    const deptDef = page?.departments[dept];
    if (!deptDef || !isCardDepartment(deptDef)) return;

    const doneIds = items
      .filter((it: IngestItem) => it.status === "done" || it.status === "processing_cutout" || it.status === "cutout_error")
      .map(it => it.id);
    const savedLayout = jobCardLayouts?.[dept];
    const occupiedRows = savedLayout?.length ? deriveActiveRowCount(savedLayout) : undefined;
    const targetRows = occupiedRows ?? userRowCounts[dept];

    setUserRowCounts(prev => {
      if (targetRows == null) return prev;
      if (prev[dept] === targetRows) return prev;
      return { ...prev, [dept]: targetRows };
    });

    setCardLayouts(prev => {
      const base = jobCardLayouts ? { ...prev, ...jobCardLayouts } : prev;
      const existing = savedLayout ?? base[dept];
      const layout = reconcileCardLayoutForDepartment(
        config,
        dept,
        doneIds,
        existing,
        { targetRows }
      );

      prevCardItemIdsRef.current = new Set(
        layout.filter(c => c.itemId).map(c => c.itemId as string)
      );

      return { ...base, [dept]: layout };
    });
  }, [userRowCounts]);

  // ── Editor history (undo / redo / timeline) ──
  const cardLayoutsRef = useRef(cardLayouts);
  cardLayoutsRef.current = cardLayouts;
  const slotOverridesRef = useRef(slotOverrides);
  slotOverridesRef.current = slotOverrides;
  const userRowCountsRef = useRef(userRowCounts);
  userRowCountsRef.current = userRowCounts;

  const applyHistorySnapshot = useCallback((snapshot: import("./editor/editorHistory").EditorSnapshot, currentQueue: IngestItem[]) => {
    setCardLayouts(snapshot.cardLayouts);
    setSlotOverrides(snapshot.slotOverrides);
    setUserRowCounts(snapshot.userRowCounts);
    setDiscountLabels(snapshot.discountLabels ?? []);
    loadItems(applySnapshotToQueue(snapshot, currentQueue));
  }, [loadItems]);

  const editorHistory = useEditorHistory({
    enabled: view === "editor" && !!viewingJob,
    resetKey: viewingJob?.id,
    getState: () => ({
      cardLayouts: cardLayoutsRef.current,
      slotOverrides: slotOverridesRef.current,
      userRowCounts: userRowCountsRef.current,
      editorQueue: editorQueueRef.current,
      discountLabels: discountLabelsRef.current,
    }),
    applySnapshot: applyHistorySnapshot,
  });

  const { commitNow, commitDebounced, undo, redo, jumpTo, canUndo, canRedo, entries: historyEntries, currentIndex: historyCurrentIndex } = editorHistory;

  // Refs so keyboard handler always calls the latest undo/redo without re-registering
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Shift+Z or Ctrl+Y = redo
  useEffect(() => {
    if (view !== "editor") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;
      // Don't intercept when user is typing in a text field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redoRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view]);

  // Close left panel dropdown when clicking outside
  useEffect(() => {
    if (!leftPanelMenuOpen) return;
    const close = () => setLeftPanelMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [leftPanelMenuOpen]);

  const handleApplyTextStyleGlobally = useCallback((section: TextFieldSection, patch: Partial<CardDef>) => {
    commitNow("Apply style to all departments", ["*"]);
    setCardLayouts(prev => {
      const next: Record<string, CardLayout> = { ...prev };
      for (const dept of Object.keys(next)) {
        const layout = next[dept];
        if (!layout?.length) continue;
        next[dept] = layout.map(c => c.itemId ? applyTextStylePatch(c, patch) : c);
      }
      return next;
    });
  }, [commitNow]);

  const handleRowCountChange = useCallback((newRows: number) => {
    if (newRows < 1) return;
    commitNow("Change row count", [department]);
    const layout = cardLayouts[department];
    const sortedItemIds = [...(layout ?? [])]
      .sort((a, b) => a.row - b.row || a.order - b.order)
      .filter(c => c.itemId)
      .map(c => c.itemId as string);

    const config = templateConfigRef.current;
    const page = config ? findPageForDepartment(config, department) : null;
    const deptDef = page?.departments[department];
    if (!deptDef || !isCardDepartment(deptDef)) return;

    const newLayout = autoLayoutCards({
      itemIds: sortedItemIds,
      regionWidth: deptDef.region.width,
      targetRows: newRows,
    });

    // Preserve contentScale, imageScale, titleScale, priceScale from old layout
    const scaleByItemId = new Map<string, {
      contentScale?: number; imageScale?: number; titleScale?: number; priceScale?: number;
    }>();
    for (const card of (layout ?? [])) {
      if (card.itemId) {
        const entry: { contentScale?: number; imageScale?: number; titleScale?: number; priceScale?: number } = {};
        if (card.contentScale != null) entry.contentScale = card.contentScale;
        if (card.imageScale != null) entry.imageScale = card.imageScale;
        if (card.titleScale != null) entry.titleScale = card.titleScale;
        if (card.priceScale != null) entry.priceScale = card.priceScale;
        if (Object.keys(entry).length > 0) scaleByItemId.set(card.itemId, entry);
      }
    }
    const newLayoutWithScale = newLayout.map(card =>
      card.itemId && scaleByItemId.has(card.itemId)
        ? { ...card, ...scaleByItemId.get(card.itemId) }
        : card
    );

    setUserRowCounts(prev => ({ ...prev, [department]: newRows }));
    setCardLayouts(prev => ({ ...prev, [department]: newLayoutWithScale }));
  }, [department, cardLayouts, commitNow]);

  const handleColCountChange = useCallback((newCols: number) => {
    if (newCols < 1) return;
    const layout = cardLayouts[department];
    const itemCount = (layout ?? []).filter(c => c.itemId).length;
    if (itemCount === 0) return;
    const newRows = Math.max(1, Math.ceil(itemCount / newCols));
    handleRowCountChange(newRows);
  }, [department, cardLayouts, handleRowCountChange]);

  const handleFlipLayout = useCallback(() => {
    const layout = cardLayouts[department];
    if (!layout || layout.length === 0) return;
    commitNow("Flip layout", [department]);

    const config = templateConfigRef.current;
    const page = config ? findPageForDepartment(config, department) : null;
    const deptDef = page?.departments[department];
    if (!deptDef || !isCardDepartment(deptDef)) return;

    const regionWidth = (deptDef as any).region.width;
    const curRows = Math.max(...layout.map(c => c.row)) + 1;
    const curCols = Math.max(...layout.map(c => c.order + 1));
    if (curRows === curCols) return;

    const newRows = curCols;
    const newCols = curRows;
    const newCardWidth = Math.round((regionWidth - (newCols - 1) * CARD_GAP) / newCols);

    // Build lookup: old (row, order) → card
    const grid = new Map<string, typeof layout[0]>();
    for (const card of layout) {
      grid.set(`${card.row},${card.order}`, card);
    }

    // Transpose: new position (r, c) ← old position (row=c, order=r)
    const newLayout: typeof layout = [];
    for (let r = 0; r < newRows; r++) {
      for (let c = 0; c < newCols; c++) {
        const old = grid.get(`${c},${r}`);
        newLayout.push({
          id: Math.random().toString(36).slice(2) + Date.now().toString(36),
          row: r,
          order: c,
          widthPx: newCardWidth,
          itemId: old?.itemId,
          contentScale: old?.contentScale,
          imageScale: old?.imageScale,
          titleScale: old?.titleScale,
          priceScale: old?.priceScale,
          imageRotation: old?.imageRotation,
          imageOffsetX: old?.imageOffsetX,
          imageOffsetY: old?.imageOffsetY,
          orientation: old?.orientation,
          cropLeft: old?.cropLeft,
          cropRight: old?.cropRight,
          cropTop: old?.cropTop,
          cropBottom: old?.cropBottom,
          titleFontFamily: old?.titleFontFamily,
          titleColor: old?.titleColor,
          titleItalic: old?.titleItalic,
          priceFontFamily: old?.priceFontFamily,
          priceColor: old?.priceColor,
          priceShowDollar: old?.priceShowDollar,
        });
      }
    }

    setUserRowCounts(prev => ({ ...prev, [department]: newRows }));
    setCardLayouts(prev => ({ ...prev, [department]: newLayout }));
  }, [department, cardLayouts, commitNow]);

  const handleCardLayoutChange = useCallback((layout: CardLayout) => {
    commitDebounced("Edit layout", [department]);
    setCardLayouts(prev => ({ ...prev, [department]: layout }));
  }, [department, commitDebounced]);

  const handleSlotOverridesChange = useCallback((overrides: Record<number, { x: number; y: number; width: number; height: number }>) => {
    commitDebounced("Move slot", [department]);
    setSlotOverrides(overrides);
  }, [department, commitDebounced]);

  const handleHistoryCommit = useCallback((label: string, depts?: string[]) => {
    commitNow(label, depts ?? [department]);
  }, [department, commitNow]);

  // Check if current department is card-based
  const isDeptCardBased = useCallback(() => {
    if (!templateConfig) return false;
    const page = findPageForDepartment(templateConfig, department);
    if (!page) return false;
    const deptDef = page.departments[department];
    return deptDef ? isCardDepartment(deptDef) : false;
  }, [department, templateConfig]);

  // When template config loads (or department changes), ensure the active card department has a grid.
  useEffect(() => {
    if (view !== "editor" || !templateConfig) return;

    const page = findPageForDepartment(templateConfig, department);
    const deptDef = page?.departments[department];
    if (!deptDef || !isCardDepartment(deptDef)) return;

    setCardLayouts(prev => {
      if (prev[department]?.length) return prev;
      if (suppressEmptyCardLayoutRef.current) return prev;

      const doneIds = editorQueueRef.current
        .filter((it: IngestItem) =>
          it.status === "done" || it.status === "processing_cutout" || it.status === "cutout_error"
        )
        .map(it => it.id);
      const layout = reconcileCardLayoutForDepartment(
        templateConfig,
        department,
        doneIds,
        prev[department],
        { targetRows: userRowCounts[department] }
      );

      prevCardItemIdsRef.current = new Set(
        layout.filter(c => c.itemId).map(c => c.itemId as string)
      );

      return { ...prev, [department]: layout };
    });
  }, [view, templateConfig, department, userRowCounts]);

  // Auto-generate card layout when items arrive for a card-based department
  useEffect(() => {
    if (view !== "editor") return;
    if (!isDeptCardBased()) return;

    const config = templateConfig;
    if (!config) return;
    const page = findPageForDepartment(config, department);
    if (!page) return;
    const deptDef = page.departments[department];
    if (!deptDef || !isCardDepartment(deptDef)) return;

    const doneItems = editorQueue.filter((it: any) => it.status === "done" || it.status === "processing_cutout" || it.status === "cutout_error");
    const doneIds = doneItems.map((it: any) => it.id);
    const existing = cardLayouts[department];

    // If there are items but no card layout, auto-generate
    if (doneIds.length > 0 && !existing?.length) {
      const layout = reconcileCardLayoutForDepartment(
        config,
        department,
        doneIds,
        undefined,
        { targetRows: userRowCounts[department] }
      );
      setCardLayouts(prev => ({ ...prev, [department]: layout }));
      setUserRowCounts(prev => prev[department] != null ? prev : { ...prev, [department]: deriveActiveRowCount(layout) });
      return;
    }

    // If items changed and layout is stale, rebuild (also compacts inflated grids)
    if (doneIds.length > 0) {
      const layout = reconcileCardLayoutForDepartment(
        config,
        department,
        doneIds,
        existing,
        { targetRows: userRowCounts[department] }
      );
      if (layout !== existing) {
        setCardLayouts(prev => ({ ...prev, [department]: layout }));
        setUserRowCounts(prev => ({ ...prev, [department]: deriveActiveRowCount(layout) }));
      }
      return;
    }

    // No items yet — ensure an empty template grid exists for this department
    if (!existing?.length) {
      if (suppressEmptyCardLayoutRef.current) {
        suppressEmptyCardLayoutRef.current = false;
        return;
      }
      const layout = autoLayoutCards({
        itemIds: [],
        regionWidth: deptDef.region.width,
        defaultRows: userRowCounts[department] ?? 1,
      });
      setCardLayouts(prev => ({ ...prev, [department]: layout }));
    }
  }, [view, department, editorQueue, cardLayouts, isDeptCardBased, userRowCounts, templateConfig]);

  // When a new item finishes ingestion in card mode, assign it to an empty card.
  // If all cards are occupied, regenerate the layout to accommodate the new items.
  useEffect(() => {
    if (view !== "editor") return;
    if (!isDeptCardBased()) return;
    const layout = cardLayouts[department];
    if (!layout?.length) return;

    const doneItems = editorQueue.filter((it: any) => it.status === "done" || it.status === "processing_cutout" || it.status === "cutout_error");
    const assignedItemIds = new Set(layout.filter(c => c.itemId).map(c => c.itemId));

    // Items that previously had a card but now appear unassigned are merge race-condition
    // artifacts (layout updated before queue update in the same event). Only treat truly
    // new items (never had a card) as unassigned to avoid triggering a spurious regeneration.
    const unassigned = doneItems.filter((it: any) =>
      !assignedItemIds.has(it.id) && !prevCardItemIdsRef.current.has(it.id)
    );

    // Keep ref current before any early return so it reflects the layout every render
    prevCardItemIdsRef.current = new Set(
      layout.filter(c => c.itemId).map(c => c.itemId as string)
    );

    if (unassigned.length === 0) return;

    // Try filling existing empty cards first
    let updated = [...layout];
    let changed = false;
    let overflow = false;
    for (const item of unassigned) {
      const emptyIdx = updated.findIndex(c => !c.itemId);
      if (emptyIdx >= 0) {
        updated[emptyIdx] = { ...updated[emptyIdx], itemId: item.id };
        changed = true;
      } else {
        overflow = true;
        break;
      }
    }

    if (overflow) {
      // No empty slot — regenerate layout from scratch so every done item gets a card
      const config = templateConfigRef.current;
      const page = config ? findPageForDepartment(config, department) : null;
      const deptDef = page?.departments[department];
      if (deptDef && isCardDepartment(deptDef)) {
        const allIds = doneItems.map((it: any) => it.id);
        const newLayout = autoLayoutCards({
          itemIds: allIds,
          regionWidth: deptDef.region.width,
          targetRows: userRowCounts[department] ?? deriveActiveRowCount(layout),
        });
        setCardLayouts(prev => ({ ...prev, [department]: newLayout }));
        setUserRowCounts(prev => ({ ...prev, [department]: deriveActiveRowCount(newLayout) }));
      }
    } else if (changed) {
      setCardLayouts(prev => ({ ...prev, [department]: updated }));
    }
  }, [view, department, editorQueue, cardLayouts, isDeptCardBased, userRowCounts]);

  // Sync editor state back to the current job
  useEffect(() => {
    if (view !== "editor" || !viewingJob) return;
    if (viewingJob.id !== lastViewingJobIdRef.current) {
      lastViewingJobIdRef.current = viewingJob.id;
      editorSyncRunCount.current = 0;
    }
    syncJobFromEditorItems(viewingJob.id, editorQueue, discountLabels, slotOverrides, cardLayouts, userRowCounts, verificationDone, verificationProgress, departmentLocked);
    editorSyncRunCount.current += 1;
    if (editorSyncRunCount.current > 1) {
      setToastState(prev => {
        if (prev.visible && prev.variant === "error") return prev;
        return { visible: true, message: "Draft saved", variant: "success" };
      });
    }
  }, [view, viewingJob, editorQueue, discountLabels, slotOverrides, cardLayouts, userRowCounts, verificationDone, verificationProgress, departmentLocked, syncJobFromEditorItems]);

  // Watch for job failures → show error toast
  useEffect(() => {
    for (const job of jobs) {
      if (job.status === "failed" && job.error && !shownErrorIds.current.has(job.id)) {
        shownErrorIds.current.add(job.id);
        setToastState({ visible: true, message: job.error, variant: "error" });
        break;
      }
    }
  }, [jobs]);

  // Watch for parsedItems to arrive for xlsx drafts that opened before parsing finished
  useEffect(() => {
    if (view !== "editor" || !viewingJob || xlsxItemsLoadedRef.current) return;
    if ((viewingJob.discount as any)?.type !== "xlsx") return;
    const updatedJob = jobs.find(j => j.id === viewingJob.id);
    const parsedItems = (updatedJob?.discount as any)?.parsedItems;
    if (!parsedItems?.length) return;

    const syntheticItems: IngestItem[] = parsedItems.map((di: any, i: number) => ({
      id: crypto.randomUUID(),
      path: "",
      status: "pending" as const,
      slotIndex: i,
      result: {
        inputPath: "",
        cutoutPath: "",
        layout: { size: "medium" },
        title: {
          en: di.en ?? "",
          zh: di.zh ?? "",
          size: di.size ?? "",
          confidence: "high" as const,
          source: "xlsx" as const,
        },
        discount: di,
        ocr: { items: [] },
        llmResult: { best_title: {}, items: [] },
      },
    }));
    xlsxItemsLoadedRef.current = true;
    loadItems(syntheticItems);
  }, [view, viewingJob, jobs]);

  // ---------------- VIEW FLYER FROM JOB ----------------
  const handleViewFlyer = (job: FlyerJob) => {
    if (!job.result?.processedImages) return;

    setViewingJob(job);
    setTemplateId(job.templateId);
    setDepartment(job.department);

    const ingestItems: IngestItem[] = job.result.processedImages
      .filter(img => img.status === "done" && img.result)
      .map(img => ({
        id: img.id,
        path: img.path,
        status: "done" as const,
        result: img.result,
        slotIndex: img.slotIndex,
        placementOverride: (img as any).placementOverride,
      }));

    loadItems(ingestItems);
    xlsxItemsLoadedRef.current = true;

    setDiscountLabels(job.result.discountLabels ?? []);

    // Populate originalDiscounts from job processedImages for verification
    const discountsFromJob = job.result.processedImages
      .map((img: any) => img.result?.discount)
      .filter(Boolean);
    setOriginalDiscounts(discountsFromJob);
    setVerificationDone(job.result?.verificationDone ?? false);
    setVerificationProgress(job.result?.verificationProgress ?? null);
    setDepartmentLocked(job.result?.departmentLocked ?? false);

    setSlotOverrides(job.slotOverrides ?? {});
    setUserRowCounts(reconcileRowCountsWithLayouts(job.userRowCounts ?? {}, job.cardLayouts));
    // When templateId is changing, templateConfigRef still holds the old config — using it
    // would produce card slots sized for the wrong template. Skip hydration; restore any
    // saved layout from the job directly, or clear so the "ensure card layout" effect
    // rebuilds from the correct config once it arrives.
    if (job.templateId !== templateId) {
      setCardLayouts(prev => {
        const saved = job.cardLayouts?.[job.department];
        if (saved?.length) return { ...prev, [job.department]: saved };
        const { [job.department]: _removed, ...rest } = prev;
        return rest;
      });
    } else {
      hydrateDepartmentCardLayout(job.department, ingestItems, job.cardLayouts);
    }
    setView("editor");
  };

  // ---------------- OPEN DRAFT IN EDITOR ----------------
  const handleOpenDraft = (job: FlyerJob) => {
    setViewingJob(job);
    setTemplateId(job.templateId);
    setDepartment(job.department);
    setSelectedItemId(null);
    xlsxItemsLoadedRef.current = false;

    let loadedItems: IngestItem[] = [];

    if (job.result?.processedImages?.length) {
      loadedItems = job.result.processedImages
        .filter(img => img.status === "done" && img.result)
        .map(img => ({
          id: img.id,
          path: img.path,
          status: "done" as const,
          result: img.result,
          slotIndex: img.slotIndex,
          placementOverride: (img as any).placementOverride,
        }));
      loadItems(loadedItems);
      xlsxItemsLoadedRef.current = true;

      setDiscountLabels(job.result.discountLabels ?? []);

      const discountsFromJob = job.result.processedImages
        .map((img: any) => img.result?.discount)
        .filter(Boolean);
      setOriginalDiscounts(discountsFromJob);
      setVerificationDone(job.result?.verificationDone ?? false);
      setVerificationProgress(job.result?.verificationProgress ?? null);
      setDepartmentLocked(job.result?.departmentLocked ?? false);
    } else {
      const parsedItems = (job.discount as any)?.parsedItems;
      const isXlsx = (job.discount as any)?.type === "xlsx";

      if (isXlsx) {
        if (parsedItems?.length) {
          loadedItems = parsedItems.map(
            (di: any, i: number) => ({
              id: crypto.randomUUID(),
              path: "",
              status: "pending" as const,
              slotIndex: i,
              result: {
                inputPath: "",
                cutoutPath: "",
                layout: { size: "medium" },
                title: {
                  en: di.en ?? "",
                  zh: di.zh ?? "",
                  size: di.size ?? "",
                  confidence: "high" as const,
                  source: "xlsx" as const,
                },
                discount: di,
                ocr: { items: [] },
                llmResult: { best_title: {}, items: [] },
              },
            })
          );
          xlsxItemsLoadedRef.current = true;
          loadItems(loadedItems);
        } else {
          loadItems([]);
        }
      } else {
        loadItems([]);
      }
      setDiscountLabels([]);
      setOriginalDiscounts([]);
      setVerificationDone(false);
      setVerificationProgress(null);
      setDepartmentLocked(false);
    }

    setSlotOverrides(job.slotOverrides ?? {});
    setUserRowCounts(reconcileRowCountsWithLayouts(job.userRowCounts ?? {}, job.cardLayouts));
    // Same guard as handleViewFlyer: if templateId is changing, templateConfigRef still
    // has the old config. Avoid building a layout from wrong dimensions; let the
    // "ensure card layout" effect rebuild once the new config arrives.
    if (job.templateId !== templateId) {
      setCardLayouts(prev => {
        const saved = job.cardLayouts?.[job.department];
        if (saved?.length) return { ...prev, [job.department]: saved };
        const { [job.department]: _removed, ...rest } = prev;
        return rest;
      });
    } else {
      hydrateDepartmentCardLayout(job.department, loadedItems, job.cardLayouts);
    }
    setView("editor");
  };

  const handleEditorDepartmentChange = (dept: DepartmentId) => {
    const processingJob = jobs.find(
      j => j.department === dept && j.templateId === templateId && (j.status === "queued" || j.status === "processing")
    );
    const draftingJobForDept = jobs.find(
      j => j.department === dept && j.templateId === templateId && j.status === "drafting"
    );
    const completedJob = jobs.find(
      j => j.department === dept && j.templateId === templateId && j.status === "completed"
    );
    const jobToOpen = processingJob || draftingJobForDept || completedJob;
    if (jobToOpen) {
      // #region agent log
      (window as any).ufm?.debugLog?.({ sessionId: 'c3b215', location: 'App.tsx:deptChangeOpenDraft', message: 'opening job on department switch', data: { dept, jobId: jobToOpen.id, itemCount: jobToOpen.result?.processedImages?.length ?? 0 }, hypothesisId: 'G', runId: 'post-fix-v3' });
      // #endregion
      handleOpenDraft(jobToOpen);
      return;
    }
    // No job for this department yet
    xlsxItemsLoadedRef.current = false;
    prevCardItemIdsRef.current = new Set();
    setSelectedItemId(null);
    loadItems([]);
    setDiscountLabels([]);
    setOriginalDiscounts([]);
    setVerificationDone(false);
    setVerificationProgress(null);
    setDepartmentLocked(false);
    setSlotOverrides({});
    setDepartment(dept);
    setViewingJob(null);
    hydrateDepartmentCardLayout(dept, []);
  };

  // ---------------- IMAGE PANEL DATA ----------------
  const allPanelItems = useMemo<PanelImageItem[]>(() => {
    // Collect all candidates (may include XLSX ghost entries with no paths alongside real results)
    const candidates: PanelImageItem[] = [];

    for (const item of editorQueue) {
      const cutoutPath = item.result?.cutoutPath || null;
      const inputPath = item.result?.inputPath || item.path || "";
      if (!cutoutPath && !inputPath) continue;
      const titleEn = (item.result as any)?.title?.en || (item.result as any)?.aiTitle?.en || "";
      candidates.push({ id: item.id, cutoutPath, inputPath, titleEn, department });
    }

    for (const job of jobs) {
      if (!job.result?.processedImages) continue;
      for (const img of job.result.processedImages) {
        const cutoutPath = img.result?.cutoutPath || null;
        const inputPath = img.result?.inputPath || img.path || "";
        if (!cutoutPath && !inputPath) continue;
        const titleEn = (img.result as any)?.title?.en || (img.result as any)?.aiTitle?.en || "";
        candidates.push({ id: img.id, cutoutPath, inputPath, titleEn, department: job.department });
      }
    }

    // Deduplicate by (department, title) — XLSX jobs produce two records per product:
    // an old placeholder (no paths, skipped above) and a real result. When the same title
    // appears twice within a department, keep the version with the better paths.
    const best = new Map<string, PanelImageItem>();
    for (const item of candidates) {
      const key = item.titleEn ? `${item.department}:${item.titleEn.toLowerCase()}` : `id:${item.id}`;
      const existing = best.get(key);
      if (!existing) {
        best.set(key, item);
      } else if (!existing.cutoutPath && item.cutoutPath) {
        best.set(key, item);
      }
    }

    return [...best.values()];
  }, [jobs, editorQueue, department]);

  const handlePanelImageDrop = useCallback((
    targetItemId: string | null,
    cutoutPath: string | null,
    inputPath: string,
    meta?: { cardId?: string; sourceItemId?: string }
  ) => {
    if (!cutoutPath && !inputPath) return;
    commitNow(targetItemId ? "Replace image" : "Assign image to card", [department]);

    const patchImagePaths = (itemId: string) => {
      const existing = editorQueue.find((it: any) => it.id === itemId);
      if (!existing) return;
      updateItem(itemId, {
        result: {
          cutoutPath: cutoutPath ?? null,
          cutoutPaths: cutoutPath ? [cutoutPath] : undefined,
          inputPath: inputPath || existing.result?.inputPath,
        } as any,
      });
    };

    if (targetItemId) {
      patchImagePaths(targetItemId);
      return;
    }

    const { cardId, sourceItemId } = meta ?? {};
    if (!cardId || !sourceItemId) return;

    const layout = cardLayouts[department];
    if (!layout?.length) return;
    const cardIdx = layout.findIndex(c => c.id === cardId);
    if (cardIdx < 0) return;

    setCardLayouts(prev => {
      const current = prev[department] ?? [];
      const updated = current.map(c => {
        if (c.id === cardId) return { ...c, itemId: sourceItemId };
        if (c.itemId === sourceItemId) return { ...c, itemId: undefined };
        return c;
      });
      return { ...prev, [department]: updated };
    });

    patchImagePaths(sourceItemId);
  }, [editorQueue, updateItem, cardLayouts, department, commitNow]);

  // ---------------- REPLACE IMAGE IN-PLACE ----------------
  const handleReplaceImage = async (itemId: string, targetFlavorIndex?: number) => {
    const filePath = await window.ufm.openImageDialog();
    if (!filePath) return;

    const jobId = uuidv4();
    setReplacementJobs(prev => [...prev, { id: jobId, itemId, url: filePath, status: "processing" }]);
    try {
      const result = await window.ufm.ingestPhoto(filePath);
      if (targetFlavorIndex !== undefined) {
        replaceFlavorAtIndex(itemId, { path: filePath, result }, targetFlavorIndex);
      } else {
        handleSearchReplace(itemId, { path: filePath, result });
      }
      setReplacementJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: "done" } : j));
      setTimeout(() => setReplacementJobs(prev => prev.filter(j => j.id !== jobId)), 2000);
    } catch (err: any) {
      setReplacementJobs(prev => prev.map(j =>
        j.id === jobId ? { ...j, status: "error", errorMessage: err?.message ?? String(err) } : j
      ));
    }
  };

  // ---------------- REPLACE VIA SEARCH MODALS ----------------
  const handleSearchReplace = (itemId: string, data: { path: string; result: any }) => {
    commitNow("Replace image", [department]);
    const existingItem = editorQueue.find(item => item.id === itemId);

    // Phase 2: record rejection signal if replacing a Serper-sourced image
    if (existingItem?.result?.matchSource === "serper") {
      const ctx = (existingItem.result as any)._serperSignalCtx;
      (window as any).ufm.recordSerperRejection({
        url: ctx?.url ?? null,
        domain: ctx?.domain ?? null,
        productEn: existingItem.result?.discount?.en ?? "",
        department: existingItem.result?.discount?.department ?? "",
        reason: "rejected_user_swap",
      }).catch(() => {});
    }

    // Phase 2: record acceptance signal for manual Chrome search picks (3× weight)
    if ((data as any)._sourceUrl) {
      (window as any).ufm.recordManualGoogleAccepted({
        sourceUrl: (data as any)._sourceUrl,
        searchQuery: (data as any)._searchQuery ?? "",
        productEn: existingItem?.result?.discount?.en ?? "",
        department: existingItem?.result?.discount?.department ?? "",
      }).catch(() => {});
    }

    updateItem(itemId, {
      status: "done",
      path: data.path,
      result: {
        ...data.result,
        // Preserve discount metadata from the original item
        discount: existingItem?.result?.discount,
        // Clear stale multi-image fields from the old item so the new single image renders correctly
        cutoutPaths: undefined,
        allFlavorPaths: undefined,
        pendingFlavorSelection: undefined,
        subImageOverrides: undefined,
      },
    });
  };

  const replaceFlavorAtIndex = (itemId: string, data: { path: string; result: any }, targetIndex: number) => {
    commitNow("Replace flavor image", [department]);
    const existingItem = editorQueueRef.current.find((i: any) => i.id === itemId);
    if (!existingItem) return;
    const oldPaths: string[] = existingItem.result?.cutoutPaths
      ?? (existingItem.result?.cutoutPath ? [existingItem.result.cutoutPath] : []);
    const newCutoutPath: string = data.result?.cutoutPath ?? data.path;
    const newPaths = oldPaths.map((p: string, i: number) => i === targetIndex ? newCutoutPath : p);
    updateItem(itemId, {
      status: "done",
      path: data.path,
      result: {
        ...data.result,
        discount: existingItem.result?.discount,
        cutoutPath: newPaths[0],
        cutoutPaths: newPaths.length > 1 ? newPaths : undefined,
        allFlavorPaths: existingItem.result?.allFlavorPaths,
        subImageOverrides: existingItem.result?.subImageOverrides,
        pendingFlavorSelection: undefined,
      },
    });
  };

  const enqueueReplacementJob = async (
    itemId: string,
    url: string,
    searchQuery: string,
    isMultiFlavor: boolean,
    targetFlavorIndex?: number,
  ) => {
    const jobId = uuidv4();
    setReplacementJobs(prev => [...prev, { id: jobId, itemId, url, status: "processing" }]);
    try {
      const data = await window.ufm.downloadAndIngestFromUrl(jobId, url.trim());

      if (targetFlavorIndex != null) {
        // Targeted 1-for-1 flavor slot replacement
        replaceFlavorAtIndex(itemId, data, targetFlavorIndex);
      } else if (isMultiFlavor) {
        const session = multiFlavorSessionRef.current;
        const existing = session.get(itemId) ?? [];
        const newPath: string = data.result?.cutoutPath ?? data.path;
        const accumulated = [...existing, newPath];
        session.set(itemId, accumulated);
        const existingItem = editorQueueRef.current.find((i: any) => i.id === itemId);
        updateItem(itemId, {
          status: "done",
          path: data.path,
          result: {
            ...data.result,
            discount: existingItem?.result?.discount,
            cutoutPath: accumulated[0],
            cutoutPaths: accumulated.length > 1 ? accumulated : undefined,
            allFlavorPaths: undefined,
            pendingFlavorSelection: undefined,
            subImageOverrides: undefined,
          },
        });
      } else {
        handleSearchReplace(itemId, { ...data, _sourceUrl: url, _searchQuery: searchQuery });
      }

      setReplacementJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: "done" } : j));
      setTimeout(() => setReplacementJobs(prev => prev.filter(j => j.id !== jobId)), 2000);
    } catch (err: any) {
      // Silently drop cancelled jobs without showing an error state
      if (err?.name === "AbortError" || err?.message === "Cancelled by user") {
        setReplacementJobs(prev => prev.filter(j => j.id !== jobId));
        return;
      }
      setReplacementJobs(prev => prev.map(j =>
        j.id === jobId ? { ...j, status: "error", errorMessage: err?.message ?? String(err) } : j
      ));
      setTimeout(() => setReplacementJobs(prev => prev.filter(j => j.id !== jobId)), 10000);
    }
  };

  const enqueueDbReplacementJob = (
    itemId: string,
    publicUrl: string,
    targetFlavorIndex?: number,
  ) => {
    void enqueueReplacementJob(itemId, publicUrl, "", false, targetFlavorIndex);
  };

  const cancelReplacementJob = (jobId: string) => {
    const job = replacementJobs.find(j => j.id === jobId);
    if (!job) return;
    const relatedJobs = replacementJobs.filter(j => j.itemId === job.itemId);
    for (const j of relatedJobs) {
      (window as any).ufm.cancelReplacementJob(j.id);
    }
    setReplacementJobs(prev => prev.filter(j => j.itemId !== job.itemId));
    const item = editorQueueRef.current.find(i => i.id === job.itemId);
    if (item?.status === "processing_cutout" && !item.result?.cutoutPath) {
      remove(job.itemId);
      setDiscountLabels(prev => prev.filter(l => l.id !== job.itemId));
      if (isDeptCardBased()) {
        setCardLayouts(prev => {
          const layout = prev[department];
          if (!layout) return prev;
          return {
            ...prev,
            [department]: layout.map(c =>
              c.itemId === job.itemId ? { ...c, itemId: undefined } : c
            ),
          };
        });
      }
    }
  };

  const linkAddProductToCard = (cardId: string, itemId: string) => {
    setCardLayouts(prev => {
      const layout = prev[department];
      if (!layout) return prev;
      return {
        ...prev,
        [department]: layout.map(c => c.id === cardId ? { ...c, itemId } : c),
      };
    });
  };

  const maybeGenerateDiscountLabel = async (item: IngestItem) => {
    const disc = item.result?.discount as any;
    if (disc?.price?.display || disc?.salePrice) {
      try {
        const labels = await window.ufm.exportDiscountImages([item]);
        if (labels?.[0]) setDiscountLabels((prev: any[]) => [...prev, labels[0]]);
      } catch { /* label render failed */ }
    }
  };

  const enqueueAddProductFromUrl = (
    url: string,
    options: { slotIndex?: number; cardId?: string; formMeta?: AddProductFormMeta },
  ): string => {
    const itemId = uuidv4();
    const jobId = uuidv4();
    const formMeta = options.formMeta ?? {};
    commitNow("Add product", [department]);

    addItem({
      id: itemId,
      path: "",
      status: "processing_cutout",
      slotIndex: options.slotIndex,
      result: buildAddProductPlaceholderResult(formMeta),
    });

    if (options.cardId) {
      linkAddProductToCard(options.cardId, itemId);
    }

    setReplacementJobs(prev => [...prev, { id: jobId, itemId, url, status: "processing" }]);

    void (async () => {
      try {
        const data = await window.ufm.downloadAndIngestFromUrl(jobId, url.trim());
        const enriched = buildEnrichedResultFromForm(data.result, formMeta);
        const finalItem: IngestItem = {
          id: itemId,
          path: data.path,
          status: "done",
          slotIndex: options.slotIndex,
          result: enriched,
        };
        updateItem(itemId, finalItem);
        await maybeGenerateDiscountLabel(finalItem);
        setReplacementJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: "done" } : j));
        setTimeout(() => setReplacementJobs(prev => prev.filter(j => j.id !== jobId)), 2000);
      } catch (err: any) {
        if (err?.name === "AbortError" || err?.message === "Cancelled by user") {
          remove(itemId);
          setDiscountLabels(prev => prev.filter(l => l.id !== itemId));
          if (options.cardId && isDeptCardBased()) {
            setCardLayouts(prev => {
              const layout = prev[department];
              if (!layout) return prev;
              return {
                ...prev,
                [department]: layout.map(c =>
                  c.itemId === itemId ? { ...c, itemId: undefined } : c
                ),
              };
            });
          }
          setReplacementJobs(prev => prev.filter(j => j.id !== jobId));
          return;
        }
        updateItem(itemId, { status: "cutout_error" });
        setReplacementJobs(prev => prev.map(j =>
          j.id === jobId ? { ...j, status: "error", errorMessage: err?.message ?? String(err) } : j
        ));
        setTimeout(() => setReplacementJobs(prev => prev.filter(j => j.id !== jobId)), 10000);
      }
    })();

    return itemId;
  };

  const enqueueAddProductSeries = (
    urls: string[],
    options: { slotIndex?: number; cardId?: string; formMeta?: AddProductFormMeta },
  ): string => {
    const itemId = uuidv4();
    const formMeta = options.formMeta ?? {};
    commitNow("Add product", [department]);

    addItem({
      id: itemId,
      path: "",
      status: "processing_cutout",
      slotIndex: options.slotIndex,
      result: buildAddProductPlaceholderResult(formMeta),
    });

    if (options.cardId) {
      linkAddProductToCard(options.cardId, itemId);
    }

    const results: Array<{ path: string; result: any } | null> = new Array(urls.length).fill(null);
    let finished = 0;
    let failed = false;

    const tryFinalize = async () => {
      if (failed || finished < urls.length) return;
      const valid = results.filter((r): r is { path: string; result: any } => r != null);
      if (valid.length === 0) {
        remove(itemId);
        if (options.cardId && isDeptCardBased()) {
          setCardLayouts(prev => {
            const layout = prev[department];
            if (!layout) return prev;
            return {
              ...prev,
              [department]: layout.map(c =>
                c.itemId === itemId ? { ...c, itemId: undefined } : c
              ),
            };
          });
        }
        return;
      }
      const cutoutPaths = valid.map(r => r.result?.cutoutPath || r.path);
      const enriched = buildEnrichedResultFromForm(valid[0].result, formMeta);
      const finalItem: IngestItem = {
        id: itemId,
        path: valid[0].path,
        status: "done",
        slotIndex: options.slotIndex,
        result: {
          ...enriched,
          cutoutPath: cutoutPaths[0],
          cutoutPaths: cutoutPaths.length > 1 ? cutoutPaths : undefined,
          allFlavorPaths: cutoutPaths,
          pendingFlavorSelection: cutoutPaths.length > 1 ? true : undefined,
        },
      };
      updateItem(itemId, finalItem);
      await maybeGenerateDiscountLabel(finalItem);
    };

    urls.forEach((url, idx) => {
      const jobId = uuidv4();
      setReplacementJobs(prev => [...prev, { id: jobId, itemId, url, status: "processing" }]);

      void (async () => {
        try {
          const data = await window.ufm.downloadAndIngestFromUrl(jobId, url.trim());
          results[idx] = data;
          setReplacementJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: "done" } : j));
          setTimeout(() => setReplacementJobs(prev => prev.filter(j => j.id !== jobId)), 2000);
        } catch (err: any) {
          if (err?.name === "AbortError" || err?.message === "Cancelled by user") {
            failed = true;
            remove(itemId);
            setDiscountLabels(prev => prev.filter(l => l.id !== itemId));
            if (options.cardId && isDeptCardBased()) {
              setCardLayouts(prev => {
                const layout = prev[department];
                if (!layout) return prev;
                return {
                  ...prev,
                  [department]: layout.map(c =>
                    c.itemId === itemId ? { ...c, itemId: undefined } : c
                  ),
                };
              });
            }
            setReplacementJobs(prev => prev.filter(j => j.itemId !== itemId));
            return;
          }
          failed = true;
          updateItem(itemId, { status: "cutout_error" });
          setReplacementJobs(prev => prev.map(j =>
            j.id === jobId ? { ...j, status: "error", errorMessage: err?.message ?? String(err) } : j
          ));
          setTimeout(() => setReplacementJobs(prev => prev.filter(j => j.id !== jobId)), 10000);
        } finally {
          finished++;
          void tryFinalize();
        }
      })();
    });

    return itemId;
  };

  const handleChooseDatabaseResults = (itemId: string) => {
    setDbSearchItemId(itemId);
  };

  const handleChooseGoogleSearch = (itemId: string) => {
    const item = editorQueue.find((i: any) => i.id === itemId);
    const isMulti = Array.isArray(item?.result?.cutoutPaths) && (item!.result!.cutoutPaths as string[]).length > 1;
    if (isMulti) multiFlavorSessionRef.current.delete(itemId);
    setGoogleSearchItemId(itemId);
  };

  // Keep the Serper promotion ref in sync with editor items so we always have
  // the latest accepted Serper images ready to promote on export.
  useEffect(() => {
    if (view !== "editor") return;
    serperPromotionRef.current = editorQueue
      .filter((item: any) => item.status === "done" && item.result?.matchSource === "serper" && item.result?.cutoutPath)
      .map((item: any) => ({
        en: item.result?.discount?.en ?? item.result?.title?.en ?? "",
        zh: item.result?.discount?.zh ?? item.result?.title?.zh ?? "",
        size: item.result?.discount?.size ?? item.result?.title?.size ?? "",
        department: item.result?.discount?.department ?? "",
        sourceDomain: (item.result as any)._serperSignalCtx?.domain ?? "",
        cutoutPath: item.result.cutoutPath as string,
      }));
  }, [view, editorQueue]);

  // ---------------- SERIES FLAVOR SELECTION ----------------

  // Auto-open picker once when editor loads with pending series items
  useEffect(() => {
    if (view !== "editor") return;
    if (seriesPickerItemId) return; // already open
    const pending = editorQueue.find((item: any) =>
      item.status === "done" &&
      item.result?.pendingFlavorSelection === true &&
      Array.isArray(item.result?.cutoutPaths) &&
      item.result.cutoutPaths.length > 1 &&
      !seriesAutoShownRef.current.has(item.id)
    );
    if (pending) {
      seriesAutoShownRef.current.add(pending.id);
      setSeriesPickerItemId(pending.id);
    }
  }, [view, editorQueue, seriesPickerItemId]);

  const handleConfirmSeriesFlavors = (itemId: string, selectedPaths: string[]) => {
    const item = editorQueue.find((i: any) => i.id === itemId);
    if (!item?.result) return;
    updateItem(itemId, {
      result: {
        ...item.result,
        cutoutPath: selectedPaths[0] ?? item.result.cutoutPath,
        // Keep selected set (undefined when only 1 chosen — single image render path)
        cutoutPaths: selectedPaths.length > 1 ? selectedPaths : undefined,
        // allFlavorPaths is intentionally kept from the original result — do NOT overwrite
        pendingFlavorSelection: false,
      },
    });
    setSeriesPickerItemId(null);
  };

  // ---------------- DISCOUNT DETAILS ----------------
  const handleOpenDiscountDetailsDialog = (itemId: string) => {
    const item = editorQueue.find((i) => i.id === itemId);
    const llm = item?.result?.llmResult?.items?.[0] as any;
    const d = item?.result?.discount as any;
    const englishTitle = d?.en ?? d?.english_name
      ?? item?.result?.title?.en ?? item?.result?.aiTitle?.en ?? "";
    const regularPrice =
      (item?.result?.title as any)?.regularPrice != null
        ? String((item?.result?.title as any).regularPrice)
        : llm?.regular_price != null
          ? String(llm.regular_price)
          : "";
    const salePriceRaw =
      (item?.result?.discount as any)?.salePrice ?? (item?.result?.discount as any)?.price?.display ?? llm?.sale_price;
    const salePrice = salePriceRaw != null ? String(salePriceRaw) : "";
    setDiscountDetailsDialog({ itemId, englishTitle, regularPrice, salePrice });
  };

  const handleSaveDiscountDetails = (
    itemId: string,
    englishTitle: string,
    regularPrice: string,
    salePrice: string
  ) => {
    commitNow("Edit title/price text", [department]);
    const item = editorQueue.find((i) => i.id === itemId);
    if (!item?.result) return;
    const priceDisplay = salePrice.trim()
      ? salePrice.trim().startsWith("$") ? salePrice.trim() : `$${salePrice.trim()}`
      : "";
    updateItem(itemId, {
      result: {
        ...item.result,
        title: {
          ...item.result.title,
          en: englishTitle.trim(),
          regularPrice: regularPrice.trim(),
          confidence: (item.result.title as any)?.confidence ?? "high",
          source: "deepseek",
        } as any,
        aiTitle: {
          ...(item.result.aiTitle as any),
          en: englishTitle.trim(),
          confidence: (item.result.aiTitle as any)?.confidence ?? "high",
          source: "deepseek",
        },
        discount: {
          ...(item.result.discount as any),
          en: englishTitle.trim(),
          price: { display: priceDisplay },
          regularPrice: regularPrice.trim(),
        },
      },
    });
    // Sync the discount label so the canvas reflects the edit immediately
    setDiscountLabels(prev => prev.map(l => {
      if (l.id !== itemId) return l;
      const existingSize = l.title?.size ?? (item.result?.discount as any)?.size ?? "";
      return {
        ...l,
        title: { en: englishTitle.trim(), zh: l.title?.zh ?? "", size: existingSize, regularPrice: regularPrice.trim() },
        price: { ...l.price, display: priceDisplay, regular: regularPrice.trim() },
      };
    }));
    setDiscountDetailsDialog(null);
  };

  // ---------------- BANNER DAYS ----------------
  const handleOpenBannerDaysDialog = (itemId: string) => {
    const label = discountLabels.find(l => l.id === itemId);
    setBannerDaysDialog({ itemId, currentDays: label?.price?.days ?? [] });
  };

  const handleSaveBannerDays = (itemId: string, days: string[]) => {
    commitNow("Edit banner days", [department]);
    setDiscountLabels(prev => prev.map(l =>
      l.id === itemId ? { ...l, price: { ...l.price, display: l.price?.display ?? "", days } } : l
    ));
    setBannerDaysDialog(null);
  };

  // ---------------- ADD ITEM FROM MODAL (generates label if discount data present) ----------------
  const handleAddItemFromModal = async (item: IngestItem) => {
    commitNow("Add product", [department]);
    addItem(item);
    const disc = (item.result?.discount as any);
    if (disc?.price?.display || disc?.salePrice) {
      try {
        const labels = await window.ufm.exportDiscountImages([item]);
        if (labels?.[0]) setDiscountLabels((prev: any[]) => [...prev, labels[0]]);
      } catch { /* label render failed — item still added without label */ }
    }
  };

  // ---------------- REMOVE SINGLE ITEM FROM SLOT/CARD ----------------
  const handleRemoveItem = (id: string) => {
    commitNow("Remove item", [department]);
    // For card-based departments: unlink item from its card
    if (isDeptCardBased()) {
      setCardLayouts(prev => {
        const layout = prev[department];
        if (!layout) return prev;
        const updated = layout.map(c =>
          c.itemId === id ? { ...c, itemId: undefined } : c
        );
        return { ...prev, [department]: updated };
      });
    } else {
      // Slot-based: existing slot reassignment logic
      const assigned = new Map<number, string>();
      for (const item of editorQueue) {
        if (item.slotIndex !== undefined) {
          assigned.set(item.slotIndex, item.id);
        }
      }
      let nextSlot = 0;
      for (const item of editorQueue) {
        if (item.slotIndex === undefined) {
          while (assigned.has(nextSlot)) nextSlot++;
          assigned.set(nextSlot, item.id);
          updateItem(item.id, { slotIndex: nextSlot });
          nextSlot++;
        }
      }
    }

    remove(id);
    setDiscountLabels((prev) => prev.filter((l) => l.id !== id));
  };

  // ---------------- SUB-IMAGE OVERRIDES ----------------
  const handleSubImageUpdate = (itemId: string, subIdx: number, patch: { scale?: number; rotation?: number; x?: number; y?: number; cropLeft?: number; cropRight?: number; cropTop?: number; cropBottom?: number }) => {
    const item = editorQueue.find((i: any) => i.id === itemId);
    if (!item?.result) return;
    const existing: Array<{ scale?: number; rotation?: number; x?: number; y?: number; cropLeft?: number; cropRight?: number; cropTop?: number; cropBottom?: number }> = item.result.subImageOverrides ?? [];
    const updated = [...existing];
    while (updated.length <= subIdx) updated.push({});
    updated[subIdx] = { ...updated[subIdx], ...patch };
    updateItem(itemId, { result: { ...item.result, subImageOverrides: updated } });
  };

  const handleDeleteSubImage = (itemId: string, subIdx: number) => {
    const item = editorQueue.find((i: any) => i.id === itemId);
    if (!item?.result) return;
    const paths: string[] | undefined = item.result.cutoutPaths;
    if (!paths || paths.length <= 1) {
      handleRemoveItem(itemId);
      return;
    }
    const newPaths = paths.filter((_: string, i: number) => i !== subIdx);
    const newOverrides = (item.result.subImageOverrides ?? []).filter((_: any, i: number) => i !== subIdx);
    updateItem(itemId, {
      result: {
        ...item.result,
        cutoutPath: newPaths[0],
        cutoutPaths: newPaths.length > 1 ? newPaths : undefined,
        subImageOverrides: newOverrides.length > 0 ? newOverrides : undefined,
      },
    });
  };

  // Remove item from queue + labels only (no card layout change).
  // Used by merge logic which handles the card layout itself.
  const removeItemFromQueue = useCallback((id: string) => {
    remove(id);
    setDiscountLabels((prev) => prev.filter((l) => l.id !== id));
  }, [remove]);

  const handleDeleteDraft = async () => {
    if (!viewingJob) return;

    const confirmed = await window.ufm.showConfirmDialog({
      message: `Delete draft "${viewingJob.name}"?`,
      detail: "This action cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    deleteJob(viewingJob.id);

    setViewingJob(null);
    loadItems([]);
    setDiscountLabels([]);
    setView("queue");
  };

  const handleAbortJob = () => {
    if (!viewingJob) return;
    window.ufm.cancelJob(viewingJob.id);
  };

  // ---------------- ADD PRODUCT FROM DIALOG ----------------
  const handleAddProductFromDialog = async (data: AddProductData) => {
    if (data.mode === "batch") {
      // Batch images: run through the full OCR+AI pipeline
      if (data.imagePaths.length > 0) {
        await enqueue(data.imagePaths);
      }
      return;
    }

    // Single mode
    const { imagePath, title, zh, size, salePrice, regularPrice } = data;
    const hasImage = imagePath.length > 0;
    const hasTitle = title.trim().length > 0 || zh.trim().length > 0;
    const hasPrice = salePrice.length > 0 || regularPrice.length > 0;

    // Image only with no manual fields → let the full OCR+AI pipeline handle everything
    if (hasImage && !hasTitle && !hasPrice) {
      await enqueue([imagePath]);
      return;
    }

    // --- Step 1: determine the best cutout image to use ---
    let cutoutPath = "";
    let ingestResult: any = null;

    if (hasImage) {
      // User-provided image: run through background-removal pipeline
      try {
        ingestResult = await window.ufm.ingestPhoto(imagePath);
        cutoutPath = ingestResult?.cutoutPath || imagePath;
      } catch {
        cutoutPath = imagePath; // fallback to raw path
      }
    } else if (hasTitle) {
      // No image: search the product DB for a matching cutout
      try {
        const results = await window.ufm.searchDatabaseByText(title.trim() || zh.trim());
        const best = results?.[0];
        if (best && best.score > 0.5 && best.publicUrl) {
          cutoutPath = best.publicUrl;
        }
      } catch { /* no DB match — proceed without image */ }
    }

    // --- Step 2: build the synthetic IngestItem ---
    const priceDisplay = salePrice ? `$${salePrice}` : "";
    const syntheticItem: IngestItem = {
      id: uuidv4(),
      path: imagePath || cutoutPath,
      status: "done",
      result: {
        inputPath: imagePath || cutoutPath,
        cutoutPath,
        layout: ingestResult?.layout ?? { size: "medium" },
        title: { en: title.trim(), zh: zh.trim(), size: size.trim(), confidence: "high", source: "manual" },
        aiTitle: { en: title.trim(), zh: zh.trim(), size: size.trim(), confidence: "high", source: "manual" },
        ocr: ingestResult?.ocr ?? [],
        llmResult: hasPrice ? {
          best_title: { english_name: title.trim(), chinese_name: zh.trim(), confidence: 1 },
          items: [{
            english_name: title.trim(),
            chinese_name: zh.trim(),
            size: size.trim(),
            sale_price: salePrice,
            regular_price: regularPrice,
            unit: "",
            quantity: null,
          }],
        } : (ingestResult?.llmResult ?? null),
        discount: hasPrice ? {
          en: title.trim(),
          zh: zh.trim(),
          size: size.trim(),
          salePrice,
          regularPrice,
          unit: "",
          quantity: null,
          price: priceDisplay ? { display: priceDisplay } : undefined,
        } : undefined,
      },
    };
    addItem(syntheticItem);

    // --- Step 3: generate discount label if price was provided ---
    if (hasPrice) {
      try {
        const labels = await window.ufm.exportDiscountImages([syntheticItem]);
        if (labels?.[0]) {
          setDiscountLabels((prev: any[]) => [...prev, labels[0]]);
        }
      } catch { /* label render failed — item still visible without label */ }
    }
  };

  // ---------------- ADD PRODUCT FROM DISCOUNT (XLSX / TEXT) ----------------
  // Delegates to JobProcessor (same pipeline as job queue view):
  // DB search → Serper fallback → rembg → shadow.
  // Items stream into the editor via onJobItemComplete as they finish.
  const handleAddProductFromDiscount = async (items: any[]) => {
    setOriginalDiscounts(prev => [...prev, ...items]);
    setVerificationDone(false);
    setVerificationProgress(null);
    setEditorImportActive(true);
    setEditorImportProgress({ done: 0, total: items.length });

    const jobId = crypto.randomUUID();
    editorImportJobIdRef.current = jobId;
    const job: FlyerJob = {
      id: jobId,
      name: "Editor import",
      department: department as DepartmentId,
      templateId,
      images: [],
      discount: {
        type: "xlsx",
        source: "editor_import",
        parsedItems: items,
        status: "done",
      },
      status: "queued",
      createdAt: Date.now(),
      startedAt: Date.now(),
      progress: { totalImages: items.length, processedImages: 0, currentStep: "Queued" },
    };

    const unsubFns: (() => void)[] = [];
    const cleanup = () => {
      setEditorImportActive(false);
      setEditorImportProgress({ done: 0, total: 0 });
      editorImportJobIdRef.current = null;
      unsubFns.forEach(fn => fn());
    };

    unsubFns.push(
      window.ufm.onJobItemComplete(({ jobId: jid, processedImage, index, total }: any) => {
        if (jid !== jobId) return;
        if (processedImage?.id) addItem(processedImage as IngestItem);
        setEditorImportProgress({ done: index + 1, total });
      })
    );

    unsubFns.push(
      window.ufm.onJobComplete(({ jobId: jid, result }: any) => {
        if (jid !== jobId) return;
        if (result?.discountLabels?.length) {
          setDiscountLabels((prev: any[]) => [...prev, ...result.discountLabels]);
        }
        const count = Array.isArray(result?.processedImages) ? result.processedImages.length : null;
        setToastState({
          visible: true,
          message: count != null
            ? `Automation complete — ${count} product${count === 1 ? "" : "s"} ready`
            : "Flyer automation complete",
          variant: "success",
        });
        cleanup();
      })
    );

    unsubFns.push(
      window.ufm.onJobError(({ jobId: jid }: any) => {
        if (jid !== jobId) return;
        cleanup();
      })
    );

    await window.ufm.startJob(job).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err ?? "Automation failed to start");
      setToastState({ visible: true, message, variant: "error" });
      cleanup();
    });
  };

  // ---------------- CLEAR DEPARTMENT (wipe all products) ----------------
  const handleClearDepartment = () => {
    commitNow("Clear department", [department]);
    if (viewingJob && (viewingJob.status === "processing" || viewingJob.status === "queued")) {
      window.ufm.cancelJob(viewingJob.id);
    }
    suppressEmptyCardLayoutRef.current = true;
    xlsxItemsLoadedRef.current = true;
    prevCardItemIdsRef.current = new Set();
    setSelectedItemId(null);
    loadItems([]);
    setDiscountLabels([]);
    setOriginalDiscounts([]);
    setVerificationDone(false);
    setVerificationProgress(null);
    setDepartmentLocked(false);
    setSlotOverrides({});
    // Clear card layouts for this department
    setCardLayouts(prev => {
      const next = { ...prev };
      delete next[department];
      return next;
    });
    clearDepartmentDraft(templateId, department);
  };

  // ---------------- CLEAR ALL DEPARTMENTS ----------------
  const handleClearAllDepartments = () => {
    const jobsToDelete = jobs.filter(j => j.templateId === templateId);
    // #region agent log
    const debugPayload = { editorQueueLen: editorQueue.length, jobsToDeleteLen: jobsToDelete.length, templateId, viewingJobId: viewingJob?.id ?? null, replacementJobsLen: replacementJobs.length };
    (window as any).ufm?.debugLog?.({ sessionId: 'c3b215', location: 'App.tsx:handleClearAllDepartments', message: 'handler invoked', data: debugPayload, hypothesisId: 'B', runId: 'post-fix-v3' });
    fetch('http://127.0.0.1:7361/ingest/57de729c-1f3f-4911-afe7-7b1a23fd9ad6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c3b215'},body:JSON.stringify({sessionId:'c3b215',location:'App.tsx:handleClearAllDepartments',message:'handler invoked',data:debugPayload,timestamp:Date.now(),hypothesisId:'B',runId:'post-fix-v3'})}).catch(()=>{});
    // #endregion

    // Cancel in-flight background work before wiping state
    for (const j of replacementJobs) {
      (window as any).ufm?.cancelReplacementJob?.(j.id);
    }
    if (editorImportJobIdRef.current) {
      window.ufm.cancelJob(editorImportJobIdRef.current).catch(() => {});
    }
    jobsToDelete.forEach(j => {
      if (j.status === "processing" || j.status === "queued") {
        window.ufm.cancelJob(j.id);
      }
    });

    // Stop editor→job sync before wiping state
    setViewingJob(null);
    editorImportJobIdRef.current = null;
    setEditorImportActive(false);
    setEditorImportProgress({ done: 0, total: 0 });
    suppressEmptyCardLayoutRef.current = true;
    xlsxItemsLoadedRef.current = true;
    prevCardItemIdsRef.current = new Set();
    setSelectedItemId(null);
    loadItems([]);
    setDiscountLabels([]);
    setOriginalDiscounts([]);
    setVerificationDone(false);
    setVerificationProgress(null);
    setDepartmentLocked(false);
    setSlotOverrides({});
    setCardLayouts({});
    setUserRowCounts({});
    setReplacementJobs([]);
    availableDepartments.forEach(dept => clearDepartmentDraft(templateId, dept));
    deleteJobsForTemplate(templateId);
    commitNow("Clear all departments", ["*"]);
    setCanvasKey(k => k + 1);
    clearAllVerifyRef.current = true;
    // #region agent log
    (window as any).ufm?.debugLog?.({ sessionId: 'c3b215', location: 'App.tsx:handleClearAllDepartments:end', message: 'handler finished', data: { deletedJobs: jobsToDelete.length, templateId }, hypothesisId: 'D', runId: 'post-fix-v3' });
    // #endregion
  };

  const handleToggleLock = async () => {
    if (departmentLocked) {
      const ok = await window.ufm.showConfirmDialog({
        message: "Unlock this department?",
        detail: "You will need to re-verify before locking again.",
        confirmLabel: "Unlock",
        cancelLabel: "Cancel",
      });
      if (!ok) return;
      setDepartmentLocked(false);
      setVerificationDone(false);
    } else {
      setDepartmentLocked(true);
      handleSaveCombination();
    }
  };

  const dbSearchInitialQuery = (() => {
    if (!dbSearchItemId) return "";
    const item = editorQueue.find((i) => i.id === dbSearchItemId);
    const d = item?.result?.discount as any;
    return d?.en ?? d?.english_name
      ?? item?.result?.title?.en
      ?? item?.result?.aiTitle?.en ?? "";
  })();

  const googleSearchInitialQuery = (() => {
    if (!googleSearchItemId) return "";
    const item = editorQueue.find((i) => i.id === googleSearchItemId);
    const d = item?.result?.discount as any;
    return d?.en ?? d?.english_name
      ?? item?.result?.title?.en
      ?? (item?.result?.aiTitle as any)?.en ?? "";
  })();

  const googleSearchIsMultiFlavor = (() => {
    if (!googleSearchItemId) return false;
    const item = editorQueue.find((i) => i.id === googleSearchItemId);
    return Array.isArray(item?.result?.cutoutPaths) && (item!.result!.cutoutPaths as string[]).length > 1;
  })();

  // Effective row count for the toolbar rows control
  const effectiveRowCount = currentCardLayout && currentCardLayout.length > 0
    ? Math.max(...currentCardLayout.map((c) => c.row)) + 1
    : (userRowCounts[department] ?? 1);

  // Effective col count = max cards in any single row (for Flip control)
  const effectiveColCount = currentCardLayout && currentCardLayout.length > 0
    ? Math.max(...currentCardLayout.map((c) => c.order + 1))
    : 1;

  // ---------------- WORKFLOW PROGRESS BAR ----------------
  const allVerified =
    availableDepartments.length > 0 &&
    availableDepartments.every(dept =>
      jobs.some(j => j.templateId === selectedTemplateId && j.department === dept && j.result?.departmentLocked)
    );

  // 4 = past last step → all dots show as completed (green)
  const workflowStep =
    flyerExported ? 4
    : view === "templateSelect" ? 0
    : view === "queue" ? (allVerified ? 3 : 1)
    : view === "editor" ? (departmentLocked ? 3 : 2)
    : 1;

  const handleSaveCombination = () => {
    if (departmentSaves.some(e => e.dept === department && e.status === "saving")) return;
    const payload = editorQueue
      .filter((item: any) => item.result?.cutoutPath)
      .map((item: any) => ({
        id: item.id,
        imagePath: item.result.cutoutPath as string,
        en: (item.result?.title?.en ?? item.result?.discount?.en ?? "") as string,
        zh: (item.result?.title?.zh ?? item.result?.discount?.zh ?? "") as string,
        size: (item.result?.title?.size ?? item.result?.discount?.size ?? "") as string,
        salePrice: (item.result?.discount?.salePrice ?? "") as string,
        regularPrice: (item.result?.discount?.regularPrice ?? "") as string,
        unit: (item.result?.discount?.unit ?? "") as string,
        quantity: (item.result?.discount?.quantity ?? null) as number | null,
        department,
      }));
    if (payload.length === 0) {
      setToastState({ visible: true, message: "No items with images to save", variant: "error" });
      return;
    }
    setDepartmentSaves(prev => [...prev, { dept: department, done: 0, total: payload.length, status: "saving" }]);
    window.ufm.saveCombinationToDb(payload);
  };

  const [triggerExport, setTriggerExport] = useState(false);

  const handleOpenManual = useCallback((chapterId?: string) => {
    window.ufm.openManualWindow(chapterId);
  }, []);

  const handleWorkflowHelp = useCallback(() => {
    let chapter = "overview";
    if (view === "queue") {
      chapter = workflowStep >= 3 ? "export" : "upload";
    } else if (view === "editor") {
      if (departmentLocked) chapter = "lock";
      else if (verificationDone) chapter = "verify";
      else chapter = "editor";
    }
    handleOpenManual(chapter);
  }, [view, workflowStep, departmentLocked, verificationDone, handleOpenManual]);

  const handleWorkflowNavigate = (step: number) => {
    if (step === 3 /* editor */) {
      const isRunning = jobs.some(j => j.status === "processing" || j.status === "queued");
      if (isRunning) {
        setToastState({ visible: true, message: "Please wait for the pipeline to finish before opening the editor.", variant: "error" });
        return;
      }
    }
    // Clean up editor state when leaving the editor view
    if (view === "editor" && step !== 3) {
      // Flush pending editor state to the job before clearing viewingJob, so the
      // effect (which guards on viewingJob) doesn't skip the last unsaved changes.
      if (viewingJob) {
        syncJobFromEditorItems(viewingJob.id, editorQueue, discountLabels, slotOverrides, cardLayouts, userRowCounts, verificationDone, verificationProgress, departmentLocked);
      }
      setViewingJob(null);
      setToastState(prev => ({ ...prev, visible: false }));
      editorSyncRunCount.current = 0;
    }
    if (step === 0) setView("templateSelect");
    else if (step === 1 || step === 2) setView("queue");
    else if (step === 3) {
      if (viewingJob) setView("editor");
      else setView("queue");
    }
  };

  const handleProgressBarExport = () => {
    if (view === "editor") {
      // Flush pending editor state to the job before clearing viewingJob.
      if (viewingJob) {
        syncJobFromEditorItems(viewingJob.id, editorQueue, discountLabels, slotOverrides, cardLayouts, userRowCounts, verificationDone, verificationProgress, departmentLocked);
      }
      // Fire-and-forget: promote accepted Serper images to the product DB
      const toPromote = serperPromotionRef.current;
      if (toPromote.length > 0) {
        (window as any).ufm.promoteSerperResults(toPromote).catch((err: unknown) =>
          console.warn("[App] promoteSerperResults failed:", err)
        );
        serperPromotionRef.current = [];
      }
      setViewingJob(null);
      editorSyncRunCount.current = 0;
    }
    setView("queue");
    setTriggerExport(true);
  };

  const toolbarBtnBase: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    height: 32, padding: "0 12px",
    border: "none", borderRadius: "var(--radius-sm)",
    fontWeight: 600, fontSize: 13,
    cursor: "pointer", fontFamily: "var(--font-sans)",
    whiteSpace: "nowrap",
  };
  const rowBtnStyle: React.CSSProperties = {
    width: 26, height: 26, cursor: "pointer",
    borderRadius: 4, border: "1px solid #d1d5db",
    background: "#f9fafb", fontSize: 14, fontWeight: 600,
  };

  // ---------------- RENDER ----------------
  return (
    <ErrorBoundary>
      <RecoveryOverlay visible={showRecoveryOverlay} />
      <div className="app-root">
        {(!chromeCollapsed || view !== "editor") && (
          <>
            <div className="app-header">
              <button
                type="button"
                className="app-logo app-logo-btn"
                onClick={() => setView("home")}
                title="Home"
              >
                <svg className="app-logo-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="4" y="2" width="24" height="28" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <path d="M8 10h16M8 16h12M8 22h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span className="app-logo-text">Ultimate Flyer Maker</span>
              </button>
              <button
                type="button"
                className="app-quit-btn"
                onClick={() => window.ufm.requestQuit()}
                title="Quit application (your drafts are saved)"
              >
                Quit
              </button>
            </div>

            {view !== "setup" && view !== "home" && view !== "db-upload" && view !== "settings" && view !== "importTemplate" && view !== "templateSelect" && (
              <WorkflowProgressBar
                currentStep={workflowStep}
                onNavigate={handleWorkflowNavigate}
                onExportClick={allVerified ? handleProgressBarExport : undefined}
                onHelpClick={handleWorkflowHelp}
              />
            )}
          </>
        )}

        {view === "setup" && (
          <SetupView onComplete={() => setView("home")} />
        )}

        {view === "home" && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 48, padding: "48px 32px",
            background: "var(--color-bg, #f8fafc)",
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
                What would you like to do?
              </div>
              <div style={{ fontSize: 15, color: "#64748b" }}>Choose an option to get started</div>
            </div>

            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", justifyContent: "center" }}>
              {/* Make a Flyer */}
              <button
                onClick={() => setView("templateSelect")}
                style={{
                  width: 280, padding: "40px 32px",
                  background: "#fff", border: "2px solid #e2e8f0",
                  borderRadius: 16, cursor: "pointer", textAlign: "left",
                  display: "flex", flexDirection: "column", gap: 16,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  transition: "border-color 150ms, box-shadow 150ms",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#4C6EF5"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(76,110,245,0.15)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 12,
                  background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4C6EF5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Make a Flyer</div>
                  <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
                    Upload discounts, match products, and export a flyer PDF.
                  </div>
                </div>
              </button>

              {/* Product Library */}
              <button
                onClick={() => setView("db-upload")}
                style={{
                  width: 280, padding: "40px 32px",
                  background: "#fff", border: "2px solid #e2e8f0",
                  borderRadius: 16, cursor: "pointer", textAlign: "left",
                  display: "flex", flexDirection: "column", gap: 16,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  transition: "border-color 150ms, box-shadow 150ms",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#22c55e"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(34,197,94,0.15)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 12,
                  background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Product Library</div>
                  <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
                    Upload and manage your product image database.
                  </div>
                </div>
              </button>
            </div>

            {/* Utility buttons — smaller and visually distinct from the main cards */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => handleOpenManual()}
                title="Open the operator user manual"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 6,
                  border: "1px solid #d1d5db", background: "#fff",
                  color: "#6b7280", fontSize: 12, fontWeight: 500,
                  cursor: "pointer", transition: "border-color 150ms, color 150ms",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#4C6EF5"; (e.currentTarget as HTMLButtonElement).style.color = "#4C6EF5"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#d1d5db"; (e.currentTarget as HTMLButtonElement).style.color = "#6b7280"; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                User Manual
              </button>
              <button
                onClick={() => window.ufm.openLogFile()}
                title="Open the application log file"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 6,
                  border: "1px solid #d1d5db", background: "#fff",
                  color: "#6b7280", fontSize: 12, fontWeight: 500,
                  cursor: "pointer", transition: "border-color 150ms, color 150ms",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#9ca3af"; (e.currentTarget as HTMLButtonElement).style.color = "#374151"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#d1d5db"; (e.currentTarget as HTMLButtonElement).style.color = "#6b7280"; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
                Open Log
              </button>
              <button
                onClick={() => { setSettingsReturnView("home"); setView("settings"); }}
                title="Open settings"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 6,
                  border: "1px solid #d1d5db", background: "#fff",
                  color: "#6b7280", fontSize: 12, fontWeight: 500,
                  cursor: "pointer", transition: "border-color 150ms, color 150ms",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#9ca3af"; (e.currentTarget as HTMLButtonElement).style.color = "#374151"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#d1d5db"; (e.currentTarget as HTMLButtonElement).style.color = "#6b7280"; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Settings
              </button>
            </div>
          </div>
        )}

        {view === "templateSelect" && (
          <TemplateSelectView
            jobs={jobs}
            onSelect={id => {
              setTemplateId(id);
              setSelectedTemplateId(id);
              setView("queue");
            }}
            onCreateNew={() => { setEditingTemplate(null); setView("importTemplate"); }}
            onEdit={template => { setEditingTemplate(template); setView("importTemplate"); }}
          />
        )}

        {view === "importTemplate" && (
          <ImportTemplateFromImagesDialog
            initialConfig={editingTemplate ?? undefined}
            onParsed={async config => {
              await saveCustomTemplateWithAssets(config);
              setEditingTemplate(null);
              setTemplateId(config.templateId);
              setSelectedTemplateId(config.templateId);
              setView("queue");
            }}
            onClose={() => { setEditingTemplate(null); setView("templateSelect"); }}
          />
        )}

        {view === "queue" && (
          <JobQueueView
            templateId={selectedTemplateId}
            onBack={() => setView("home")}
            onViewFlyer={handleViewFlyer}
            onOpenDraft={handleOpenDraft}
            jobQueueHook={jobQueueHook}
            onExportDone={() => {
              setFlyerExported(true);
              // Promote any Serper images that were in the editor at export time
              const toPromote = serperPromotionRef.current;
              if (toPromote.length > 0) {
                (window as any).ufm.promoteSerperResults(toPromote).catch((err: unknown) =>
                  console.warn("[App] promoteSerperResults failed:", err)
                );
                serperPromotionRef.current = [];
              }
            }}
            triggerExport={triggerExport}
            onTriggerExportConsumed={() => setTriggerExport(false)}
          />
        )}

        <div style={{ display: view === "db-upload" ? "block" : "none" }}>
          <DbUploadView onBack={() => setView("home")} />
        </div>

        {view === "settings" && (
          <SettingsView onBack={() => setView(settingsReturnView)} />
        )}

        <DraftSavedToast
          visible={toastState.visible}
          message={toastState.message}
          variant={toastState.variant}
          duration={toastState.variant === "error" ? 5000 : 12500}
          onHide={() => setToastState(prev => ({ ...prev, visible: false }))}
          canUndo={view === "editor" && canUndo}
          onUndo={view === "editor" ? undo : undefined}
          canRedo={view === "editor" && canRedo}
          onRedo={view === "editor" ? redo : undefined}
        />

        {view === "editor" && (
          <>
                {/* Primary toolbar */}
                <div style={{
                  display: "flex", alignItems: "center",
                  background: "#fff",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "6px 10px",
                  gap: 4,
                  marginBottom: 8,
                  pointerEvents: isEditorAutomationActive ? "none" : "auto",
                  opacity: isEditorAutomationActive ? 0.55 : 1,
                  transition: "opacity 0.15s",
                }}>
                  {/* Viewing label */}
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {viewingJob?.name ?? (DEPT_LABELS[department] ?? department.replace(/_/g, " "))}
                  </span>
                  <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px", flexShrink: 0 }} />
                  {/* Department picker */}
                  <EditorSidebar
                    isOpen={sidebarOpen}
                    onToggle={() => setSidebarOpen((o) => !o)}
                    departments={availableDepartments}
                    activeDepartment={department}
                    onDepartmentChange={handleEditorDepartmentChange}
                    itemCount={editorQueue.length}
                    onClear={departmentLocked ? undefined : handleClearDepartment}
                    onClearAll={departmentLocked ? undefined : handleClearAllDepartments}
                  />

                  {/* Separator */}
                  <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />

                  {/* Left panel toggle (Images / History) */}
                  <div style={{ position: "relative", display: "flex", alignItems: "stretch" }}>
                    <button
                      onClick={() => setLeftPanelOpen(o => !o)}
                      title={leftPanelTab === "images" ? "Image library" : "Edit history"}
                      style={{
                        ...toolbarBtnBase,
                        borderTopRightRadius: 0,
                        borderBottomRightRadius: 0,
                        background: leftPanelOpen ? "#eff6ff" : "transparent",
                        border: leftPanelOpen ? "1px solid #93c5fd" : "1px solid transparent",
                        borderRight: leftPanelOpen ? "none" : undefined,
                        color: leftPanelOpen ? "#2563eb" : "#6b7280",
                      }}
                      onMouseEnter={(e) => { if (!leftPanelOpen) e.currentTarget.style.background = "#f3f4f6"; }}
                      onMouseLeave={(e) => { if (!leftPanelOpen) e.currentTarget.style.background = leftPanelOpen ? "#eff6ff" : "transparent"; }}
                    >
                      ▤ {leftPanelTab === "images" ? "Images" : "History"}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setLeftPanelMenuOpen(o => !o); }}
                      title="Choose panel"
                      style={{
                        ...toolbarBtnBase,
                        padding: "0 6px",
                        borderTopLeftRadius: 0,
                        borderBottomLeftRadius: 0,
                        background: leftPanelOpen ? "#eff6ff" : "transparent",
                        border: leftPanelOpen ? "1px solid #93c5fd" : "1px solid transparent",
                        color: leftPanelOpen ? "#2563eb" : "#6b7280",
                        fontSize: 10,
                      }}
                    >
                      ▾
                    </button>
                    {leftPanelMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                        position: "absolute", top: "100%", left: 0, marginTop: 4,
                        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.12)", zIndex: 100, minWidth: 120,
                        overflow: "hidden",
                      }}>
                        {(["images", "history"] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => {
                              setLeftPanelTab(t);
                              setLeftPanelOpen(true);
                              setLeftPanelMenuOpen(false);
                            }}
                            style={{
                              display: "block", width: "100%", textAlign: "left",
                              padding: "8px 12px", border: "none", background: leftPanelTab === t ? "#eff6ff" : "#fff",
                              cursor: "pointer", fontSize: 13, color: "#374151",
                              fontWeight: leftPanelTab === t ? 600 : 400,
                            }}
                          >
                            {t === "images" ? "Images" : "History"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  {!departmentLocked && <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />}
                  {!departmentLocked && (
                    <button
                      onClick={() => setShowAddProductDialog(true)}
                      style={{ ...toolbarBtnBase, background: "var(--color-success)", color: "#fff" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#237032"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-success)"; }}
                    >
                      <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 700 }}>+</span>
                      Add Product
                    </button>
                  )}
                  {!departmentLocked && editorQueue.length > 0 && (
                    isDeptCardBased() ? (
                      <div style={{
                        display: "flex",
                        background: "#f0f1f3",
                        borderRadius: 8,
                        padding: 3,
                        gap: 2,
                      }}>
                        <button
                          onClick={() => setEditMode(v => !v)}
                          style={{
                            height: 26, padding: "0 12px",
                            border: "none", borderRadius: 6,
                            background: editMode ? "#fff" : "transparent",
                            boxShadow: editMode ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
                            color: editMode ? "#2563eb" : "#6b7280",
                            fontWeight: 600, fontSize: 13,
                            cursor: "pointer", fontFamily: "var(--font-sans)",
                            whiteSpace: "nowrap",
                            transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
                          }}
                          title={editMode ? "Exit edit mode (Escape)" : "Enter edit mode to resize elements"}
                        >
                          ✏ Edit Mode
                        </button>
                        <button
                          onClick={() => {
                            if (editMode) return;
                            if (verificationDone) {
                              setVerificationDone(false);
                              setVerificationProgress(null);
                            }
                            setShowCheckingPanel(true);
                          }}
                          style={{
                            height: 26, padding: "0 12px",
                            border: "none", borderRadius: 6,
                            background: !editMode && verificationDone ? "#fff" : "transparent",
                            boxShadow: !editMode && verificationDone ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
                            color: editMode ? "#9ca3af" : verificationDone ? "#15803d" : "#6b7280",
                            fontWeight: 600, fontSize: 13,
                            cursor: editMode ? "not-allowed" : "pointer",
                            fontFamily: "var(--font-sans)",
                            whiteSpace: "nowrap",
                            transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
                          }}
                          title={editMode ? "Exit edit mode first" : verificationDone ? "Verification complete — click to re-verify" : "Verify products"}
                        >
                          {verificationDone ? "✓ Verified" : "✓ Verify"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (verificationDone) {
                            setVerificationDone(false);
                            setVerificationProgress(null);
                          }
                          setShowCheckingPanel(true);
                        }}
                        style={{
                          ...toolbarBtnBase,
                          border: verificationDone ? "1.5px solid #16a34a" : "none",
                          background: verificationDone ? "#dcfce7" : "#7c3aed",
                          color: verificationDone ? "#15803d" : "#fff",
                          transition: "background 0.2s, color 0.2s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = verificationDone ? "#bbf7d0" : "#6d28d9"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = verificationDone ? "#dcfce7" : "#7c3aed"; }}
                        title={verificationDone ? "Verification complete — click to re-verify" : "Verify products"}
                      >
                        {verificationDone ? "✓ Verified" : "✓ Verify"}
                      </button>
                    )
                  )}
                  {verificationDone && (
                    <button
                      onClick={handleToggleLock}
                      style={{ ...toolbarBtnBase, background: departmentLocked ? "#dc2626" : "#b45309", color: "#fff", transition: "background 0.2s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = departmentLocked ? "#b91c1c" : "#92400e"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = departmentLocked ? "#dc2626" : "#b45309"; }}
                      title={departmentLocked ? "Click to unlock this department" : "Lock this department"}
                    >
                      {departmentLocked ? "🔒 Locked" : "🔒 Lock Department"}
                    </button>
                  )}

                  {/* Right: Rows control */}
                  {isDeptCardBased() && !departmentLocked && editorQueue.length > 0 && (
                    <>
                      <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
                      <span style={{ fontSize: 13, color: "#555", whiteSpace: "nowrap" }}>Rows:</span>
                      <button onClick={() => handleRowCountChange(Math.max(1, effectiveRowCount - 1))} style={rowBtnStyle}>−</button>
                      <span style={{ minWidth: 18, textAlign: "center", fontSize: 13, fontWeight: 600 }}>{effectiveRowCount}</span>
                      <button onClick={() => handleRowCountChange(effectiveRowCount + 1)} style={rowBtnStyle}>+</button>
                      <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 4px" }} />
                      <span style={{ fontSize: 13, color: "#555", whiteSpace: "nowrap" }}>Cols:</span>
                      <button onClick={() => handleColCountChange(Math.max(1, effectiveColCount - 1))} style={rowBtnStyle}>−</button>
                      <span style={{ minWidth: 18, textAlign: "center", fontSize: 13, fontWeight: 600 }}>{effectiveColCount}</span>
                      <button onClick={() => handleColCountChange(effectiveColCount + 1)} style={rowBtnStyle}>+</button>
                      <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 4px" }} />
                      <button
                        onClick={handleFlipLayout}
                        disabled={effectiveRowCount === effectiveColCount}
                        title={effectiveRowCount !== effectiveColCount ? `Flip layout: switch to ${effectiveColCount} row${effectiveColCount !== 1 ? "s" : ""} × ${effectiveRowCount} col${effectiveRowCount !== 1 ? "s" : ""}` : "Layout is already square"}
                        style={{ ...rowBtnStyle, width: "auto", padding: "0 8px", fontSize: 13, opacity: effectiveRowCount === effectiveColCount ? 0.4 : 1 }}
                      >
                        ⇄ Flip
                      </button>
                    </>
                  )}

                  {/* Abort / Delete Draft — from former EditorHeader */}
                  {(viewingJob?.status === "processing" || viewingJob?.status === "queued") && (
                    <button
                      type="button"
                      onClick={handleAbortJob}
                      style={{ ...toolbarBtnBase, background: "#dc2626", color: "#fff", marginLeft: 4 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#b91c1c"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#dc2626"; }}
                    >
                      Abort
                    </button>
                  )}
                  {viewingJob?.status === "drafting" && (
                    <button
                      type="button"
                      onClick={handleDeleteDraft}
                      style={{ ...toolbarBtnBase, background: "#dc2626", color: "#fff", marginLeft: 4 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#b91c1c"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#dc2626"; }}
                    >
                      Delete Draft
                    </button>
                  )}

                  {/* Chrome collapse toggle */}
                  <div style={{ marginLeft: "auto" }} />
                  <button
                    type="button"
                    onClick={toggleChrome}
                    title={chromeCollapsed ? "Show header & progress bar" : "Hide header & progress bar"}
                    style={{
                      padding: "3px 8px", border: "1px solid var(--color-border)",
                      borderRadius: 4, background: "none", cursor: "pointer",
                      fontSize: 12, color: "#868E96", lineHeight: 1, flexShrink: 0,
                    }}
                  >
                    {chromeCollapsed ? "▼" : "▲"}
                  </button>
                </div>

                <div className={`ufm-editor-canvas-viewport${isEditorAutomationActive ? " ufm-editor-canvas-viewport--locked" : ""}${chromeCollapsed ? " ufm-editor-canvas-viewport--chrome-collapsed" : ""}`}
                  style={{ display: "flex", flexDirection: "row", overflow: "hidden" }}
                >
                  {/* Left sidebar — collapses by shrinking width, no overlay */}
                  <div style={{
                    width: leftPanelOpen ? 220 : 0,
                    flexShrink: 0,
                    overflow: "hidden",
                    transition: "width 0.22s ease",
                    borderRight: leftPanelOpen ? "1px solid var(--color-border)" : "none",
                  }}>
                    <div style={{ width: 220, height: "100%" }}>
                      <EditorLeftPanel
                        tab={leftPanelTab}
                        onTabChange={setLeftPanelTab}
                        onClose={() => setLeftPanelOpen(false)}
                        activeDepartment={department}
                        imageItems={allPanelItems}
                        historyEntries={historyEntries}
                        historyCurrentIndex={historyCurrentIndex}
                        onHistoryJumpTo={jumpTo}
                      />
                    </div>
                  </div>
                  {/* Canvas column — takes remaining space, scrolls independently */}
                  <div style={{ flex: 1, position: "relative", overflow: "auto" }}>
                    <EditorAutomationBlocker
                      active={isEditorAutomationActive}
                      message={editorAutomationMessage}
                      progressDone={editorAutomationProgress.done}
                      progressTotal={editorAutomationProgress.total}
                    />
                <EditorCanvas
                  key={canvasKey}
                  editorQueue={editorQueue}
                  templateId={templateId}
                  department={department}
                  discountLabels={discountLabels}
                  flyerWeekStart={viewingJob?.flyerWeekStart}
                  isLocked={departmentLocked}
                  onEnqueue={departmentLocked ? undefined : enqueue}
                  onRemove={departmentLocked ? undefined : remove}
                  onReplaceImage={departmentLocked ? undefined : handleReplaceImage}
                  onRemoveItem={departmentLocked ? undefined : handleRemoveItem}
                  onChooseDatabaseResults={departmentLocked ? undefined : handleChooseDatabaseResults}
                  onGoogleSearch={departmentLocked ? undefined : handleChooseGoogleSearch}
                  onEditTitle={departmentLocked ? undefined : handleOpenDiscountDetailsDialog}
                  onEditBannerDays={departmentLocked ? undefined : handleOpenBannerDaysDialog}
                  onPickSeriesFlavors={departmentLocked ? undefined : setSeriesPickerItemId}
                  onAddItem={departmentLocked ? undefined : handleAddItemFromModal}
                  editMode={editMode}
                  slotOverrides={slotOverrides}
                  onSlotOverridesChange={departmentLocked ? undefined : handleSlotOverridesChange}
                  cardLayout={currentCardLayout}
                  onCardLayoutChange={departmentLocked ? undefined : handleCardLayoutChange}
                  onRemoveFromQueue={departmentLocked ? undefined : removeItemFromQueue}
                  rowCount={userRowCounts[department]}
                  onRowCountChange={departmentLocked ? undefined : handleRowCountChange}
                  onSubImageUpdate={departmentLocked ? undefined : handleSubImageUpdate}
                  onDeleteSubImage={departmentLocked ? undefined : handleDeleteSubImage}
                  onCutoutErased={departmentLocked ? undefined : (id, newPath) => applyCutoutPatch(id, { cutoutPath: newPath })}
                  replacementJobs={replacementJobs}
                  onCancelReplacementJob={cancelReplacementJob}
                  onEnqueueAddProduct={departmentLocked ? undefined : enqueueAddProductFromUrl}
                  onEnqueueAddProductSeries={departmentLocked ? undefined : enqueueAddProductSeries}
                  selectedItemId={selectedItemId}
                  onSelectItem={departmentLocked ? undefined : setSelectedItemId}
                  onPanelImageDrop={departmentLocked ? undefined : handlePanelImageDrop}
                  onApplyTextStyleGlobally={departmentLocked ? undefined : handleApplyTextStyleGlobally}
                  onHistoryCommit={departmentLocked ? undefined : handleHistoryCommit}
                  departmentLabel={DEPT_LABELS[department] ?? department.replace(/_/g, " ")}
                  zoom={canvasZoom}
                />
                  {canvasZoom !== 1.0 && (
                    <div style={{ position: "sticky", bottom: 10, display: "flex", justifyContent: "flex-end", pointerEvents: "none" }}>
                      <div
                        style={{
                          marginRight: 10,
                          background: "rgba(0,0,0,0.55)",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: 4,
                          userSelect: "none",
                          zIndex: 50,
                        }}
                      >
                        {Math.round(canvasZoom * 100)}%
                      </div>
                    </div>
                  )}
                  </div>{/* end canvas column */}
                </div>{/* end canvas viewport */}

                {dbSearchItemId && (() => {
                  const _dbItem = editorQueue.find((i: any) => i.id === dbSearchItemId);
                  return (
                    <DbSearchModal
                      itemId={dbSearchItemId}
                      initialQuery={dbSearchInitialQuery}
                      cutoutPaths={_dbItem?.result?.cutoutPaths}
                      onSelectProduct={enqueueDbReplacementJob}
                      onClose={() => setDbSearchItemId(null)}
                    />
                  );
                })()}

                {googleSearchItemId && (
                  <GoogleSearchModal
                    itemId={googleSearchItemId}
                    initialQuery={googleSearchInitialQuery}
                    currentImageSrc={(() => {
                      const item = editorQueue.find((i) => i.id === googleSearchItemId);
                      const src = item?.result?.cutoutPath ?? item?.result?.inputPath;
                      return src ? `file://${src}` : undefined;
                    })()}
                    isMultiFlavor={googleSearchIsMultiFlavor}
                    jobs={replacementJobs.filter(j => j.itemId === googleSearchItemId)}
                    cutoutPaths={(() => {
                      const _gi = editorQueue.find((i: any) => i.id === googleSearchItemId);
                      return _gi?.result?.cutoutPaths;
                    })()}
                    onDropImage={(url, targetFlavorIndex) =>
                      enqueueReplacementJob(
                        googleSearchItemId,
                        url,
                        googleSearchInitialQuery,
                        googleSearchIsMultiFlavor,
                        targetFlavorIndex,
                      )
                    }
                    onReplace={handleSearchReplace}
                    onClose={() => {
                      if (googleSearchIsMultiFlavor) multiFlavorSessionRef.current.delete(googleSearchItemId);
                      setGoogleSearchItemId(null);
                    }}
                  />
                )}

                {seriesPickerItemId && (() => {
                  const pickerItem = editorQueue.find((i: any) => i.id === seriesPickerItemId);
                  return pickerItem ? (
                    <SeriesFlavorPicker
                      item={pickerItem}
                      onConfirm={handleConfirmSeriesFlavors}
                      onClose={() => setSeriesPickerItemId(null)}
                    />
                  ) : null;
                })()}

                {discountDetailsDialog && (
                  <DiscountDetailsDialog
                    itemId={discountDetailsDialog.itemId}
                    initialEnglishTitle={discountDetailsDialog.englishTitle}
                    initialRegularPrice={discountDetailsDialog.regularPrice}
                    initialSalePrice={discountDetailsDialog.salePrice}
                    onSave={handleSaveDiscountDetails}
                    onClose={() => setDiscountDetailsDialog(null)}
                  />
                )}
                {bannerDaysDialog && (
                  <DaysBannerEditDialog
                    itemId={bannerDaysDialog.itemId}
                    initialDays={bannerDaysDialog.currentDays}
                    onSave={handleSaveBannerDays}
                    onClose={() => setBannerDaysDialog(null)}
                  />
                )}

                {showAddProductDialog && (
                  <AddProductDialog
                    onAdd={handleAddProductFromDialog}
                    onClose={() => setShowAddProductDialog(false)}
                    department={department}
                    onAddFromDiscount={handleAddProductFromDiscount}
                  />
                )}

                {showCheckingPanel && (
                  <CheckingPanel
                    items={editorQueue}
                    discountLabels={discountLabels}
                    originalDiscounts={originalDiscounts}
                    initialProgress={verificationProgress ?? undefined}
                    onProgressChange={setVerificationProgress}
                    onClose={() => setShowCheckingPanel(false)}
                    onComplete={() => { setVerificationDone(true); setVerificationProgress(null); setShowCheckingPanel(false); }}
                    onReplaceImage={handleReplaceImage}
                    onSearchReplace={handleSearchReplace}
                    onDbSelectProduct={enqueueDbReplacementJob}
                    onSaveDiscountDetails={handleSaveDiscountDetails}
                  />
                )}
          </>
        )}
      </div>

      {batchUpload !== null && view !== "db-upload" && (
        <BatchUploadIndicator progress={batchUpload} onOpen={() => setView("db-upload")} />
      )}
      <DepartmentSaveProgress saves={departmentSaves} />

      {startupTiming && (
        <div
          title={[
            `app.whenReady:    ${startupTiming.phases.whenReady ?? "—"}ms`,
            `backend-spawn:    ${startupTiming.phases.backendSpawn ?? "—"}ms`,
            `backend-healthy:  ${startupTiming.phases.backendHealthy ?? "—"}ms`,
            `firebase:         ${startupTiming.phases.firebase ?? "—"}ms`,
            `vite-ready:       ${startupTiming.phases.viteReady ?? "—"}ms`,
            `window-created:   ${startupTiming.phases.windowCreated ?? "—"}ms`,
            `renderer-ready:   ${startupTiming.phases.rendererReady ?? "—"}ms  ← total`,
          ].join("\n")}
          style={{
            position: "fixed", bottom: 12, right: 12, zIndex: 9999,
            background: "rgba(30,41,59,0.88)", color: "#e2e8f0",
            borderRadius: 8, padding: "6px 12px",
            fontSize: 12, fontFamily: "var(--font-mono, monospace)",
            display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            cursor: "default",
          }}
        >
          <span>Started in {(startupTiming.rendererReadyMs / 1000).toFixed(2)}s</span>
          <button
            onClick={() => setStartupTiming(null)}
            style={{
              background: "none", border: "none", color: "#94a3b8",
              cursor: "pointer", padding: "0 2px", fontSize: 14, lineHeight: 1,
            }}
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {libraryPipelineLog.length > 0 && (
        <LibraryPipelineTimingPanel
          entries={libraryPipelineLog}
          onDismiss={() => setLibraryPipelineLog([])}
        />
      )}
    </ErrorBoundary>
  );
}

function basenameFromPath(p: string): string {
  const s = p.replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

function formatLibraryPipelineTooltip(t: DbPipelineTimingMs): string {
  const lines = [
    `total:        ${t.total}ms`,
    `hash:         ${t.hashing}ms`,
    `dedup:        ${t.dedup}ms`,
  ];
  if (t.analyzing != null) lines.push(`analyze:      ${t.analyzing}ms`);
  if (t.savingSet != null) lines.push(`firestore+set: ${t.savingSet}ms`);
  if (t.uploading != null) lines.push(`storage up:   ${t.uploading}ms`);
  if (t.savingUpdate != null) lines.push(`firestore Δ:  ${t.savingUpdate}ms`);
  return lines.join("\n");
}

function LibraryPipelineTimingPanel({
  entries,
  onDismiss,
}: {
  entries: { id: string; path: string; status: string; timing: DbPipelineTimingMs }[];
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        left: 12,
        zIndex: 9998,
        maxWidth: 440,
        maxHeight: 260,
        display: "flex",
        flexDirection: "column",
        background: "rgba(30,41,59,0.92)",
        color: "#e2e8f0",
        borderRadius: 8,
        padding: "8px 10px 10px",
        fontSize: 11,
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.28)",
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexShrink: 0 }}>
        <span style={{ fontWeight: 600, color: "#cbd5e1", fontSize: 12 }}>
          Library ingest pipeline (newest first)
        </span>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            padding: "0 4px",
            fontSize: 16,
            lineHeight: 1,
          }}
          title="Clear log"
        >
          ×
        </button>
      </div>
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {entries.map((e) => (
          <div
            key={e.id}
            title={formatLibraryPipelineTooltip(e.timing)}
            style={{
              display: "grid",
              gridTemplateColumns: "78px 1fr 56px",
              gap: 6,
              alignItems: "baseline",
              padding: "3px 4px",
              borderRadius: 4,
              background: "rgba(15,23,42,0.35)",
            }}
          >
            <span style={{ color: "#7dd3fc", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{e.status}</span>
            <span style={{ color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.path}>
              {basenameFromPath(e.path)}
            </span>
            <span style={{ color: "#86efac", textAlign: "right", fontWeight: 600 }}>{e.timing.total}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BatchUploadIndicator({
  progress,
  onOpen,
}: {
  progress: { total: number; processed: number; isActive: boolean };
  onOpen: () => void;
}) {
  const pct = progress.total > 0 ? progress.processed / progress.total : 0;
  const r = 14;
  const circ = 2 * Math.PI * r;
  return (
    <button
      onClick={onOpen}
      title="Click to open Product Library"
      style={{
        position: "fixed",
        bottom: 60,
        right: 16,
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 12,
        background: "#1C1C1E",
        color: "#fff",
        border: "none",
        cursor: "pointer",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
      }}
    >
      <svg width={34} height={34} style={{ flexShrink: 0 }}>
        <circle cx={17} cy={17} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={3} />
        <circle
          cx={17} cy={17} r={r} fill="none"
          stroke={progress.isActive ? "#4DABF7" : "#69DB7C"}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          transform="rotate(-90 17 17)"
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <div style={{ textAlign: "left", lineHeight: 1.35 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {progress.processed.toLocaleString()} / {progress.total.toLocaleString()}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
          {progress.isActive ? "Uploading… tap to view" : "Upload complete"}
        </div>
      </div>
    </button>
  );
}
