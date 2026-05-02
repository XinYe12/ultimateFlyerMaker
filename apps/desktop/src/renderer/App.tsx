// apps/desktop/src/renderer/App.tsx

import { useState, useEffect, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";

import "./App.css";
import DraftSavedToast from "./components/DraftSavedToast";
import EditorHeader from "./components/EditorHeader";
import ErrorBoundary from "./components/ErrorBoundary";
import RecoveryOverlay from "./components/RecoveryOverlay";
import EditorSidebar from "./editor/EditorSidebar";
import AddProductDialog, { AddProductData } from "./editor/AddProductDialog";

import { useIngestQueue } from "./useIngestQueue";
import { useJobQueue } from "./hooks/useJobQueue";
import { IngestItem, FlyerJob, CardLayout } from "./types";
import EditorCanvas from "./editor/EditorCanvas";
import DbSearchModal from "./editor/DbSearchModal";
import GoogleSearchModal from "./editor/GoogleSearchModal";
import DiscountDetailsDialog from "./editor/DiscountDetailsDialog";
import SeriesFlavorPicker from "./editor/SeriesFlavorPicker";
import CheckingPanel from "./editor/CheckingPanel";
import { loadFlyerTemplateConfig, isCardDepartment, findPageForDepartment } from "./editor/loadFlyerTemplateConfig";
import { clearDepartmentDraft } from "./editor/draftStorage";
import { autoLayoutCards } from "../../../shared/flyer/layout/autoLayoutCards";
import { CARD_GAP } from "../../../shared/flyer/layout/layoutCardRows";
import JobQueueView from "./jobs/JobQueueView";
import DbUploadView from "./db-upload/DbUploadView";
import TemplateSelectView from "./editor/TemplateSelectView";
import SettingsView from "./settings/SettingsView";
import SetupView from "./settings/SetupView";
import WorkflowProgressBar from "./components/WorkflowProgressBar";

type AppView = "setup" | "home" | "templateSelect" | "queue" | "editor" | "db-upload" | "settings";

export default function App() {
  // ---------------- VIEW STATE ----------------
  const [view, setView] = useState<AppView>("home");

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
  const { jobs, deleteJob, syncJobFromEditorItems } = jobQueueHook;
  const [discountLabels, setDiscountLabels] = useState<{
    id: string;
    title?: { en: string; zh: string; size: string; regularPrice: string };
    price?: { display: string; quantity?: number | null; unit?: string; regular?: string };
  }[]>([]);
  const discountLabelsRef = useRef(discountLabels);
  discountLabelsRef.current = discountLabels;
  const [slotOverrides, setSlotOverrides] = useState<Record<number, { x: number; y: number; width: number; height: number }>>({});
  const [cardLayouts, setCardLayouts] = useState<Record<string, CardLayout>>({});
  const [userRowCounts, setUserRowCounts] = useState<Record<string, number>>({});
  const [dbSearchItemId, setDbSearchItemId] = useState<string | null>(null);
  const [googleSearchItemId, setGoogleSearchItemId] = useState<string | null>(null);
  const [discountDetailsDialog, setDiscountDetailsDialog] = useState<{
    itemId: string;
    englishTitle: string;
    regularPrice: string;
    salePrice: string;
  } | null>(null);
  const [seriesPickerItemId, setSeriesPickerItemId] = useState<string | null>(null);
  // Track which series items have already been auto-shown (so we don't re-open after Cancel)
  const seriesAutoShownRef = useRef<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [originalDiscounts, setOriginalDiscounts] = useState<any[]>([]);
  const [showCheckingPanel, setShowCheckingPanel] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [verificationDone, setVerificationDone] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState<any>(null);
  const [departmentLocked, setDepartmentLocked] = useState(false);
  const [flyerExported, setFlyerExported] = useState(false);
  const [saveCombining, setSaveCombining] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const [toastState, setToastState] = useState<{ visible: boolean; message: string; variant: "success" | "error" }>({
    visible: false, message: "Draft saved", variant: "success",
  });
  const shownErrorIds = useRef<Set<string>>(new Set(jobs.filter(j => j.status === "failed").map(j => j.id)));
  const [showRecoveryOverlay, setShowRecoveryOverlay] = useState(false);
  const editorSyncRunCount = useRef(0);
  const lastViewingJobIdRef = useRef<string | null>(null);
  const templateConfigRef = useRef<any>(null);
  const xlsxItemsLoadedRef = useRef(false);

  // Phase-2 cutout results arrive via push channel — register once on mount
  useEffect(() => {
    const unsubOk  = window.ufm.onCutoutComplete((d: { id: string; cutoutPath: string; layout: { size: string } }) => applyCutoutPatchRef.current(d.id, { cutoutPath: d.cutoutPath, layout: d.layout }));
    const unsubErr = window.ufm.onCutoutError((d: { id: string; error: string }) => applyCutoutErrorRef.current(d.id, d.error));
    return () => { unsubOk(); unsubErr(); };
  }, []);

  // Save-combination progress/complete listeners
  useEffect(() => {
    const unsubProgress = window.ufm.onSaveCombinationProgress((d: { index: number; total: number }) => {
      setSaveProgress({ done: d.index + 1, total: d.total });
    });
    const unsubComplete = window.ufm.onSaveCombinationComplete((d: { saved: number; skipped: number; errors: number; error?: string }) => {
      setSaveCombining(false);
      setSaveProgress({ done: 0, total: 0 });
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

  // On mount: if we're recovering from a crash, show progress overlay then auto-hide
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    window.ufm.didCrashLastRun().then((crashed: boolean) => {
      if (!crashed) return;
      setShowRecoveryOverlay(true);
      timeoutId = setTimeout(() => setShowRecoveryOverlay(false), 2500);
    });
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Escape key exits edit mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEditMode(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-exit edit mode when switching away from card department
  useEffect(() => {
    if (!isDeptCardBased()) setEditMode(false);
  }, [department]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [view, viewingJob?.id, jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // load template config → extract available departments
  useEffect(() => {
    loadFlyerTemplateConfig(templateId).then(config => {
      templateConfigRef.current = config;
      const depts = new Set<string>();
      config.pages.forEach(page => {
        Object.keys(page.departments).forEach(d => depts.add(d));
      });
      const deptList = Array.from(depts);
      setAvailableDepartments(deptList);
      if (!depts.has(department)) {
        setDepartment(deptList[0] ?? "grocery");
      }
    });
  }, [templateId]);

  // Get the current department's card layout
  const currentCardLayout = cardLayouts[department] ?? null;

  // Card layout undo history (per department, state-based for re-render)
  const [cardLayoutHistory, setCardLayoutHistory] = useState<Record<string, CardLayout[]>>({});

  // Set card layout for current department (with undo history)
  const setCurrentCardLayout = useCallback((layout: CardLayout) => {
    setCardLayouts(prev => {
      const old = prev[department];
      if (old) {
        setCardLayoutHistory(h => {
          const hist = [...(h[department] ?? []), old];
          // Keep at most 20 undo steps
          if (hist.length > 20) hist.shift();
          return { ...h, [department]: hist };
        });
      }
      return { ...prev, [department]: layout };
    });
  }, [department]);

  const undoCardLayout = useCallback(() => {
    setCardLayoutHistory(h => {
      const hist = [...(h[department] ?? [])];
      if (hist.length === 0) return h;
      const prev = hist.pop()!;
      setCardLayouts(layouts => ({ ...layouts, [department]: prev }));
      return { ...h, [department]: hist };
    });
  }, [department]);

  const canUndoCardLayout = (cardLayoutHistory[department]?.length ?? 0) > 0;

  const handleRowCountChange = useCallback((newRows: number) => {
    if (newRows < 1) return;
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
  }, [department, cardLayouts]);

  const handleFlipLayout = useCallback(() => {
    const layout = cardLayouts[department];
    if (!layout || layout.length === 0) return;

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
  }, [department, cardLayouts]);

  // Check if current department is card-based
  const isDeptCardBased = useCallback(() => {
    const config = templateConfigRef.current;
    if (!config) return false;
    const page = findPageForDepartment(config, department);
    if (!page) return false;
    const deptDef = page.departments[department];
    return deptDef ? isCardDepartment(deptDef) : false;
  }, [department]);

  // Auto-generate card layout when items arrive for a card-based department
  useEffect(() => {
    if (view !== "editor") return;
    if (!isDeptCardBased()) return;

    const config = templateConfigRef.current;
    if (!config) return;
    const page = findPageForDepartment(config, department);
    if (!page) return;
    const deptDef = page.departments[department];
    if (!deptDef || !isCardDepartment(deptDef)) return;

    const doneItems = editorQueue.filter((it: any) => it.status === "done" || it.status === "processing_cutout" || it.status === "cutout_error");

    // If there are items but no card layout, auto-generate
    if (doneItems.length > 0 && !cardLayouts[department]) {
      const layout = autoLayoutCards({
        itemIds: doneItems.map((it: any) => it.id),
        regionWidth: deptDef.region.width,
      });
      setCardLayouts(prev => ({ ...prev, [department]: layout }));
    }
    // If no items and no card layout, generate empty card layout
    else if (doneItems.length === 0 && !cardLayouts[department]) {
      const layout = autoLayoutCards({
        itemIds: [],
        regionWidth: deptDef.region.width,
        defaultRows: deptDef.rows,
      });
      setCardLayouts(prev => ({ ...prev, [department]: layout }));
    }
  }, [view, department, editorQueue, cardLayouts, isDeptCardBased]);

  // When a new item finishes ingestion in card mode, assign it to an empty card.
  // If all cards are occupied, regenerate the layout to accommodate the new items.
  useEffect(() => {
    if (view !== "editor") return;
    if (!isDeptCardBased()) return;
    const layout = cardLayouts[department];
    if (!layout) return;

    const doneItems = editorQueue.filter((it: any) => it.status === "done" || it.status === "processing_cutout" || it.status === "cutout_error");
    const assignedItemIds = new Set(layout.filter(c => c.itemId).map(c => c.itemId));
    const unassigned = doneItems.filter((it: any) => !assignedItemIds.has(it.id));

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
        const newLayout = autoLayoutCards({ itemIds: allIds, regionWidth: deptDef.region.width, targetRows: userRowCounts[department] });
        setCardLayouts(prev => ({ ...prev, [department]: newLayout }));
      }
    } else if (changed) {
      setCardLayouts(prev => ({ ...prev, [department]: updated }));
    }
  }, [view, department, editorQueue, cardLayouts, isDeptCardBased]);

  // Handle department switching in editor view
  useEffect(() => {
    if (view !== "editor") return;

    const processingForDept = jobs.find(
      j => j.department === department && (j.status === "queued" || j.status === "processing")
    );
    const completedForDept = jobs.find(
      j => j.department === department && j.status === "completed"
    );
    const draftForDept = jobs.find(
      j => j.department === department && j.status === "drafting"
    );

    const jobToLoad =
      processingForDept ||
      (draftForDept && draftForDept.images.length > 0 ? draftForDept : null) ||
      completedForDept;

    if (viewingJob && viewingJob.department !== department) {
      if (jobToLoad) {
        setViewingJob(jobToLoad);

        if (jobToLoad.result?.processedImages) {
          const ingestItems: IngestItem[] = jobToLoad.result.processedImages
            .filter(img => img.status === "done" && img.result)
            .map(img => ({
              id: img.id,
              path: img.path,
              status: "done" as const,
              result: img.result,
              slotIndex: img.slotIndex,
            }));
          loadItems(ingestItems);

          if (jobToLoad.result.discountLabels) {
            setDiscountLabels(jobToLoad.result.discountLabels);
          } else {
            setDiscountLabels([]);
          }
          setOriginalDiscounts(
            jobToLoad.result.processedImages.map((img: any) => img.result?.discount).filter(Boolean)
          );
          setVerificationDone(jobToLoad.result?.verificationDone ?? false);
          setVerificationProgress(jobToLoad.result?.verificationProgress ?? null);
          setDepartmentLocked(jobToLoad.result?.departmentLocked ?? false);
          setSlotOverrides(jobToLoad.slotOverrides ?? {});
          // Load card layouts from job
          if (jobToLoad.cardLayouts) {
            setCardLayouts(jobToLoad.cardLayouts);
          }
        } else {
          xlsxItemsLoadedRef.current = false;
          loadItems([]);
          setDiscountLabels([]);
          setOriginalDiscounts([]);
          setVerificationDone(false);
          setVerificationProgress(null);
          setDepartmentLocked(false);
          setSlotOverrides({});
        }
      } else {
        setViewingJob(null);
        loadItems([]);
        setDiscountLabels([]);
        setOriginalDiscounts([]);
        setVerificationDone(false);
        setVerificationProgress(null);
        setDepartmentLocked(false);
        setSlotOverrides({});
      }
    }
  }, [department, view, jobs, viewingJob]);

  // Sync editor state back to the current job
  useEffect(() => {
    if (view !== "editor" || !viewingJob) return;
    if (viewingJob.id !== lastViewingJobIdRef.current) {
      lastViewingJobIdRef.current = viewingJob.id;
      editorSyncRunCount.current = 0;
    }
    syncJobFromEditorItems(viewingJob.id, editorQueue, discountLabels, slotOverrides, cardLayouts, verificationDone, verificationProgress, departmentLocked);
    editorSyncRunCount.current += 1;
    if (editorSyncRunCount.current > 1) {
      setToastState(prev => {
        if (prev.visible && prev.variant === "error") return prev;
        return { visible: true, message: "Draft saved", variant: "success" };
      });
    }
  }, [view, viewingJob, editorQueue, discountLabels, slotOverrides, cardLayouts, verificationDone, verificationProgress, departmentLocked, syncJobFromEditorItems]);

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

    if (job.result.discountLabels) {
      setDiscountLabels(job.result.discountLabels);
    }

    // Populate originalDiscounts from job processedImages for verification
    const discountsFromJob = job.result.processedImages
      .map((img: any) => img.result?.discount)
      .filter(Boolean);
    setOriginalDiscounts(discountsFromJob);
    setVerificationDone(job.result?.verificationDone ?? false);
    setVerificationProgress(job.result?.verificationProgress ?? null);
    setDepartmentLocked(job.result?.departmentLocked ?? false);

    setSlotOverrides(job.slotOverrides ?? {});
    setCardLayouts(job.cardLayouts ?? {});
    setView("editor");
  };

  // ---------------- OPEN DRAFT IN EDITOR ----------------
  const handleOpenDraft = (job: FlyerJob) => {
    setViewingJob(job);
    setTemplateId(job.templateId);
    setDepartment(job.department);

    if (job.result?.processedImages?.length) {
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

      if (job.result.discountLabels) {
        setDiscountLabels(job.result.discountLabels);
      }

      // Populate originalDiscounts from job processedImages for verification
      const discountsFromJob = job.result.processedImages
        .map((img: any) => img.result?.discount)
        .filter(Boolean);
      setOriginalDiscounts(discountsFromJob);
      setVerificationDone(job.result?.verificationDone ?? false);
      setVerificationProgress(job.result?.verificationProgress ?? null);
      setDepartmentLocked(job.result?.departmentLocked ?? false);
    } else {
      // No processed images yet
      const parsedItems = (job.discount as any)?.parsedItems;
      const isXlsx = (job.discount as any)?.type === "xlsx";

      if (isXlsx) {
        xlsxItemsLoadedRef.current = false;

        if (parsedItems?.length) {
          const syntheticItems: IngestItem[] = parsedItems.map(
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
          loadItems(syntheticItems);
        } else {
          // Still parsing — reactive effect will load items when ready
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
    setCardLayouts(job.cardLayouts ?? {});
    setView("editor");
  };

  // ---------------- REPLACE IMAGE IN-PLACE ----------------
  const handleReplaceImage = async (itemId: string) => {
    try {
      const filePath = await window.ufm.openImageDialog();
      if (!filePath) return;

      const existingItem = editorQueue.find(item => item.id === itemId);
      if (!existingItem) {
        console.error("Item not found:", itemId);
        return;
      }

      updateItem(itemId, { status: "running", path: filePath });

      const result = await window.ufm.ingestPhoto(filePath);

      updateItem(itemId, {
        status: "done",
        path: filePath,
        result: {
          ...result,
          discount: existingItem?.result?.discount,
          cutoutPaths: undefined,
          allFlavorPaths: undefined,
          pendingFlavorSelection: undefined,
          subImageOverrides: undefined,
        },
      });
    } catch (err) {
      console.error("Failed to replace image:", err);
      updateItem(itemId, { status: "error", error: String(err) });
    }
  };

  // ---------------- REPLACE VIA SEARCH MODALS ----------------
  const handleSearchReplace = (itemId: string, data: { path: string; result: any }) => {
    const existingItem = editorQueue.find(item => item.id === itemId);
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

  const handleChooseDatabaseResults = (itemId: string) => {
    setDbSearchItemId(itemId);
  };

  const handleChooseGoogleSearch = (itemId: string) => {
    setGoogleSearchItemId(itemId);
  };

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
      (item?.result?.discount as any)?.price ?? (item?.result?.discount as any)?.display ?? llm?.sale_price;
    const salePrice = salePriceRaw != null ? String(salePriceRaw) : "";
    setDiscountDetailsDialog({ itemId, englishTitle, regularPrice, salePrice });
  };

  const handleSaveDiscountDetails = (
    itemId: string,
    englishTitle: string,
    regularPrice: string,
    salePrice: string
  ) => {
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

  // ---------------- ADD ITEM FROM MODAL (generates label if discount data present) ----------------
  const handleAddItemFromModal = async (item: IngestItem) => {
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

  const handleDeleteDraft = () => {
    if (!viewingJob) return;

    const confirmed = confirm(`Delete draft "${viewingJob.name}"?\n\nThis action cannot be undone.`);
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
  const handleAddProductFromDiscount = async (items: any[]) => {
    // Persist original parsed items for verification; new additions invalidate prior result
    setOriginalDiscounts(prev => [...prev, ...items]);
    setVerificationDone(false);
    setVerificationProgress(null);

    for (const item of items) {
      // 1. DB search for matching image
      let imageUrl: string | undefined;
      try {
        const results = await window.ufm.searchDatabaseByText(item.en || item.zh || "");
        const best = results?.[0];
        if (best && best.score > 0.5 && best.publicUrl) {
          imageUrl = best.publicUrl;
        }
      } catch (err) {
        console.error(`[xlsx-match] search failed for "${item.en || item.zh}":`, err);
      }

      // 2. Build synthetic IngestItem
      const syntheticItem: IngestItem = {
        id: crypto.randomUUID(),
        path: imageUrl || "",
        status: "done",
        result: {
          inputPath: imageUrl || "",
          cutoutPath: imageUrl || "",
          layout: { size: "medium" },
          title: {
            en: item.en || "",
            zh: item.zh || "",
            size: item.size || "",
            confidence: "high",
            source: "xlsx",
          },
          ocr: [],
          llmResult: {
            best_title: { english_name: item.en || "", chinese_name: item.zh || "", confidence: 1 },
            items: [{
              english_name: item.en || "",
              chinese_name: item.zh || "",
              size: item.size || "",
              sale_price: item.salePrice,
              regular_price: item.regularPrice,
              unit: item.unit || "",
              quantity: item.quantity ?? null,
            }],
          },
          discount: {
            en: item.en,
            zh: item.zh,
            size: item.size,
            salePrice: item.salePrice,
            regularPrice: item.regularPrice,
            unit: item.unit,
            quantity: item.quantity,
            price: item.price,
          },
        },
      };

      // 3. Add to queue
      addItem(syntheticItem);

      // 4. Generate discount label and add to discountLabels
      try {
        const labels = await window.ufm.exportDiscountImages([syntheticItem]);
        if (labels?.[0]) {
          setDiscountLabels((prev: any[]) => [...prev, labels[0]]);
        }
      } catch {
        // label render failed — item still added without label
      }
    }
  };

  // ---------------- CLEAR DEPARTMENT (wipe all products) ----------------
  const handleClearDepartment = () => {
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
    // Clear local editor state (same as clearing current dept)
    loadItems([]);
    setDiscountLabels([]);
    setOriginalDiscounts([]);
    setVerificationDone(false);
    setVerificationProgress(null);
    setDepartmentLocked(false);
    setSlotOverrides({});
    setCardLayouts({});
    // Clear persisted drafts for every available department
    availableDepartments.forEach(dept => clearDepartmentDraft(templateId, dept));
    // Abort any running jobs and remove all jobs for this template from the queue
    jobs.filter(j => j.templateId === templateId).forEach(j => {
      if (j.status === "processing" || j.status === "queued") {
        window.ufm.cancelJob(j.id);
      }
      deleteJob(j.id);
    });
    // Clear the viewing job reference so the processing banner disappears
    setViewingJob(null);
  };

  const handleToggleLock = () => {
    if (departmentLocked) {
      const ok = confirm("Unlock this department? You will need to re-verify before locking again.");
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

  // Effective row count for the toolbar rows control
  const effectiveRowCount = currentCardLayout && currentCardLayout.length > 0
    ? Math.max(...currentCardLayout.map((c) => c.row)) + 1
    : (userRowCounts[department] ?? 1);

  // Effective col count = max cards in any single row
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
    if (saveCombining) return;
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
    setSaveCombining(true);
    setSaveProgress({ done: 0, total: payload.length });
    window.ufm.saveCombinationToDb(payload);
  };

  const [triggerExport, setTriggerExport] = useState(false);

  const handleWorkflowNavigate = (step: number) => {
    // Clean up editor state when leaving the editor view
    if (view === "editor" && step !== 3) {
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

        {view !== "setup" && view !== "home" && view !== "db-upload" && view !== "settings" && (
          <WorkflowProgressBar
            currentStep={workflowStep}
            onNavigate={handleWorkflowNavigate}
            onExportClick={allVerified ? handleProgressBarExport : undefined}
          />
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
          />
        )}

        {view === "queue" && (
          <JobQueueView
            templateId={selectedTemplateId}
            onBack={() => setView("home")}
            onViewFlyer={handleViewFlyer}
            onOpenDraft={handleOpenDraft}
            jobQueueHook={jobQueueHook}
            onOpenSettings={() => setView("settings")}
            onExportDone={() => setFlyerExported(true)}
            triggerExport={triggerExport}
            onTriggerExportConsumed={() => setTriggerExport(false)}
          />
        )}

        {view === "db-upload" && (
          <DbUploadView onBack={() => setView("home")} />
        )}

        {view === "settings" && (
          <SettingsView onBack={() => setView("queue")} />
        )}

        <DraftSavedToast
          visible={toastState.visible}
          message={toastState.message}
          variant={toastState.variant}
          duration={toastState.variant === "error" ? 5000 : 2500}
          onHide={() => setToastState(prev => ({ ...prev, visible: false }))}
          canUndo={canUndoCardLayout}
          onUndo={undoCardLayout}
        />

        {view === "editor" && (
          <>
            <EditorHeader
              viewingJob={viewingJob}
              onDeleteDraft={handleDeleteDraft}
              onAbortJob={handleAbortJob}
            />

            {viewingJob && (
              <>
                {/* Primary toolbar */}
                <div style={{
                  display: "flex", alignItems: "center",
                  background: "#fff",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "6px 10px",
                  gap: 4,
                  marginBottom: 12,
                }}>
                  {/* Left: department picker */}
                  <EditorSidebar
                    isOpen={sidebarOpen}
                    onToggle={() => setSidebarOpen((o) => !o)}
                    departments={availableDepartments}
                    activeDepartment={department}
                    onDepartmentChange={setDepartment}
                    itemCount={editorQueue.length}
                    onClear={departmentLocked ? undefined : handleClearDepartment}
                    onClearAll={departmentLocked ? undefined : handleClearAllDepartments}
                  />

                  {/* Separator */}
                  {!departmentLocked && <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />}

                  {/* Action buttons */}
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

                  {saveCombining && (
                    <span style={{ ...toolbarBtnBase, background: "#6b7280", color: "#fff", cursor: "default" }}>
                      Saving {saveProgress.done}/{saveProgress.total}…
                    </span>
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
                </div>

                {(() => {
                  const liveJob = viewingJob ? (jobs.find(j => j.id === viewingJob.id) ?? viewingJob) : null;
                  const isJobProc = liveJob?.status === "processing" || liveJob?.status === "queued";
                  const jobDone  = liveJob?.progress?.processedImages ?? 0;
                  const jobTotal = liveJob?.progress?.totalImages ?? 0;
                  return isJobProc ? (
                    <div className="ufm-processing-banner">
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="ufm-processing-banner__spin" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                          Searching for product images…
                          {jobTotal > 0 ? ` (${jobDone} / ${jobTotal} done)` : ""}
                        </span>
                      </div>
                      {jobTotal > 0 && (
                        <div className="ufm-processing-banner__bar">
                          <div style={{ width: `${Math.round((jobDone / jobTotal) * 100)}%` }} />
                        </div>
                      )}
                    </div>
                  ) : null;
                })()}

                <EditorCanvas
                  editorQueue={editorQueue}
                  templateId={templateId}
                  department={department}
                  discountLabels={discountLabels}
                  isLocked={departmentLocked}
                  onEnqueue={departmentLocked ? undefined : enqueue}
                  onRemove={departmentLocked ? undefined : remove}
                  onReplaceImage={departmentLocked ? undefined : handleReplaceImage}
                  onRemoveItem={departmentLocked ? undefined : handleRemoveItem}
                  onChooseDatabaseResults={departmentLocked ? undefined : handleChooseDatabaseResults}
                  onGoogleSearch={departmentLocked ? undefined : handleChooseGoogleSearch}
                  onEditTitle={departmentLocked ? undefined : handleOpenDiscountDetailsDialog}
                  onPickSeriesFlavors={departmentLocked ? undefined : setSeriesPickerItemId}
                  onAddItem={departmentLocked ? undefined : handleAddItemFromModal}
                  editMode={editMode}
                  slotOverrides={slotOverrides}
                  onSlotOverridesChange={departmentLocked ? undefined : setSlotOverrides}
                  cardLayout={currentCardLayout}
                  onCardLayoutChange={departmentLocked ? undefined : setCurrentCardLayout}
                  onRemoveFromQueue={departmentLocked ? undefined : removeItemFromQueue}
                  rowCount={userRowCounts[department]}
                  onRowCountChange={departmentLocked ? undefined : handleRowCountChange}
                  onSubImageUpdate={departmentLocked ? undefined : handleSubImageUpdate}
                  onDeleteSubImage={departmentLocked ? undefined : handleDeleteSubImage}
                />

                {dbSearchItemId && (
                  <DbSearchModal
                    itemId={dbSearchItemId}
                    initialQuery={dbSearchInitialQuery}
                    onReplace={handleSearchReplace}
                    onClose={() => setDbSearchItemId(null)}
                  />
                )}

                {googleSearchItemId && (
                  <GoogleSearchModal
                    itemId={googleSearchItemId}
                    initialQuery={googleSearchInitialQuery}
                    currentImageSrc={(() => {
                      const item = editorQueue.find((i) => i.id === googleSearchItemId);
                      const src = item?.result?.cutoutPath ?? item?.result?.inputPath;
                      return src ? `file://${src}` : undefined;
                    })()}
                    onReplace={handleSearchReplace}
                    onClose={() => setGoogleSearchItemId(null)}
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
                    onSaveDiscountDetails={handleSaveDiscountDetails}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
