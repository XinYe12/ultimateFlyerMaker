// apps/desktop/src/renderer/jobs/JobQueueView.tsx
// Main container for job queue management

import { useState, useEffect, useRef } from "react";
import { useJobQueue } from "../hooks/useJobQueue";
import Button from "../components/ui/Button";
import { FlyerJob, DepartmentId } from "../types";
import { loadFlyerTemplateConfig, FlyerTemplateConfig } from "../editor/loadFlyerTemplateConfig";
import DepartmentOverview from "./DepartmentOverview";
import JobCreationPanel from "./JobCreationPanel";
import ExportWarningDialog from "../export/ExportWarningDialog";
import ExportModal from "../export/ExportModal";
import { checkExportReadiness, ExportReadinessCheck } from "../export/exportUtils";

type Props = {
  templateId: string;
  onBack: () => void;
  onViewFlyer: (job: FlyerJob) => void;
  onOpenDraft?: (job: FlyerJob) => void;
  jobQueueHook: ReturnType<typeof useJobQueue>;
  onOpenSettings?: () => void;
  onExportDone?: () => void;
  triggerExport?: boolean;
  onTriggerExportConsumed?: () => void;
};

export default function JobQueueView({ templateId, onBack, onViewFlyer, onOpenDraft, jobQueueHook, onOpenSettings, onExportDone, triggerExport, onTriggerExportConsumed }: Props) {
  const {
    jobs,
    createJob,
    addImagesToJob,
    removeImageFromJob,
    setJobDiscount,
    setJobName,
    setJobDepartment,
    startJob,
    bulkApplyAndStart,
    deleteJob,
    getJob,
  } = jobQueueHook;

  const [draftingJobId, setDraftingJobId] = useState<string | null>(null);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>(["grocery"]);
  const [templateConfig, setTemplateConfig] = useState<FlyerTemplateConfig | null>(null);
  const [showExportWarning, setShowExportWarning] = useState(false);
  const [exportReadiness, setExportReadiness] = useState<ExportReadinessCheck | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const draftPanelRef = useRef<HTMLDivElement | null>(null);

  // ── Bulk discount upload state ──
  const [bulkParsed, setBulkParsed] = useState<Record<string, any[]> | null>(null);
  const [bulkFile, setBulkFile] = useState<string>("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string>("");
  const [bulkApplied, setBulkApplied] = useState(false);

  // Load template config to get available departments
  useEffect(() => {
    loadFlyerTemplateConfig(templateId).then(config => {
      setTemplateConfig(config);
      const depts = new Set<string>();
      config.pages.forEach(page => {
        Object.keys(page.departments).forEach(d => depts.add(d));
      });
      setAvailableDepartments(Array.from(depts));
    });
  }, [templateId]);

  // Find current drafting job
  const draftingJob = draftingJobId ? getJob(draftingJobId) : null;

  // Clear panel when job fails (error toast handled by App.tsx)
  useEffect(() => {
    if (draftingJob?.status === "failed") {
      setDraftingJobId(null);
    }
  }, [draftingJob?.status]);

  const jobHasWork = (job: FlyerJob) =>
    job.status === "queued" || job.status === "processing" ||
    job.images.length > 0 || (job.result?.processedImages?.length ?? 0) > 0;

  const handleDepartmentClick = (department: DepartmentId) => {
    // Find any job for this department+template (completed or drafting)
    const completedJob = jobs.find(
      j => j.department === department && j.templateId === templateId && j.status === "completed"
    );

    const draftingJob = jobs.find(
      j => j.department === department && j.templateId === templateId && j.status === "drafting"
    );

    const processingJob = jobs.find(
      j => j.department === department && j.templateId === templateId && (j.status === "queued" || j.status === "processing")
    );

    // Prefer processing/drafting jobs over completed
    const jobToOpen = processingJob || draftingJob || completedJob;

    // If there's a job with work (images or discount-only processed), open it in editor
    if (jobToOpen && jobHasWork(jobToOpen)) {
      onOpenDraft?.(jobToOpen);
      return;
    }

    // NOT STARTED: show upload panel
    if (draftingJob) {
      setDraftingJobId(draftingJob.id);
    } else {
      const jobId = createJob(templateId, department);
      setDraftingJobId(jobId);
    }
  };

  // Scroll the draft panel into view when it appears
  useEffect(() => {
    if (draftingJob && draftPanelRef.current) {
      draftPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [draftingJob?.id]);

  const handleOpenInEditor = () => {
    if (draftingJob && jobHasWork(draftingJob)) {
      onOpenDraft?.(draftingJob);
      setDraftingJobId(null); // Clear local state when opening in editor
    }
  };

  const handleQueueJob = () => {
    if (draftingJobId && draftingJob) {
      startJob(draftingJobId);
      onOpenDraft?.(draftingJob);  // Navigate to editor immediately — items stream in
      setDraftingJobId(null);
    }
  };

  const handleExportClick = () => {
    if (!templateConfig) return;

    // Check export readiness
    const readiness = checkExportReadiness(templateConfig, jobs);
    setExportReadiness(readiness);

    if (!readiness.canExport) {
      alert("No departments are ready to export yet. Please complete at least one department first.");
      return;
    }

    // Show warning dialog
    setShowExportWarning(true);
  };

  useEffect(() => {
    if (!triggerExport) return;
    onTriggerExportConsumed?.();
    handleExportClick();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerExport]);

  const handleExportProceed = () => {
    setShowExportWarning(false);
    setShowExportModal(true);
  };

  const handleExportCancel = () => {
    setShowExportWarning(false);
    setExportReadiness(null);
  };

  const handleExportModalClose = () => {
    setShowExportModal(false);
    setExportReadiness(null);
  };

  // ── Bulk discount handlers ──
  const handleBulkFileSelect = async () => {
    const filePath = await window.ufm.openXlsxDialog();
    if (!filePath) return;
    setBulkLoading(true);
    setBulkError("");
    setBulkParsed(null);
    setBulkApplied(false);
    setBulkFile(filePath);
    try {
      const result = await window.ufm.parseAllDepartmentsXlsx(filePath);
      setBulkParsed(result);
    } catch (err: any) {
      setBulkError(err?.message ?? "Failed to parse file");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkApply = async () => {
    if (!bulkParsed) return;
    const discountsByDept: Record<string, any> = {};
    for (const [dept, items] of Object.entries(bulkParsed)) {
      discountsByDept[dept] = { type: "xlsx", source: bulkFile, parsedItems: items, status: "done" };
    }
    await bulkApplyAndStart({ templateId, discountsByDept, availableDepts: availableDepartments });
    setBulkApplied(true);
  };

  const DEPT_LABELS: Record<string, string> = {
    grocery: "Grocery", frozen: "Frozen", hot_food: "Hot Food",
    sushi: "Sushi", meat: "Meat", seafood: "Seafood",
    fruit: "Fruit", vegetable: "Vegetable", hot_sale: "Hot Sale", produce: "Produce",
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Back button */}
      <div style={{ marginBottom: 16 }}>
        <Button variant="secondary" size="sm" onClick={onBack}>
          ← Back
        </Button>
      </div>

      {/* Department Overview */}
      <DepartmentOverview
        jobs={jobs}
        availableDepartments={availableDepartments}
        templateId={templateId}
        onDepartmentClick={handleDepartmentClick}
      />

      {/* Action Buttons */}
      <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center", alignItems: "center" }}>
        <Button
          variant="primary"
          size="lg"
          onClick={handleExportClick}
          style={{
            padding: "14px 32px",
            boxShadow: "0 4px 12px rgba(76, 110, 245, 0.35)",
          }}
        >
          Export Flyer to PDF
        </Button>
        <button
          onClick={() => window.ufm.openLogFile()}
          title="Open the application log file"
          style={{
            background: "none",
            border: "none",
            color: "var(--color-text-muted)",
            fontSize: "var(--text-sm)",
            cursor: "pointer",
            padding: "4px 8px",
            opacity: 0.6,
            textDecoration: "underline",
          }}
        >
          Open Log
        </button>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            title="Open settings"
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              fontSize: "var(--text-sm)",
              cursor: "pointer",
              padding: "4px 8px",
              opacity: 0.6,
              textDecoration: "underline",
            }}
          >
            Settings
          </button>
        )}
      </div>

      {/* ── Bulk Discount Upload ── */}
      <div style={{
        marginTop: 24,
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "16px 20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>Bulk Discount Upload</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              Upload one .xlsx file with all departments to set discounts at once
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => window.ufm.exportExampleXlsx("single")}
              title="All departments in one sheet, separated by header rows"
              style={{
                padding: "7px 14px", fontSize: 13, fontWeight: 600,
                background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8,
                cursor: "pointer", color: "#475569",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
              onMouseLeave={e => e.currentTarget.style.background = "#fff"}
            >
              Template (Single Sheet)
            </button>
            <button
              onClick={() => window.ufm.exportExampleXlsx("multi")}
              title="Each department on its own sheet tab"
              style={{
                padding: "7px 14px", fontSize: 13, fontWeight: 600,
                background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8,
                cursor: "pointer", color: "#475569",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
              onMouseLeave={e => e.currentTarget.style.background = "#fff"}
            >
              Template (Multi-Sheet)
            </button>
            <button
              onClick={handleBulkFileSelect}
              disabled={bulkLoading}
              style={{
                padding: "7px 14px", fontSize: 13, fontWeight: 600,
                background: "#3b82f6", border: "none", borderRadius: 8,
                cursor: bulkLoading ? "wait" : "pointer", color: "#fff",
                opacity: bulkLoading ? 0.7 : 1,
              }}
              onMouseEnter={e => { if (!bulkLoading) e.currentTarget.style.background = "#2563eb"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#3b82f6"; }}
            >
              {bulkLoading ? "Parsing…" : "Upload .xlsx"}
            </button>
          </div>
        </div>

        {/* Error */}
        {bulkError && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "6px 10px" }}>
            {bulkError}
          </div>
        )}

        {/* Parse results */}
        {bulkParsed && !bulkError && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Found in file:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {Object.entries(bulkParsed).map(([dept, items]) => (
                <span key={dept} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: availableDepartments.includes(dept) ? "#dcfce7" : "#f1f5f9",
                  color: availableDepartments.includes(dept) ? "#166534" : "#94a3b8",
                  border: `1px solid ${availableDepartments.includes(dept) ? "#bbf7d0" : "#e2e8f0"}`,
                  borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600,
                }}>
                  {DEPT_LABELS[dept] ?? dept}
                  <span style={{ fontWeight: 400, opacity: 0.8 }}>{items.length}</span>
                </span>
              ))}
            </div>
            {bulkApplied ? (
              <div style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
                Discounts applied to all matching departments.
              </div>
            ) : (
              <button
                onClick={handleBulkApply}
                style={{
                  padding: "8px 18px", fontSize: 13, fontWeight: 700,
                  background: "#16a34a", border: "none", borderRadius: 8,
                  cursor: "pointer", color: "#fff",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#15803d"}
                onMouseLeave={e => e.currentTarget.style.background = "#16a34a"}
              >
                Start All Departments
              </button>
            )}
          </div>
        )}
      </div>

      {/* Job Creation Panel - shown when drafting */}
      {draftingJob && (
        <div ref={draftPanelRef} style={{ marginTop: 24, scrollMarginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: "var(--text-xl)", color: "var(--color-text-muted)" }}>
              {jobHasWork(draftingJob)
                ? `Editing: ${draftingJob.department.charAt(0).toUpperCase() + draftingJob.department.slice(1)}`
                : `Draft: ${draftingJob.department.charAt(0).toUpperCase() + draftingJob.department.slice(1)}`}
            </h3>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              {jobHasWork(draftingJob) && (
                <Button variant="primary" size="sm" onClick={handleOpenInEditor}>
                  Open in Editor
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (draftingJobId) {
                    deleteJob(draftingJobId);
                    setDraftingJobId(null);
                  }
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
          <JobCreationPanel
            job={draftingJob}
            availableDepartments={availableDepartments}
            onAddImages={paths => draftingJobId && addImagesToJob(draftingJobId, paths)}
            onRemoveImage={imageId => draftingJobId && removeImageFromJob(draftingJobId, imageId)}
            onSetDiscount={discount => draftingJobId && setJobDiscount(draftingJobId, discount)}
            onSetName={name => draftingJobId && setJobName(draftingJobId, name)}
            onSetDepartment={dept => draftingJobId && setJobDepartment(draftingJobId, dept)}
            onSetTemplate={() => {}}
            onQueueJob={handleQueueJob}
            onCreate={() => {}} // Not used when job exists
            lockedTemplateId={templateId}
          />
        </div>
      )}

      {/* Export Warning Dialog */}
      {showExportWarning && exportReadiness && (
        <ExportWarningDialog
          readinessCheck={exportReadiness}
          onProceed={handleExportProceed}
          onCancel={handleExportCancel}
        />
      )}

      {/* Export Modal */}
      {showExportModal && templateConfig && (
        <ExportModal
          templateConfig={templateConfig}
          jobs={jobs}
          onClose={handleExportModalClose}
          onSuccess={onExportDone}
        />
      )}
    </div>
  );
}
