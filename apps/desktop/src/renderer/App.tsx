// apps/desktop/src/renderer/App.tsx

import { useState, useEffect, useRef } from "react";

import "./App.css";
import DepartmentSelector from "./components/DepartmentSelector";
import DraftSavedToast from "./components/DraftSavedToast";
import EditorHeader from "./components/EditorHeader";
import ErrorBoundary from "./components/ErrorBoundary";
import RecoveryOverlay from "./components/RecoveryOverlay";

import { useIngestQueue } from "./useIngestQueue";
import { useJobQueue } from "./hooks/useJobQueue";
import { IngestItem, FlyerJob } from "./types";
import EditorCanvas from "./editor/EditorCanvas";
import DbSearchModal from "./editor/DbSearchModal";
import GoogleSearchModal from "./editor/GoogleSearchModal";
import DiscountDetailsDialog from "./editor/DiscountDetailsDialog";
import { loadFlyerTemplateConfig } from "./editor/loadFlyerTemplateConfig";
import { clearDepartmentDraft } from "./editor/draftStorage";
import JobQueueView from "./jobs/JobQueueView";

type AppView = "queue" | "editor";

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
  const [discountLabels, setDiscountLabels] = useState<{ id?: string; titleImagePath?: string; priceImagePath?: string }[]>([]);
  const [dbSearchItemId, setDbSearchItemId] = useState<string | null>(null);
  const [googleSearchItemId, setGoogleSearchItemId] = useState<string | null>(null);
  const [discountDetailsDialog, setDiscountDetailsDialog] = useState<{
    itemId: string;
    englishTitle: string;
    regularPrice: string;
    salePrice: string;
  } | null>(null);
  const [showDraftSavedToast, setShowDraftSavedToast] = useState(false);
  const [showRecoveryOverlay, setShowRecoveryOverlay] = useState(false);
  const editorSyncRunCount = useRef(0);
  const lastViewingJobIdRef = useRef<string | null>(null);

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
        } else {
          loadItems([]);
          setDiscountLabels([]);
        }
      } else {
        setViewingJob(null);
        loadItems([]);
        setDiscountLabels([]);
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
    syncJobFromEditorItems(viewingJob.id, editorQueue, discountLabels);
    editorSyncRunCount.current += 1;
    if (editorSyncRunCount.current > 1) {
      setShowDraftSavedToast(true);
    }
  }, [view, viewingJob, editorQueue, discountLabels, syncJobFromEditorItems]);

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
      }));

    loadItems(ingestItems);

    if (job.result.discountLabels) {
      setDiscountLabels(job.result.discountLabels);
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
        }));
      loadItems(ingestItems);

      if (job.result.discountLabels) {
        setDiscountLabels(job.result.discountLabels);
      }
    } else {
      loadItems([]);
      setDiscountLabels([]);
    }

    setView("editor");
  };

  const handleBackToQueue = () => {
    setView("queue");
    setViewingJob(null);
    setShowDraftSavedToast(false);
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
          price: salePrice.trim(),
          display: salePrice.trim() ? (salePrice.trim().startsWith("$") ? salePrice.trim() : `$${salePrice.trim()}`) : "",
        },
      },
    });
    setDiscountDetailsDialog(null);
  };

  // ---------------- REMOVE SINGLE ITEM FROM SLOT ----------------
  const handleRemoveItem = (id: string) => {
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

    remove(id);
    setDiscountLabels((prev) => prev.filter((l) => l.id !== id));
  };

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

  // ---------------- CLEAR DEPARTMENT (wipe all products) ----------------
  const handleClearDepartment = () => {
    loadItems([]);
    setDiscountLabels([]);
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
          <h1>Ultimate Flyer Maker</h1>
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
          />
        )}

        {view === "editor" && (
          <>
            <DraftSavedToast
              visible={showDraftSavedToast}
              onHide={() => setShowDraftSavedToast(false)}
            />

            <EditorHeader
              viewingJob={viewingJob}
              onBack={handleBackToQueue}
              onDeleteDraft={handleDeleteDraft}
            />

            {viewingJob && (
              <>
                <DepartmentSelector
                  value={department}
                  onChange={setDepartment}
                  departments={availableDepartments}
                  itemCount={editorQueue.length}
                  onClear={handleClearDepartment}
                />

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
                  onAddItem={addItem}
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
              </>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
