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
import { loadFlyerTemplateConfig, isCardDepartment, findPageForDepartment } from "./editor/loadFlyerTemplateConfig";
import { clearDepartmentDraft } from "./editor/draftStorage";
import { autoLayoutCards } from "../../../shared/flyer/layout/autoLayoutCards";
import JobQueueView from "./jobs/JobQueueView";
import DbUploadView from "./db-upload/DbUploadView";

type AppView = "queue" | "editor" | "db-upload";

export default function App() {
  // ---------------- VIEW STATE ----------------
  const [view, setView] = useState<AppView>("queue");
  const [viewingJob, setViewingJob] = useState<FlyerJob | null>(null);

  // ---------------- EDITOR STATE ----------------
  const [templateId, setTemplateId] = useState("weekly_v1");
  const [department, setDepartment] = useState("grocery");
  const [availableDepartments, setAvailableDepartments] = useState<string[]>(["grocery"]);
  const { queue: editorQueue, loadItems, enqueue, remove, updateItem, addItem } = useIngestQueue();
  const jobQueueHook = useJobQueue();
  const { jobs, deleteJob, syncJobFromEditorItems } = jobQueueHook;
  const [discountLabels, setDiscountLabels] = useState<{
    id: string;
    title?: { en: string; zh: string; size: string; regularPrice: string };
    price?: { display: string; quantity?: number | null; unit?: string; regular?: string };
  }[]>([]);
  const [slotOverrides, setSlotOverrides] = useState<Record<number, { x: number; y: number; width: number; height: number }>>({});
  const [cardLayouts, setCardLayouts] = useState<Record<string, CardLayout>>({});
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);

  const [toastState, setToastState] = useState<{ visible: boolean; message: string; variant: "success" | "error" }>({
    visible: false, message: "Draft saved", variant: "success",
  });
  const shownErrorIds = useRef<Set<string>>(new Set(jobs.filter(j => j.status === "failed").map(j => j.id)));
  const [showRecoveryOverlay, setShowRecoveryOverlay] = useState(false);
  const editorSyncRunCount = useRef(0);
  const lastViewingJobIdRef = useRef<string | null>(null);
  const templateConfigRef = useRef<any>(null);

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

    const doneItems = editorQueue.filter((it: any) => it.status === "done");

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

    const doneItems = editorQueue.filter((it: any) => it.status === "done");
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
        const newLayout = autoLayoutCards({ itemIds: allIds, regionWidth: deptDef.region.width });
        setCardLayouts(prev => ({ ...prev, [department]: newLayout }));
      }
    } else if (changed) {
      setCardLayouts(prev => ({ ...prev, [department]: updated }));
    }
  }, [view, department, editorQueue, cardLayouts, isDeptCardBased]);

  // Handle department switching in editor view
  useEffect(() => {
    if (view !== "editor") return;

    const draftForDept = jobs.find(
      j => j.department === department && j.status === "drafting"
    );
    const completedForDept = jobs.find(
      j => j.department === department && j.status === "completed"
    );

    const jobToLoad = (draftForDept && draftForDept.images.length > 0)
      ? draftForDept
      : completedForDept;

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
          setSlotOverrides(jobToLoad.slotOverrides ?? {});
          // Load card layouts from job
          if (jobToLoad.cardLayouts) {
            setCardLayouts(jobToLoad.cardLayouts);
          }
        } else {
          loadItems([]);
          setDiscountLabels([]);
          setSlotOverrides({});
        }
      } else {
        setViewingJob(null);
        loadItems([]);
        setDiscountLabels([]);
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
    syncJobFromEditorItems(viewingJob.id, editorQueue, discountLabels, slotOverrides, cardLayouts);
    editorSyncRunCount.current += 1;
    if (editorSyncRunCount.current > 1) {
      setToastState({ visible: true, message: "Draft saved", variant: "success" });
    }
  }, [view, viewingJob, editorQueue, discountLabels, slotOverrides, cardLayouts, syncJobFromEditorItems]);

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

    setSlotOverrides(job.slotOverrides ?? {});
    if (job.cardLayouts) {
      setCardLayouts(job.cardLayouts);
    }
    setView("editor");
  };

  // ---------------- OPEN DRAFT IN EDITOR ----------------
  const handleOpenDraft = (job: FlyerJob) => {
    setViewingJob(job);
    setTemplateId(job.templateId);
    setDepartment(job.department);

    if (job.result?.processedImages) {
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
    } else {
      loadItems([]);
      setDiscountLabels([]);
    }

    setSlotOverrides(job.slotOverrides ?? {});
    if (job.cardLayouts) {
      setCardLayouts(job.cardLayouts);
    }
    setView("editor");
  };

  const handleBackToQueue = () => {
    setView("queue");
    setViewingJob(null);
    setToastState(prev => ({ ...prev, visible: false }));
    editorSyncRunCount.current = 0;
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
        result: { ...result, title: result.title, aiTitle: result.aiTitle },
      });
    } catch (err) {
      console.error("Failed to replace image:", err);
      updateItem(itemId, { status: "error", error: String(err) });
    }
  };

  // ---------------- REPLACE VIA SEARCH MODALS ----------------
  const handleSearchReplace = (itemId: string, data: { path: string; result: any }) => {
    updateItem(itemId, {
      status: "done",
      path: data.path,
      result: { ...data.result, title: data.result.title, aiTitle: data.result.aiTitle },
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
        if (best && best.score > 0.75 && best.publicUrl) {
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
    for (const item of items) {
      // 1. DB search for matching image
      let imageUrl: string | undefined;
      try {
        const results = await window.ufm.searchDatabaseByText(item.en || item.zh || "");
        const best = results?.[0];
        if (best && best.score > 0.75 && best.publicUrl) {
          imageUrl = best.publicUrl;
        }
      } catch {
        // no match — proceed without image
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
            confidence: 1,
            source: "xlsx",
          },
          ocr: { lines: [] },
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
    setSlotOverrides({});
    // Clear card layouts for this department
    setCardLayouts(prev => {
      const next = { ...prev };
      delete next[department];
      return next;
    });
    clearDepartmentDraft(templateId, department);
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

  // ---------------- RENDER ----------------
  return (
    <ErrorBoundary>
      <RecoveryOverlay visible={showRecoveryOverlay} />
      <div className="app-root">
        <div className="app-header">
          <div className="app-logo">
            <svg className="app-logo-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="2" width="24" height="28" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
              <path d="M8 10h16M8 16h12M8 22h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="app-logo-text">Ultimate Flyer Maker</span>
          </div>
          <button
            type="button"
            className="app-quit-btn"
            onClick={() => window.ufm.requestQuit()}
            title="Quit application (your drafts are saved)"
          >
            Quit
          </button>
        </div>

        {view === "queue" && (
          <JobQueueView
            onViewFlyer={handleViewFlyer}
            onOpenDraft={handleOpenDraft}
            jobQueueHook={jobQueueHook}
            onOpenDbUpload={() => setView("db-upload")}
          />
        )}

        {view === "db-upload" && (
          <DbUploadView onBack={() => setView("queue")} />
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
              onBack={handleBackToQueue}
              onDeleteDraft={handleDeleteDraft}
            />

            {viewingJob && (
              <>
                {/* Editor toolbar: department picker + add product */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 0 12px", position: "relative" }}>
                  <EditorSidebar
                    isOpen={sidebarOpen}
                    onToggle={() => setSidebarOpen((o) => !o)}
                    departments={availableDepartments}
                    activeDepartment={department}
                    onDepartmentChange={setDepartment}
                    itemCount={editorQueue.length}
                    onClear={handleClearDepartment}
                  />
                  <button
                    onClick={() => setShowAddProductDialog(true)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 14px",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--color-success)",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: "var(--text-base)",
                      cursor: "pointer",
                      fontFamily: "var(--font-sans)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#237032"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-success)"; }}
                  >
                    <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 700 }}>+</span>
                    Add Product
                  </button>
                </div>

                <EditorCanvas
                  editorQueue={editorQueue}
                  templateId={templateId}
                  department={department}
                  discountLabels={discountLabels}
                  onEnqueue={enqueue}
                  onRemove={remove}
                  onReplaceImage={handleReplaceImage}
                  onRemoveItem={handleRemoveItem}
                  onChooseDatabaseResults={handleChooseDatabaseResults}
                  onGoogleSearch={handleChooseGoogleSearch}
                  onEditTitle={handleOpenDiscountDetailsDialog}
                  onPickSeriesFlavors={setSeriesPickerItemId}
                  onAddItem={addItem}
                  slotOverrides={slotOverrides}
                  onSlotOverridesChange={setSlotOverrides}
                  cardLayout={currentCardLayout}
                  onCardLayoutChange={setCurrentCardLayout}
                  onRemoveFromQueue={removeItemFromQueue}
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
              </>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
