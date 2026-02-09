// apps/desktop/src/renderer/App.tsx

import { useState, useEffect, useRef } from "react";
import React from "react";

import DepartmentSelector from "./components/DepartmentSelector";
import DraftSavedToast from "./components/DraftSavedToast";

import { useIngestQueue } from "./useIngestQueue";
import { useJobQueue } from "./hooks/useJobQueue";
import { IngestItem, FlyerJob } from "./types";
import type { DbSearchResult } from "./global.d";
import EditorCanvas from "./editor/EditorCanvas";
import { loadFlyerTemplateConfig } from "./editor/loadFlyerTemplateConfig";
import JobQueueView from "./jobs/JobQueueView";

type AppView = "queue" | "editor";

/* ---------------- ERROR BOUNDARY ---------------- */

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("RENDER CRASH:", error);
  }

  render() {
    const { error } = this.state;

    if (error) {
      return (
        <div style={{ padding: 32, background: "#111", color: "red" }}>
          <h1>RENDER CRASH</h1>
          <pre>{error.stack ?? error.message}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  // ---------------- VIEW STATE ----------------
  const [view, setView] = useState<AppView>("queue");
  const [viewingJob, setViewingJob] = useState<FlyerJob | null>(null);

  // ---------------- EDITOR STATE ----------------
  const [templateId, setTemplateId] = useState("weekly_v1");
  const [department, setDepartment] = useState("grocery");
  const [availableDepartments, setAvailableDepartments] = useState<string[]>(["grocery"]);
  const { queue: editorQueue, loadItems, enqueue, remove, updateItem } = useIngestQueue();
  const jobQueueHook = useJobQueue();
  const { jobs, deleteJob, syncJobFromEditorItems } = jobQueueHook;
  const [discountLabels, setDiscountLabels] = useState<{ id?: string; titleImagePath?: string; priceImagePath?: string }[]>([]);
  const [dbSearchModal, setDbSearchModal] = useState<{
    itemId: string;
    searchQuery: string;
    results: DbSearchResult[];
    loading?: boolean;
    replacing?: boolean;
    searchedOnce?: boolean;
  } | null>(null);
  const [discountDetailsDialog, setDiscountDetailsDialog] = useState<{
    itemId: string;
    englishTitle: string;
    regularPrice: string;
    salePrice: string;
  } | null>(null);
  const [showDraftSavedToast, setShowDraftSavedToast] = useState(false);
  const editorSyncRunCount = useRef(0);
  const lastViewingJobIdRef = useRef<string | null>(null);

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
    // Only handle department switching when in editor view
    if (view !== "editor") return;

    // Find draft or completed job for the current department
    const draftForDept = jobs.find(
      j => j.department === department && j.status === "drafting"
    );
    const completedForDept = jobs.find(
      j => j.department === department && j.status === "completed"
    );

    // Determine which job to load (prefer draft if it has images)
    const jobToLoad = (draftForDept && draftForDept.images.length > 0)
      ? draftForDept
      : completedForDept;

    // If we're viewing a job and it's not for this department, switch jobs
    if (viewingJob && viewingJob.department !== department) {
      if (jobToLoad) {
        // Load the draft/completed job for this department
        setViewingJob(jobToLoad);

        if (jobToLoad.result?.processedImages) {
          const ingestItems: IngestItem[] = jobToLoad.result.processedImages
            .filter(img => img.status === "done" && img.result)
            .map(img => ({
              id: img.id,
              path: img.path,
              status: "done" as const,
              result: img.result,
            }));
          loadItems(ingestItems);

          if (jobToLoad.result.discountLabels) {
            setDiscountLabels(jobToLoad.result.discountLabels);
          } else {
            setDiscountLabels([]);
          }
        } else {
          // No processed images yet
          loadItems([]);
          setDiscountLabels([]);
        }
      } else {
        // No job exists for this department - clear editor
        setViewingJob(null);
        loadItems([]);
        setDiscountLabels([]);
      }
    }
  }, [department, view, jobs, viewingJob]);

  // Sync editor state (upload, title, price) back to the current job so draft and job queue UI stay in sync
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

    // Set job context
    setViewingJob(job);
    setTemplateId(job.templateId);
    setDepartment(job.department);

    // Convert ImageTask[] to IngestItem[] and load directly (no re-processing)
    const ingestItems: IngestItem[] = job.result.processedImages
      .filter(img => img.status === "done" && img.result)
      .map(img => ({
        id: img.id,
        path: img.path,
        status: "done" as const,
        result: img.result,
      }));

    loadItems(ingestItems);

    // Load discount labels
    if (job.result.discountLabels) {
      setDiscountLabels(job.result.discountLabels);
    }

    setView("editor");
  };

  // ---------------- OPEN DRAFT IN EDITOR ----------------
  const handleOpenDraft = (job: FlyerJob) => {
    // Set job context
    setViewingJob(job);
    setTemplateId(job.templateId);
    setDepartment(job.department);

    // If job has processed images, load them
    if (job.result?.processedImages) {
      const ingestItems: IngestItem[] = job.result.processedImages
        .filter(img => img.status === "done" && img.result)
        .map(img => ({
          id: img.id,
          path: img.path,
          status: "done" as const,
          result: img.result,
        }));
      loadItems(ingestItems);

      // Load discount labels if available
      if (job.result.discountLabels) {
        setDiscountLabels(job.result.discountLabels);
      }
    } else {
      // Clear editor for new draft
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
      // Open file dialog
      const filePath = await window.ufm.openImageDialog();
      if (!filePath) return; // User canceled

      // Find the existing item to preserve its slotIndex
      const existingItem = editorQueue.find(item => item.id === itemId);
      if (!existingItem) {
        console.error("Item not found:", itemId);
        return;
      }

      // Set item to "running" state while processing
      updateItem(itemId, {
        status: "running",
        path: filePath,
      });

      // Process the new image through the ingestion pipeline
      const result = await window.ufm.ingestPhoto(filePath);

      // Update the item in-place with new result, preserving slotIndex
      updateItem(itemId, {
        status: "done",
        path: filePath,
        result: {
          ...result,
          title: result.title,
          aiTitle: result.aiTitle,
        },
        // slotIndex is preserved automatically since updateItem merges
      });
    } catch (err) {
      console.error("Failed to replace image:", err);
      // Set error state on the item
      updateItem(itemId, {
        status: "error",
        error: String(err),
      });
    }
  };

  // ---------------- REPLACE VIA DATABASE RESULTS ----------------
  const handleChooseDatabaseResults = (itemId: string) => {
    const item = editorQueue.find((i) => i.id === itemId);
    const initialQuery = item?.result?.title?.en ?? item?.result?.aiTitle?.en ?? "";
    setDbSearchModal({
      itemId,
      searchQuery: initialQuery,
      results: [],
      loading: false,
      searchedOnce: false,
    });
  };

  const handleDbSearchSubmit = async () => {
    if (!dbSearchModal) return;
    const query = dbSearchModal.searchQuery.trim();
    if (!query) {
      alert("Enter a product name to search.");
      return;
    }
    setDbSearchModal((prev) => (prev ? { ...prev, loading: true } : null));
    try {
      const results = await window.ufm.searchDatabaseByText(query);
      setDbSearchModal((prev) =>
        prev ? { ...prev, results: results ?? [], loading: false, searchedOnce: true } : null
      );
    } catch (err) {
      console.error("Database search failed:", err);
      setDbSearchModal(null);
      alert("Search failed: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleOpenDiscountDetailsDialog = (itemId: string) => {
    const item = editorQueue.find((i) => i.id === itemId);
    const llm = item?.result?.llmResult?.items?.[0] as any;
    const englishTitle = item?.result?.title?.en ?? item?.result?.aiTitle?.en ?? "";
    const regularPrice =
      (item?.result?.title as any)?.regularPrice != null
        ? String((item?.result?.title as any).regularPrice)
        : llm?.regular_price != null
          ? String(llm.regular_price)
          : "";
    const salePrice =
      (item?.result?.discount as any)?.price ?? (item?.result?.discount as any)?.display ?? (llm?.sale_price != null ? String(llm.sale_price) : "");
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
          price: salePrice.trim(),
          display: salePrice.trim() ? (salePrice.trim().startsWith("$") ? salePrice.trim() : `$${salePrice.trim()}`) : "",
        },
      },
    });
    setDiscountDetailsDialog(null);
  };

  const handleSelectDbResult = async (itemId: string, publicUrl: string) => {
    if (!publicUrl?.trim()) return;
    setDbSearchModal((prev) => (prev ? { ...prev, replacing: true } : null));
    try {
      const { path: newPath, result } = await window.ufm.downloadAndIngestFromUrl(publicUrl.trim());
      updateItem(itemId, {
        status: "done",
        path: newPath,
        result: { ...result, title: result.title, aiTitle: result.aiTitle },
      });
      setDbSearchModal(null);
    } catch (err) {
      console.error("Replace from URL failed:", err);
      setDbSearchModal((prev) => (prev ? { ...prev, replacing: false } : null));
      alert("Failed to replace image: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDeleteDraft = () => {
    if (!viewingJob) return;

    // Confirm deletion
    const confirmed = confirm(`Delete draft "${viewingJob.name}"?\n\nThis action cannot be undone.`);
    if (!confirmed) return;

    // Delete the job
    deleteJob(viewingJob.id);

    // Clear editor and go back to queue
    setViewingJob(null);
    loadItems([]);
    setDiscountLabels([]);
    setView("queue");
  };

  // ---------------- RENDER ----------------
  return (
    <ErrorBoundary>
      <div
        style={{
          height: "100vh",
          padding: 32,
          boxSizing: "border-box",
          background: "#f5f5f5",
          fontFamily: "system-ui",
          overflow: "auto",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0 }}>Ultimate Flyer Maker</h1>
        </div>

        {/* Job Queue View */}
        {view === "queue" && (
          <JobQueueView
            onViewFlyer={handleViewFlyer}
            onOpenDraft={handleOpenDraft}
            jobQueueHook={jobQueueHook}
          />
        )}

        {/* Editor View */}
        {view === "editor" && (
          <>
            <DraftSavedToast
              visible={showDraftSavedToast}
              onHide={() => setShowDraftSavedToast(false)}
            />
            {viewingJob ? (
              <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={handleBackToQueue}
                    style={{
                      padding: "8px 16px",
                      background: "#F1F3F5",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    Back to Queue
                  </button>
                  <span style={{ color: "#868E96" }}>
                    Viewing: {viewingJob.name}
                  </span>
                </div>
                {/* Show delete button only for drafting jobs */}
                {viewingJob.status === "drafting" && (
                  <button
                    onClick={handleDeleteDraft}
                    style={{
                      padding: "8px 16px",
                      background: "#FFE3E3",
                      color: "#C92A2A",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    Delete Draft
                  </button>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <button
                  onClick={handleBackToQueue}
                  style={{
                    padding: "8px 16px",
                    background: "#F1F3F5",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 500,
                    marginBottom: 12,
                  }}
                >
                  Back to Queue
                </button>
                <div style={{ padding: 20, background: "#FFF3BF", borderRadius: 8 }}>
                  <p style={{ margin: 0, color: "#E67700" }}>
                    No job selected. Go to Job Queue to create and process a flyer job.
                  </p>
                </div>
              </div>
            )}

            {viewingJob && (
              <>
                <DepartmentSelector
                  value={department}
                  onChange={setDepartment}
                  departments={availableDepartments}
                />

                <EditorCanvas
                  editorQueue={editorQueue}
                  templateId={templateId}
                  department={department}
                  discountLabels={discountLabels}
                  onEnqueue={enqueue}
                  onRemove={remove}
                  onReplaceImage={handleReplaceImage}
                  onChooseDatabaseResults={handleChooseDatabaseResults}
                  onEditTitle={handleOpenDiscountDetailsDialog}
                />

                {/* Database Results modal (Replace → Database Results) */}
                {dbSearchModal && (
                  <div
                    style={{
                      position: "fixed",
                      inset: 0,
                      background: "rgba(0,0,0,0.5)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 10000,
                    }}
                    onClick={() => !dbSearchModal.replacing && setDbSearchModal(null)}
                  >
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: 12,
                        padding: 24,
                        maxWidth: 720,
                        width: "90%",
                        maxHeight: "85vh",
                        overflow: "auto",
                        boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>
                        {dbSearchModal.results.length > 0 ? "Choose a product" : "Search database by product name"}
                      </h2>
                      {dbSearchModal.loading ? (
                        <p style={{ color: "#666" }}>Searching database…</p>
                      ) : dbSearchModal.replacing ? (
                        <p style={{ color: "#666" }}>Downloading and processing image…</p>
                      ) : dbSearchModal.results.length === 0 ? (
                        <>
                          {dbSearchModal.searchedOnce && (
                            <p style={{ color: "#c92a2a", marginBottom: 12 }}>
                              No matching products found. Try a different name.
                            </p>
                          )}
                          <p style={{ color: "#666", marginBottom: 12 }}>
                            Enter or edit the product name, then click Search. New images may have no title yet.
                          </p>
                          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                            <input
                              type="text"
                              value={dbSearchModal.searchQuery}
                              onChange={(e) =>
                                setDbSearchModal((prev) =>
                                  prev ? { ...prev, searchQuery: e.target.value } : null
                                )
                              }
                              placeholder="e.g. Norwegian Mackerel Fillet"
                              style={{
                                flex: 1,
                                padding: "10px 12px",
                                fontSize: 14,
                                border: "1px solid #ddd",
                                borderRadius: 8,
                              }}
                              onKeyDown={(e) => e.key === "Enter" && handleDbSearchSubmit()}
                            />
                            <button
                              type="button"
                              onClick={handleDbSearchSubmit}
                              style={{
                                padding: "10px 20px",
                                background: "#9C27B0",
                                color: "#fff",
                                border: "none",
                                borderRadius: 8,
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              Search
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setDbSearchModal((prev) =>
                                prev ? { ...prev, results: [], searchedOnce: false } : null
                              )
                            }
                            style={{
                              marginBottom: 12,
                              padding: "6px 12px",
                              fontSize: 12,
                              background: "#f0f0f0",
                              border: "none",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            ← Change search
                          </button>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(3, 1fr)",
                              gap: 16,
                            }}
                          >
                            {dbSearchModal.results.map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() =>
                                  r.publicUrl && handleSelectDbResult(dbSearchModal.itemId, r.publicUrl)
                                }
                                disabled={!r.publicUrl}
                                style={{
                                  padding: 0,
                                  border: "2px solid #ddd",
                                  borderRadius: 8,
                                  overflow: "hidden",
                                  background: "#fff",
                                  cursor: r.publicUrl ? "pointer" : "not-allowed",
                                }}
                              >
                                {r.publicUrl ? (
                                  <img
                                    src={r.publicUrl}
                                    alt={r.englishTitle ?? r.chineseTitle ?? r.id}
                                    style={{
                                      width: "100%",
                                      height: 140,
                                      objectFit: "contain",
                                      display: "block",
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: "100%",
                                      height: 140,
                                      background: "#f0f0f0",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    No image
                                  </div>
                                )}
                                <div
                                  style={{
                                    padding: 8,
                                    fontSize: 12,
                                    textAlign: "left",
                                    color: "#333",
                                  }}
                                >
                                  {r.englishTitle || r.chineseTitle || r.id}
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      {!dbSearchModal.loading && dbSearchModal.results.length > 0 && (
                        <p style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
                          No match? Click “Change search” to try a different name.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => setDbSearchModal(null)}
                        disabled={dbSearchModal.replacing}
                        style={{
                          marginTop: 16,
                          padding: "8px 16px",
                          cursor: dbSearchModal.replacing ? "wait" : "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Add discount details dialog */}
                {discountDetailsDialog && (
                  <div
                    style={{
                      position: "fixed",
                      inset: 0,
                      background: "rgba(0,0,0,0.5)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 10000,
                    }}
                    onClick={() => setDiscountDetailsDialog(null)}
                  >
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: 12,
                        padding: 24,
                        width: 400,
                        boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Add discount details</h2>
                      <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
                        Shown on the product card and used for Database search.
                      </p>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#333", marginBottom: 4 }}>
                        English title
                      </label>
                      <input
                        type="text"
                        value={discountDetailsDialog.englishTitle}
                        onChange={(e) =>
                          setDiscountDetailsDialog((prev) =>
                            prev ? { ...prev, englishTitle: e.target.value } : null
                          )
                        }
                        placeholder="e.g. Norwegian Mackerel Fillet"
                        autoFocus
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "10px 12px",
                          fontSize: 14,
                          border: "1px solid #ddd",
                          borderRadius: 8,
                          marginBottom: 14,
                        }}
                      />
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#333", marginBottom: 4 }}>
                        Regular price
                      </label>
                      <input
                        type="text"
                        value={discountDetailsDialog.regularPrice}
                        onChange={(e) =>
                          setDiscountDetailsDialog((prev) =>
                            prev ? { ...prev, regularPrice: e.target.value } : null
                          )
                        }
                        placeholder="e.g. 25.00"
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "10px 12px",
                          fontSize: 14,
                          border: "1px solid #ddd",
                          borderRadius: 8,
                          marginBottom: 14,
                        }}
                      />
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#333", marginBottom: 4 }}>
                        Sale price
                      </label>
                      <input
                        type="text"
                        value={discountDetailsDialog.salePrice}
                        onChange={(e) =>
                          setDiscountDetailsDialog((prev) =>
                            prev ? { ...prev, salePrice: e.target.value } : null
                          )
                        }
                        placeholder="e.g. 19.99 or $19.99"
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "10px 12px",
                          fontSize: 14,
                          border: "1px solid #ddd",
                          borderRadius: 8,
                          marginBottom: 20,
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            handleSaveDiscountDetails(
                              discountDetailsDialog.itemId,
                              discountDetailsDialog.englishTitle,
                              discountDetailsDialog.regularPrice,
                              discountDetailsDialog.salePrice
                            );
                          if (e.key === "Escape") setDiscountDetailsDialog(null);
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => setDiscountDetailsDialog(null)}
                          style={{ padding: "8px 16px", cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleSaveDiscountDetails(
                              discountDetailsDialog.itemId,
                              discountDetailsDialog.englishTitle,
                              discountDetailsDialog.regularPrice,
                              discountDetailsDialog.salePrice
                            )
                          }
                          style={{
                            padding: "8px 16px",
                            background: "#333",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            cursor: "pointer",
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
