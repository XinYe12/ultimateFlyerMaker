// apps/desktop/src/renderer/export/ExportWarningDialog.tsx
// Warning dialog shown before exporting incomplete flyer

import { ExportReadinessCheck } from "./exportUtils";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";

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
  const {
    allReady,
    departments,
    notStartedCount,
    inProgressCount,
    readyCount,
  } = readinessCheck;

  return (
    <Modal open={true} onOpenChange={(open) => !open && onCancel()}>
      {allReady ? (
        <>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "#D3F9D8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "var(--space-4)",
            }}
          >
            <span style={{ fontSize: 24, color: "var(--color-success)" }}>
              ✓
            </span>
          </div>
          <h2
            style={{
              margin: "0 0 var(--space-3)",
              fontSize: "var(--text-xl)",
              fontWeight: "var(--font-semibold)",
              color: "var(--color-text)",
            }}
          >
            Export Complete Flyer
          </h2>
          <p
            style={{
              margin: "0 0 24px",
              color: "var(--color-text-muted)",
              fontSize: 15,
            }}
          >
            All {readyCount} departments are complete and ready to export.
          </p>
          <div
            style={{
              padding: "var(--space-4)",
              background: "var(--color-bg-subtle)",
              borderRadius: "var(--radius-md)",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: "var(--font-semibold)",
                marginBottom: "var(--space-2)",
              }}
            >
              Ready to export:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {departments.map((dept) => (
                <span
                  key={dept.department}
                  style={{
                    padding: "4px 10px",
                    background: "#D3F9D8",
                    color: "var(--color-success)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-sm)",
                    fontWeight: "var(--font-medium)",
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
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "#FFE8CC",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "var(--space-4)",
            }}
          >
            <span style={{ fontSize: 24 }}>⚠</span>
          </div>
          <h2
            style={{
              margin: "0 0 var(--space-3)",
              fontSize: "var(--text-xl)",
              fontWeight: "var(--font-semibold)",
              color: "var(--color-text)",
            }}
          >
            Incomplete Flyer
          </h2>
          <p
            style={{
              margin: "0 0 20px",
              color: "var(--color-text-muted)",
              fontSize: 15,
            }}
          >
            Some departments are not ready yet. Exporting now will create an
            incomplete flyer.
          </p>

          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              marginBottom: 20,
              padding: "var(--space-4)",
              background: "var(--color-bg-subtle)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: "var(--font-bold)",
                  color: "var(--color-success)",
                }}
              >
                {readyCount}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                }}
              >
                Ready
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: "var(--font-bold)",
                  color: "var(--color-warning)",
                }}
              >
                {inProgressCount}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                }}
              >
                In Progress
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: "var(--font-bold)",
                  color: "var(--color-text-muted)",
                }}
              >
                {notStartedCount}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                }}
              >
                Not Started
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: "var(--font-semibold)",
                marginBottom: "var(--space-2)",
              }}
            >
              Department Status:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {departments.map((dept) => {
                let bgColor = "var(--color-bg-subtle)";
                let textColor = "var(--color-text-muted)";
                let statusText = "Not started";

                if (dept.status === "ready") {
                  bgColor = "#D3F9D8";
                  textColor = "var(--color-success)";
                  statusText = `Ready (${dept.imageCount} items)`;
                } else if (dept.status === "in-progress") {
                  bgColor = "#FFE8CC";
                  textColor = "var(--color-warning)";
                  statusText = `In progress (${dept.imageCount} items)`;
                }

                return (
                  <div
                    key={dept.department}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "var(--space-2) var(--space-3)",
                      background: bgColor,
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--text-sm)",
                        fontWeight: "var(--font-medium)",
                        color: "var(--color-text)",
                      }}
                    >
                      {dept.label}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--text-sm)",
                        color: textColor,
                        fontWeight: "var(--font-medium)",
                      }}
                    >
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
                padding: "var(--space-3)",
                background: "#FFF3BF",
                borderRadius: "var(--radius-md)",
                marginBottom: 20,
                fontSize: "var(--text-sm)",
                color: "var(--color-warning)",
              }}
            >
              <strong>Note:</strong> Slots for incomplete departments will
              appear empty in the exported flyer.
            </div>
          )}
        </>
      )}

      <div
        style={{
          display: "flex",
          gap: "var(--space-3)",
          justifyContent: "flex-end",
        }}
      >
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onProceed}
          style={
            !allReady
              ? {
                  background: "var(--color-warning)",
                }
              : undefined
          }
        >
          {allReady ? "Export Flyer" : "Proceed Anyway"}
        </Button>
      </div>
    </Modal>
  );
}
