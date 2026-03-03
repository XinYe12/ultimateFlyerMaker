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
  onViewFlyer: (job: FlyerJob) => void;
  onOpenDraft?: (job: FlyerJob) => void;
  jobQueueHook: ReturnType<typeof useJobQueue>;
  onOpenDbUpload?: () => void;
};

export default function JobQueueView({ onViewFlyer, onOpenDraft, jobQueueHook, onOpenDbUpload }: Props) {
  const {
    jobs,
    createJob,
    addImagesToJob,
    removeImageFromJob,
    setJobDiscount,
    setJobName,
    setJobDepartment,
    startJob,
    deleteJob,
    getJob,
  } = jobQueueHook;

  const [draftingJobId, setDraftingJobId] = useState<string | null>(null);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>(["grocery"]);
  const [currentTemplate, setCurrentTemplate] = useState("weekly_v2");
  const [templateConfig, setTemplateConfig] = useState<FlyerTemplateConfig | null>(null);
  const [showExportWarning, setShowExportWarning] = useState(false);
  const [exportReadiness, setExportReadiness] = useState<ExportReadinessCheck | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const draftPanelRef = useRef<HTMLDivElement | null>(null);

  // Load template config to get available departments
  useEffect(() => {
    loadFlyerTemplateConfig(currentTemplate).then(config => {
      setTemplateConfig(config);
      const depts = new Set<string>();
      config.pages.forEach(page => {
        Object.keys(page.departments).forEach(d => depts.add(d));
      });
      setAvailableDepartments(Array.from(depts));
    });
  }, [currentTemplate]);

  // Find current drafting job
  const draftingJob = draftingJobId ? getJob(draftingJobId) : null;

  // Auto-open editor when job completes; clear panel on terminal states
  useEffect(() => {
    if (draftingJob) {
      if (draftingJob.status === "completed") {
        onOpenDraft?.(draftingJob);
        setDraftingJobId(null);
      } else if (draftingJob.status === "failed") {
        // Error toast is handled by App.tsx; clear the panel
        setDraftingJobId(null);
      }
    }
  }, [draftingJob]);

  const jobHasWork = (job: FlyerJob) =>
    job.images.length > 0 || (job.result?.processedImages?.length ?? 0) > 0;

  const handleDepartmentClick = (department: DepartmentId) => {
    // Find any job for this department (completed or drafting)
    const completedJob = jobs.find(
      j => j.department === department && j.status === "completed"
    );

    const draftingJob = jobs.find(
      j => j.department === department && j.status === "drafting"
    );

    const processingJob = jobs.find(
      j => j.department === department && (j.status === "queued" || j.status === "processing")
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
      const jobId = createJob(currentTemplate, department);
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
    if (draftingJobId) {
      startJob(draftingJobId);
    }
  };

  const handleSetTemplate = (templateId: string) => {
    setCurrentTemplate(templateId);
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

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Department Overview */}
      <DepartmentOverview
        jobs={jobs}
        availableDepartments={availableDepartments}
        onDepartmentClick={handleDepartmentClick}
      />

      {/* Action Buttons */}
      <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center", alignItems: "center" }}>
        <Button variant="secondary" size="lg" onClick={onOpenDbUpload}>
          Product Library
        </Button>
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
            onSetTemplate={handleSetTemplate}
            onQueueJob={handleQueueJob}
            onCreate={() => {}} // Not used when job exists
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
        />
      )}
    </div>
  );
}
