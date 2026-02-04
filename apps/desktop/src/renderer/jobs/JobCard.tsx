// apps/desktop/src/renderer/jobs/JobCard.tsx
// Displays a single job with status, progress, and actions

import { FlyerJob } from "../types";

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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  drafting: { bg: "#F1F3F5", text: "#868E96" },
  queued: { bg: "#FFF3BF", text: "#E67700" },
  processing: { bg: "#D3F9D8", text: "#2F9E44" },
  completed: { bg: "#D0EBFF", text: "#1971C2" },
  failed: { bg: "#FFE3E3", text: "#C92A2A" },
};

type Props = {
  job: FlyerJob;
  onViewFlyer?: (job: FlyerJob) => void;
  onDelete?: (jobId: string) => void;
};

export default function JobCard({ job, onViewFlyer, onDelete }: Props) {
  const statusColor = STATUS_COLORS[job.status] || STATUS_COLORS.drafting;
  const deptLabel = DEPARTMENT_LABELS[job.department] || job.department;

  const progressPercent =
    job.progress.totalImages > 0
      ? Math.round((job.progress.processedImages / job.progress.totalImages) * 100)
      : 0;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #DEE2E6",
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
            {job.name}
          </div>
          <div style={{ fontSize: 13, color: "#868E96" }}>
            {deptLabel} &middot; {job.images.length} images
            {job.discount && " &middot; Discounts attached"}
          </div>
        </div>

        <div
          style={{
            background: statusColor.bg,
            color: statusColor.text,
            padding: "4px 10px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          {job.status}
        </div>
      </div>

      {/* Progress bar for processing/queued */}
      {(job.status === "processing" || job.status === "queued") && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              height: 6,
              background: "#E9ECEF",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPercent}%`,
                background: job.status === "processing" ? "#51CF66" : "#FFD43B",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: "#868E96", marginTop: 4 }}>
            {job.progress.currentStep}
            {job.status === "processing" && ` (${progressPercent}%)`}
          </div>
        </div>
      )}

      {/* Error message */}
      {job.status === "failed" && job.error && (
        <div
          style={{
            background: "#FFF5F5",
            border: "1px solid #FFC9C9",
            borderRadius: 4,
            padding: 8,
            marginBottom: 12,
            fontSize: 13,
            color: "#C92A2A",
          }}
        >
          {job.error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {job.status === "completed" && onViewFlyer && (
          <button
            onClick={() => onViewFlyer(job)}
            style={{
              padding: "8px 16px",
              background: "#4C6EF5",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            View Flyer
          </button>
        )}

        {(job.status === "completed" || job.status === "failed" || job.status === "drafting") &&
          onDelete && (
            <button
              onClick={() => onDelete(job.id)}
              style={{
                padding: "8px 16px",
                background: "#F1F3F5",
                color: "#495057",
                border: "none",
                borderRadius: 6,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          )}
      </div>

      {/* Timestamp */}
      <div style={{ fontSize: 11, color: "#ADB5BD", marginTop: 12 }}>
        Created {new Date(job.createdAt).toLocaleString()}
        {job.completedAt && ` | Completed ${new Date(job.completedAt).toLocaleString()}`}
      </div>
    </div>
  );
}
