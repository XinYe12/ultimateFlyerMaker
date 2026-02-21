// apps/desktop/src/renderer/jobs/DepartmentOverview.tsx
// Department overview with weekly cycle and 3D status cards

import React from "react";
import { FlyerJob, DepartmentId } from "../types";
import DepartmentCard from "./DepartmentCard";

type DepartmentStatus = "not started" | "uploading" | "in progress" | "done" | "done, edited";

type DepartmentInfo = {
  status: DepartmentStatus;
  statusLabel: string;
  editedAt?: number;
  progressPercent: number;
  progressText: string;
};

type Props = {
  jobs: FlyerJob[];
  availableDepartments: string[];
  onDepartmentClick?: (department: DepartmentId) => void;
};

const DEPARTMENT_LABELS: Record<string, string> = {
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

function getWeekCycle(): string {
  const today = new Date();
  const currentDay = today.getDay(); // 0 = Sunday, 5 = Friday

  // Calculate days until next Friday
  let daysUntilFriday = (5 - currentDay + 7) % 7;
  if (daysUntilFriday === 0 && today.getHours() >= 12) {
    // If it's Friday afternoon, move to next week
    daysUntilFriday = 7;
  }

  const nextFriday = new Date(today);
  nextFriday.setDate(today.getDate() + daysUntilFriday);

  const followingThursday = new Date(nextFriday);
  followingThursday.setDate(nextFriday.getDate() + 6);

  const formatDate = (date: Date) => {
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  return `${formatDate(nextFriday)} - ${formatDate(followingThursday)}`;
}

function getDepartmentStatus(department: string, jobs: FlyerJob[]): DepartmentInfo {
  const deptJobs = jobs.filter(j => j.department === department);

  if (deptJobs.length === 0) {
    return {
      status: "not started",
      statusLabel: "Not started",
      progressPercent: 0,
      progressText: "",
    };
  }

  // Find any job with work (completed jobs are also drafts until published)
  const completedJob = deptJobs.find(j => j.status === "completed");
  const activeDraft = deptJobs.find(
    j => j.status === "drafting" || j.status === "queued" || j.status === "processing"
  );

  // Determine which job to show (prefer active processing over completed)
  const jobToShow = activeDraft || completedJob;

  if (!jobToShow) {
    return {
      status: "not started",
      statusLabel: "Not started",
      progressPercent: 0,
      progressText: "",
    };
  }

  // Check if the job has actual work done (images added or discount-only processed)
  const hasWork =
    jobToShow.images.length > 0 || (jobToShow.result?.processedImages?.length ?? 0) > 0;

  if (!hasWork) {
    return {
      status: "not started",
      statusLabel: "Not started",
      progressPercent: 0,
      progressText: "",
    };
  }

  // Calculate progress
  let progressPercent = 0;
  let progressText = "0%";

  if (jobToShow.status === "queued" || jobToShow.status === "processing") {
    // Job is being processed - show actual progress
    const total = jobToShow.progress.totalImages || 1;
    const processed = jobToShow.progress.processedImages || 0;
    progressPercent = Math.round((processed / total) * 100);
    progressText = `${progressPercent}%`;
  } else if (jobToShow.status === "completed") {
    // Completed job - show as ready to edit (100% processed)
    progressPercent = 100;
    const itemCount =
      jobToShow.images.length || (jobToShow.result?.processedImages?.length ?? 0);
    progressText = `${itemCount} imgs`;
  } else if (jobToShow.status === "drafting" && hasWork) {
    // Draft has images/discount but not queued yet - show count
    const draftCount =
      jobToShow.images.length || (jobToShow.result?.processedImages?.length ?? 0);
    progressText = `${draftCount} imgs`;
    progressPercent = 0; // Not started processing yet
  }

  // Determine status: completed/ready to edit -> in progress (yellow); processing -> in progress; images added but not queued -> uploading
  let status: DepartmentStatus = "in progress";
  let statusLabel = "Processing…";
  if (jobToShow.status === "completed") {
    status = "in progress"; // Ready to edit = in progress, use yellow
    statusLabel = "Ready to edit";
  } else if (jobToShow.status === "queued" || jobToShow.status === "processing") {
    status = "in progress";
    statusLabel = "Processing…";
  } else if (jobToShow.status === "drafting" && hasWork) {
    status = "uploading";
    statusLabel = "Ready to process";
  }

  return {
    status,
    statusLabel,
    progressPercent: progressPercent,
    progressText: progressText,
  };
}

export default function DepartmentOverview({ jobs, availableDepartments, onDepartmentClick }: Props) {
  const weekCycle = getWeekCycle();

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        borderRadius: 12,
        padding: 24,
        marginBottom: 24,
        color: "white",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>
          Weekly Flyer London Store
        </h2>
        <p style={{ margin: "8px 0 0 0", fontSize: 14, opacity: 0.9 }}>
          Week Cycle: {weekCycle}
        </p>
      </div>

      {/* Department Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
          gap: 16,
        }}
      >
        {availableDepartments.map(dept => {
          const deptInfo = getDepartmentStatus(dept, jobs);
          const label = DEPARTMENT_LABELS[dept] || dept;

          return (
            <DepartmentCard
              key={dept}
              department={dept}
              label={label}
              progressText={deptInfo.progressText}
              statusLabel={deptInfo.statusLabel}
              status={deptInfo.status}
              onClick={() => (onDepartmentClick || (() => {}))(dept as DepartmentId)}
            />
          );
        })}
      </div>
    </div>
  );
}
