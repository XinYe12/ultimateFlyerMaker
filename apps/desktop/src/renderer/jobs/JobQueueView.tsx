// apps/desktop/src/renderer/jobs/JobQueueView.tsx
// Main container for job queue management

import { useState, useEffect } from "react";
import { useJobQueue } from "../hooks/useJobQueue";
import { FlyerJob, DepartmentId } from "../types";
import { loadFlyerTemplateConfig } from "../editor/loadFlyerTemplateConfig";
import JobCard from "./JobCard";
import JobCreationPanel from "./JobCreationPanel";

type Props = {
  onViewFlyer: (job: FlyerJob) => void;
};

export default function JobQueueView({ onViewFlyer }: Props) {
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
  } = useJobQueue();

  const [draftingJobId, setDraftingJobId] = useState<string | null>(null);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>(["grocery"]);
  const [currentTemplate, setCurrentTemplate] = useState("weekly_v2");

  // Load template config to get available departments
  useEffect(() => {
    loadFlyerTemplateConfig(currentTemplate).then(config => {
      const depts = new Set<string>();
      config.pages.forEach(page => {
        Object.keys(page.departments).forEach(d => depts.add(d));
      });
      setAvailableDepartments(Array.from(depts));
    });
  }, [currentTemplate]);

  // Find current drafting job
  const draftingJob = draftingJobId ? getJob(draftingJobId) : null;

  // If drafting job was queued, clear the drafting state
  useEffect(() => {
    if (draftingJob && draftingJob.status !== "drafting") {
      setDraftingJobId(null);
    }
  }, [draftingJob]);

  // Separate jobs by status
  const activeJobs = jobs.filter(j => j.status === "processing" || j.status === "queued");
  const completedJobs = jobs.filter(j => j.status === "completed");
  const failedJobs = jobs.filter(j => j.status === "failed");

  const handleCreateJob = (templateId: string, department: DepartmentId) => {
    const jobId = createJob(templateId, department);
    setDraftingJobId(jobId);
    setCurrentTemplate(templateId);
  };

  const handleQueueJob = () => {
    if (draftingJobId) {
      startJob(draftingJobId);
    }
  };

  const handleSetTemplate = (templateId: string) => {
    setCurrentTemplate(templateId);
    // Note: Template changes on drafting job need to be handled via job update
    // For now, template is set at creation time
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 20 }}>Flyer Job Queue</h2>

      {/* Job Creation Panel */}
      <div style={{ marginBottom: 24 }}>
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
          onCreate={handleCreateJob}
        />
      </div>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, color: "#868E96", marginBottom: 12, textTransform: "uppercase" }}>
            Active ({activeJobs.length})
          </h3>
          {activeJobs.map(job => (
            <JobCard key={job.id} job={job} onDelete={deleteJob} />
          ))}
        </div>
      )}

      {/* Completed Jobs */}
      {completedJobs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, color: "#868E96", marginBottom: 12, textTransform: "uppercase" }}>
            Completed ({completedJobs.length})
          </h3>
          {completedJobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              onViewFlyer={onViewFlyer}
              onDelete={deleteJob}
            />
          ))}
        </div>
      )}

      {/* Failed Jobs */}
      {failedJobs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, color: "#C92A2A", marginBottom: 12, textTransform: "uppercase" }}>
            Failed ({failedJobs.length})
          </h3>
          {failedJobs.map(job => (
            <JobCard key={job.id} job={job} onDelete={deleteJob} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {jobs.length === 0 && !draftingJob && (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            color: "#868E96",
          }}
        >
          <p>No jobs yet. Create a new flyer job above to get started.</p>
        </div>
      )}
    </div>
  );
}
