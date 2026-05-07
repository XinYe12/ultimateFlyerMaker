import type { DeptSaveEntry } from "../App";

interface Props {
  saves: DeptSaveEntry[];
}

export default function DepartmentSaveProgress({ saves }: Props) {
  if (saves.length === 0) return null;

  return (
    <div style={{
      position: "fixed", bottom: 52, right: 12, zIndex: 9998,
      display: "flex", flexDirection: "column", gap: 6,
      pointerEvents: "none",
    }}>
      {saves.map((entry, i) => (
        <div key={`${entry.dept}-${i}`} style={{
          background: "rgba(30,41,59,0.88)", color: "#e2e8f0",
          borderRadius: 8, padding: "6px 14px",
          fontSize: 12, fontFamily: "var(--font-mono, monospace)",
          display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          opacity: entry.status === "saving" ? 1 : 0.75,
          transition: "opacity 0.4s",
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: entry.status === "done" ? "#22c55e"
              : entry.status === "error" ? "#ef4444"
              : "#f59e0b",
          }} />
          <span style={{ textTransform: "capitalize" }}>{entry.dept}</span>
          <span style={{ color: "#94a3b8" }}>
            {entry.status === "saving"
              ? `saving ${entry.done} / ${entry.total}…`
              : entry.status === "done"
              ? `saved ${entry.done} item${entry.done !== 1 ? "s" : ""}`
              : "save failed"}
          </span>
        </div>
      ))}
    </div>
  );
}
