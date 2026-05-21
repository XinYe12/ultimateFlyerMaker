// apps/desktop/src/renderer/jobs/JobPipelineTimingsSummary.tsx
// Per-item flyer automation pipeline timings (from JobProcessor)

import { FlyerJobPipelineStepMs, ImageTask } from "../types";

const PIPELINE_STEP_META: { key: keyof FlyerJobPipelineStepMs; label: string }[] = [
  { key: "discountSearchInitialMs", label: "Discount / DB search (initial)" },
  { key: "dbBuildInitialMs", label: "DB match + download build" },
  { key: "discountSearchTextOnlyMs", label: "Discount search (text-only retry)" },
  { key: "dbBuildTextOnlyMs", label: "DB build (after text-only search)" },
  { key: "serperApiMs", label: "Serper image search API" },
  { key: "serperFetchMs", label: "Serper image downloads (sum)" },
  { key: "serperRembgMs", label: "Cutout / rembg (sum)" },
  { key: "serperShadowMs", label: "Shadow overlay (sum)" },
  { key: "serperLastResortMs", label: "Serper last-resort attempt" },
  { key: "ingestPhotoMs", label: "Full ingest (photo job)" },
];

export function itemDisplayLabel(img: { queryLabel?: string; path?: string }): string {
  if (img.queryLabel) return img.queryLabel;
  const p = img.path || "";
  const s = p.replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : p || "Item";
}

function formatPipelineSteps(ps: FlyerJobPipelineStepMs): { label: string; ms: number }[] {
  const rows: { label: string; ms: number }[] = [];
  for (const { key, label } of PIPELINE_STEP_META) {
    const v = ps[key];
    if (typeof v === "number" && v > 0) rows.push({ label, ms: v });
  }
  return rows;
}

type Props = {
  processedImages: ImageTask[];
};

export default function JobPipelineTimingsSummary({ processedImages }: Props) {
  const timedImages = processedImages.filter((img) => img.pipelineStepMs);
  if (timedImages.length === 0) return null;

  return (
    <details
      style={{
        marginTop: 12,
        padding: "8px 10px",
        background: "#F8F9FA",
        borderRadius: 6,
        border: "1px solid #E9ECEF",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "#495057",
          userSelect: "none",
        }}
      >
        Pipeline timings ({timedImages.length} items)
      </summary>
      <div
        style={{
          marginTop: 10,
          maxHeight: 260,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {timedImages.map((img) => {
          const ps = img.pipelineStepMs as FlyerJobPipelineStepMs;
          const steps = formatPipelineSteps(ps);
          return (
            <div
              key={img.id}
              style={{
                padding: "8px 10px",
                background: "#fff",
                borderRadius: 6,
                border: "1px solid #E9ECEF",
                fontSize: 11,
              }}
            >
              <div style={{ fontWeight: 700, color: "#212529", marginBottom: 6 }}>
                {itemDisplayLabel(img)}
                {ps.itemFailed && (
                  <span style={{ marginLeft: 8, color: "#C92A2A", fontWeight: 600 }}>(failed / timeout)</span>
                )}
              </div>
              {steps.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 16, color: "#495057", lineHeight: 1.5 }}>
                  {steps.map((row) => (
                    <li key={row.label}>
                      {row.label}: <strong>{(row.ms / 1000).toFixed(2)}s</strong> ({row.ms} ms)
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: "#868E96" }}>No step breakdown (only total).</div>
              )}
              <div style={{ marginTop: 6, color: "#1971C2", fontWeight: 600 }}>
                Total: {(ps.totalMs / 1000).toFixed(2)}s ({ps.totalMs} ms)
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
