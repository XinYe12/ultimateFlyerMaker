// apps/desktop/src/renderer/App.tsx

import { useState, useEffect } from "react";
import React from "react";

import DepartmentSelector from "./components/DepartmentSelector";

import { useIngestQueue } from "./useIngestQueue";
import { IngestItem, FlyerJob } from "./types";
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
  const { queue: editorQueue, loadItems } = useIngestQueue();
  const [discountLabels, setDiscountLabels] = useState<{ id?: string; titleImagePath?: string; priceImagePath?: string }[]>([]);

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

  const handleBackToQueue = () => {
    setView("queue");
    setViewingJob(null);
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
        {/* Header with view toggle */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ margin: 0 }}>Ultimate Flyer Maker</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setView("queue")}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: 6,
                background: view === "queue" ? "#4C6EF5" : "#E9ECEF",
                color: view === "queue" ? "#fff" : "#333",
                fontWeight: view === "queue" ? 600 : 500,
                cursor: "pointer",
              }}
            >
              Job Queue
            </button>
            <button
              onClick={() => setView("editor")}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: 6,
                background: view === "editor" ? "#4C6EF5" : "#E9ECEF",
                color: view === "editor" ? "#fff" : "#333",
                fontWeight: view === "editor" ? 600 : 500,
                cursor: "pointer",
              }}
            >
              Editor
            </button>
          </div>
        </div>

        {/* Job Queue View */}
        {view === "queue" && (
          <JobQueueView onViewFlyer={handleViewFlyer} />
        )}

        {/* Editor View */}
        {view === "editor" && (
          <>
            {viewingJob ? (
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
                  }}
                >
                  Back to Queue
                </button>
                <span style={{ marginLeft: 12, color: "#868E96" }}>
                  Viewing: {viewingJob.name}
                </span>
              </div>
            ) : (
              <div style={{ marginBottom: 16, padding: 20, background: "#FFF3BF", borderRadius: 8 }}>
                <p style={{ margin: 0, color: "#E67700" }}>
                  No job selected. Go to Job Queue to create and process a flyer job.
                </p>
              </div>
            )}

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
            />
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
