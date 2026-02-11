// apps/desktop/src/renderer/jobs/DepartmentOverview.tsx
// Department overview with weekly cycle and status buttons

import { useState, useEffect, useRef } from "react";
import { FlyerJob, DepartmentId } from "../types";

type DepartmentStatus = "not started" | "uploading" | "in progress" | "done" | "done, edited";

type DepartmentInfo = {
  status: DepartmentStatus;
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

// Custom hook to animate progress percentage
function useAnimatedProgress(targetPercent: number, duration: number = 800): number {
  const [displayPercent, setDisplayPercent] = useState(targetPercent);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    // Cancel any ongoing animation
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    const startPercent = displayPercent;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (easeOutCubic for smooth deceleration)
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = startPercent + (targetPercent - startPercent) * eased;

      setDisplayPercent(Math.round(currentValue));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetPercent]);

  return displayPercent;
}

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
      progressPercent: 0,
      progressText: "0%",
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
      progressPercent: 0,
      progressText: "0%",
    };
  }

  // Check if the job has actual work done (images added)
  const hasWork = jobToShow.images.length > 0;

  if (!hasWork) {
    return {
      status: "not started",
      progressPercent: 0,
      progressText: "0%",
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
    progressText = `${jobToShow.images.length} imgs`;
  } else if (jobToShow.status === "drafting" && jobToShow.images.length > 0) {
    // Draft has images but not queued yet - show image count
    progressText = `${jobToShow.images.length} imgs`;
    progressPercent = 0; // Not started processing yet
  }

  // UPLOADING = images are in the job but none processed yet (0%). IN PROGRESS = pipeline has started (progress > 0%).
  const isUploading = progressPercent === 0 && jobToShow.images.length > 0;

  return {
    status: isUploading ? "uploading" : "in progress",
    progressPercent: progressPercent,
    progressText: progressText,
  };
}

function getStatusColor(status: DepartmentStatus): { bg: string; text: string } {
  switch (status) {
    case "not started":
      return { bg: "#F1F3F5", text: "#868E96" };
    case "uploading":
      return { bg: "#E7F5FF", text: "#1971C2" }; // Light blue — batch upload in progress
    case "in progress":
      return { bg: "#FFF3BF", text: "#E67700" }; // Amber — processing / pipeline running
    case "done":
      return { bg: "#D0EBFF", text: "#1971C2" };
    case "done, edited":
      return { bg: "#D3F9D8", text: "#2F9E44" }; // Green to show active editing
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Component for individual department button with animated progress
function DepartmentButton({
  department,
  deptInfo,
  label,
  onDepartmentClick,
}: {
  department: string;
  deptInfo: DepartmentInfo;
  label: string;
  onDepartmentClick: (dept: DepartmentId) => void;
}) {
  const animatedPercent = useAnimatedProgress(deptInfo.progressPercent);
  const colors = getStatusColor(deptInfo.status);

  // Format progress text with animated percentage
  let displayText = deptInfo.progressText;
  if (deptInfo.progressText.includes('%')) {
    displayText = `${animatedPercent}%`;
  }

  return (
    <button
      onClick={() => onDepartmentClick(department as DepartmentId)}
      style={{
        background: colors.bg,
        color: colors.text,
        border: "none",
        borderRadius: 12,
        padding: "24px 20px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        fontWeight: 500,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        aspectRatio: "1 / 1",
        position: "relative",
        minHeight: "180px",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.15)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Department Name */}
      <div style={{
        fontSize: 18,
        fontWeight: 700,
        marginBottom: 16,
        textAlign: "center",
      }}>
        {label}
      </div>

      {/* Progress Circle or Percentage */}
      <div style={{
        fontSize: 36,
        fontWeight: 800,
        marginBottom: 12,
        lineHeight: 1,
      }}>
        {displayText}
      </div>

      {/* Status Text */}
      <div style={{
        fontSize: 11,
        textTransform: "uppercase",
        opacity: 0.85,
        fontWeight: 600,
        textAlign: "center",
      }}>
        {deptInfo.status}
      </div>

      {/* Edited Timestamp */}
      {deptInfo.editedAt && (
        <div style={{
          fontSize: 10,
          marginTop: 6,
          opacity: 0.7,
          textTransform: "none",
        }}>
          {formatTimestamp(deptInfo.editedAt)}
        </div>
      )}

      {/* Progress Bar at Bottom */}
      {animatedPercent > 0 && animatedPercent < 100 && (
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: "rgba(0,0,0,0.1)",
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${animatedPercent}%`,
            background: colors.text,
            transition: "width 0.1s linear",
          }} />
        </div>
      )}
    </button>
  );
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

      {/* Department Buttons */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        {availableDepartments.map(dept => {
          const deptInfo = getDepartmentStatus(dept, jobs);
          const label = DEPARTMENT_LABELS[dept] || dept;

          return (
            <DepartmentButton
              key={dept}
              department={dept}
              deptInfo={deptInfo}
              label={label}
              onDepartmentClick={onDepartmentClick || (() => {})}
            />
          );
        })}
      </div>
    </div>
  );
}
