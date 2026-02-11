// apps/desktop/src/renderer/jobs/JobQueueView.tsx
// Main container for job queue management

import { useState, useEffect } from "react";
import { useJobQueue } from "../hooks/useJobQueue";
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
};

export default function JobQueueView({ onViewFlyer, onOpenDraft, jobQueueHook }: Props) {
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

  // If drafting job was queued or has images, clear the drafting state
  useEffect(() => {
    if (draftingJob) {
      // If job status changed from drafting, clear local state
      if (draftingJob.status !== "drafting") {
        setDraftingJobId(null);
      }
      // If job now has images, it's "in progress" - allow opening in editor
      // But keep showing the panel until user manually opens editor
    }
  }, [draftingJob]);

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

    // If there's a job with images, open it in editor
    if (jobToOpen && jobToOpen.images.length > 0) {
      // Open in editor
      onOpenDraft?.(jobToOpen);
      return;
    }

    // NOT STARTED: show upload panel
    if (draftingJob) {
      // Draft exists but no images - show creation panel
      setDraftingJobId(draftingJob.id);
    } else {
      // No draft exists - create new and show creation panel
      const jobId = createJob(currentTemplate, department);
      setDraftingJobId(jobId);
    }
  };

  const handleOpenInEditor = () => {
    if (draftingJob && draftingJob.images.length > 0) {
      onOpenDraft?.(draftingJob);
      setDraftingJobId(null); // Clear local state when opening in editor
    }
  };

  const handleQueueJob = () => {
    if (draftingJobId) {
      startJob(draftingJobId);
      setDraftingJobId(null);
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

      {/* Export Flyer Button */}
      <div style={{ marginTop: 24, textAlign: "center" }}>
        <button
          onClick={handleExportClick}
          style={{
            padding: "14px 32px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 16,
            boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 16px rgba(102, 126, 234, 0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.4)";
          }}
        >
          📄 Export Flyer to PDF
        </button>
      </div>

      {/* Job Creation Panel - shown when drafting */}
      {draftingJob && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 18, color: "#495057" }}>
              Draft: {draftingJob.department.charAt(0).toUpperCase() + draftingJob.department.slice(1)}
            </h3>
            <div style={{ display: "flex", gap: 8 }}>
              {draftingJob.images.length > 0 && (
                <button
                  onClick={handleOpenInEditor}
                  style={{
                    padding: "8px 16px",
                    background: "#4C6EF5",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Open in Editor
                </button>
              )}
              <button
                onClick={() => {
                  if (draftingJobId) {
                    deleteJob(draftingJobId);
                    setDraftingJobId(null);
                  }
                }}
                style={{
                  padding: "8px 16px",
                  background: "#F1F3F5",
                  color: "#495057",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
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
