// apps/desktop/src/renderer/export/ExportWarningDialog.tsx
// Warning dialog shown before exporting incomplete flyer

import { ExportReadinessCheck } from "./exportUtils";

type Props = {
  readinessCheck: ExportReadinessCheck;
  onProceed: () => void;
  onCancel: () => void;
};

export default function ExportWarningDialog({
  readinessCheck,
  onProceed,
  onCancel,
}: Props) {
  const { allReady, departments, notStartedCount, inProgressCount, readyCount } =
    readinessCheck;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 32,
          maxWidth: 500,
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {allReady ? (
          <>
            {/* All departments ready - confirmation dialog */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#D3F9D8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 24 }}>✓</span>
            </div>
            <h2 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 600 }}>
              Export Complete Flyer
            </h2>
            <p style={{ margin: "0 0 24px", color: "#666", fontSize: 15 }}>
              All {readyCount} departments are complete and ready to export.
            </p>
            <div
              style={{
                padding: 16,
                background: "#F8F9FA",
                borderRadius: 8,
                marginBottom: 24,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                Ready to export:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {departments.map((dept) => (
                  <span
                    key={dept.department}
                    style={{
                      padding: "4px 10px",
                      background: "#D3F9D8",
                      color: "#2F9E44",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {dept.label}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Some departments incomplete - warning dialog */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#FFE8CC",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 24 }}>⚠</span>
            </div>
            <h2 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 600 }}>
              Incomplete Flyer
            </h2>
            <p style={{ margin: "0 0 20px", color: "#666", fontSize: 15 }}>
              Some departments are not ready yet. Exporting now will create an
              incomplete flyer.
            </p>

            {/* Status Summary */}
            <div
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 20,
                padding: 16,
                background: "#F8F9FA",
                borderRadius: 8,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#2F9E44" }}>
                  {readyCount}
                </div>
                <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase" }}>
                  Ready
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#E67700" }}>
                  {inProgressCount}
                </div>
                <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase" }}>
                  In Progress
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#868E96" }}>
                  {notStartedCount}
                </div>
                <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase" }}>
                  Not Started
                </div>
              </div>
            </div>

            {/* Department List */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                Department Status:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {departments.map((dept) => {
                  let bgColor = "#F1F3F5";
                  let textColor = "#868E96";
                  let statusText = "Not started";

                  if (dept.status === "ready") {
                    bgColor = "#D3F9D8";
                    textColor = "#2F9E44";
                    statusText = `Ready (${dept.imageCount} items)`;
                  } else if (dept.status === "in-progress") {
                    bgColor = "#FFE8CC";
                    textColor = "#E67700";
                    statusText = `In progress (${dept.imageCount} items)`;
                  }

                  return (
                    <div
                      key={dept.department}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 12px",
                        background: bgColor,
                        borderRadius: 6,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#333" }}>
                        {dept.label}
                      </span>
                      <span style={{ fontSize: 12, color: textColor, fontWeight: 500 }}>
                        {statusText}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {notStartedCount > 0 && (
              <div
                style={{
                  padding: 12,
                  background: "#FFF3BF",
                  borderRadius: 8,
                  marginBottom: 20,
                  fontSize: 13,
                  color: "#E67700",
                }}
              >
                <strong>Note:</strong> Slots for incomplete departments will appear
                empty in the exported flyer.
              </div>
            )}
          </>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 20px",
              background: "#F1F3F5",
              color: "#495057",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onProceed}
            style={{
              padding: "10px 20px",
              background: allReady ? "#4C6EF5" : "#E67700",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {allReady ? "Export Flyer" : "Proceed Anyway"}
          </button>
        </div>
      </div>
    </div>
  );
}
