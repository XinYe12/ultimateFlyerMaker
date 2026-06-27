import type { ReplacementJob } from "../types";

type Props = {
  jobs: ReplacementJob[];
  onCancelJob?: (jobId: string) => void;
};

export default function IngestJobQueuePanel({ jobs, onCancelJob }: Props) {
  if (jobs.length === 0) return null;

  const doneJobs = jobs.filter(j => j.status === "done");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{
        fontSize: 11,
        fontWeight: "var(--font-bold)",
        color: "var(--color-text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}>
        Queue ({doneJobs.length}/{jobs.length})
      </div>
      {jobs.map((job) => (
        <div
          key={job.id}
          style={{
            background: "var(--color-bg-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 10px",
            border: "1px solid var(--color-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            {job.status === "processing" && (
              <div style={{
                width: 12, height: 12,
                border: "2px solid var(--color-border)",
                borderTopColor: "var(--color-primary)",
                borderRadius: "50%",
                animation: "ufm-spin 0.75s linear infinite",
                flexShrink: 0,
              }} />
            )}
            {job.status === "done" && (
              <span style={{ color: "var(--color-success)", fontSize: 13, lineHeight: 1, flexShrink: 0 }}>✓</span>
            )}
            {job.status === "error" && (
              <span style={{ color: "var(--color-error)", fontSize: 13, lineHeight: 1, flexShrink: 0 }}>✕</span>
            )}
            <span style={{ fontSize: 11, color: "var(--color-text)", flex: 1 }}>
              {job.status === "processing" ? "Processing…"
                : job.status === "done" ? "Done"
                : "Failed"}
            </span>
            {job.status === "processing" && onCancelJob && (
              <button
                type="button"
                onClick={() => onCancelJob(job.id)}
                style={{
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: "var(--font-semibold)",
                  cursor: "pointer",
                  border: "none",
                  borderRadius: 4,
                  background: "var(--color-error)",
                  color: "#fff",
                }}
              >
                Cancel
              </button>
            )}
          </div>

          <div style={{ height: 3, borderRadius: 2, background: "var(--color-border)", overflow: "hidden" }}>
            {job.status === "processing" && (
              <div style={{
                height: "100%",
                width: "30%",
                borderRadius: 2,
                background: "var(--color-primary)",
                animation: "ufm-progress-pulse 1.4s ease-in-out infinite",
              }} />
            )}
            {job.status === "done" && (
              <div style={{ height: "100%", width: "100%", borderRadius: 2, background: "var(--color-success)" }} />
            )}
            {job.status === "error" && (
              <div style={{ height: "100%", width: "100%", borderRadius: 2, background: "var(--color-error)" }} />
            )}
          </div>

          {job.status === "error" && job.errorMessage && (
            <div style={{ fontSize: 10, color: "var(--color-error)", marginTop: 4, lineHeight: 1.35 }}>
              {job.errorMessage}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
