// apps/desktop/src/renderer/export/ExportModal.tsx
// Modal for exporting flyer with progress indicator

import { useState, useEffect } from "react";
import { FlyerJob } from "../types";
import { FlyerTemplateConfig } from "../editor/loadFlyerTemplateConfig";
import FlyerExportRenderer from "./FlyerExportRenderer";
import {
  exportFlyerToPDF,
  generateExportFilename,
  ExportProgress,
} from "./exportService";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";

type Props = {
  templateConfig: FlyerTemplateConfig;
  jobs: FlyerJob[];
  onClose: () => void;
};

export default function ExportModal({
  templateConfig,
  jobs,
  onClose,
}: Props) {
  const [renderReady, setRenderReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    setError(null);

    try {
      const filename = generateExportFilename(templateConfig.templateId);

      await exportFlyerToPDF({
        filename,
        onProgress: (prog) => setProgress(prog),
      });

      setSuccess(true);
    } catch (err) {
      console.error("Export failed:", err);
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Start export once rendering is complete
  useEffect(() => {
    if (renderReady && !exporting && !success && !error) {
      handleExport();
    }
  }, [renderReady]);

  const handleClose = () => {
    if (!exporting) {
      onClose();
    }
  };

  const showCloseButton = success || error;
  const canClose = !exporting;

  return (
    <>
      <Modal
        open={true}
        onOpenChange={(open) => {
          if (!open && canClose) handleClose();
        }}
        closeOnOverlayClick={canClose && showCloseButton}
        contentStyle={{ maxWidth: 600 }}
      >
        <h2
          style={{
            margin: "0 0 20px",
            fontSize: "var(--text-xl)",
            fontWeight: "var(--font-semibold)",
            color: "var(--color-text)",
          }}
        >
          Export Flyer
        </h2>

        {!renderReady && !error && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div
              style={{
                width: 48,
                height: 48,
                border: "4px solid #f3f3f3",
                borderTop: "4px solid var(--color-primary)",
                borderRadius: "50%",
                animation: "ufm-spin 1s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <p
              style={{
                color: "var(--color-text-muted)",
                fontSize: 15,
              }}
            >
              Preparing flyer for export...
            </p>
          </div>
        )}

        {renderReady && exporting && progress && (
          <div style={{ padding: "20px 0" }}>
            <div
              style={{
                width: "100%",
                height: 8,
                background: "#f3f3f3",
                borderRadius: 4,
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "var(--color-primary)",
                  width: `${(progress.currentPage / progress.totalPages) * 100}%`,
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "var(--text-lg)",
                  fontWeight: "var(--font-semibold)",
                  marginBottom: 8,
                }}
              >
                {progress.message}
              </div>
              <div
                style={{
                  fontSize: "var(--text-base)",
                  color: "var(--color-text-muted)",
                }}
              >
                Page {progress.currentPage} of {progress.totalPages}
              </div>
            </div>
          </div>
        )}

        {success && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#D3F9D8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <span style={{ fontSize: 32, color: "var(--color-success)" }}>
                ✓
              </span>
            </div>
            <h3
              style={{
                margin: "0 0 8px",
                fontSize: 20,
                fontWeight: "var(--font-semibold)",
                color: "var(--color-text)",
              }}
            >
              Export Complete!
            </h3>
            <p
              style={{
                margin: 0,
                color: "var(--color-text-muted)",
                fontSize: 15,
              }}
            >
              Your flyer has been saved successfully.
            </p>
          </div>
        )}

        {error && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#FFE3E3",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <span style={{ fontSize: 32, color: "var(--color-error)" }}>
                ✕
              </span>
            </div>
            <h3
              style={{
                margin: "0 0 8px",
                fontSize: 20,
                fontWeight: "var(--font-semibold)",
                color: "var(--color-text)",
              }}
            >
              Export Failed
            </h3>
            <p
              style={{
                margin: 0,
                color: "var(--color-text-muted)",
                fontSize: 15,
              }}
            >
              {error}
            </p>
          </div>
        )}

        {showCloseButton && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: 24,
            }}
          >
            <Button variant="primary" onClick={handleClose}>
              Close
            </Button>
          </div>
        )}
      </Modal>

      {/* Hidden renderer - renders flyer pages off-screen */}
      <div
        style={{
          position: "fixed",
          left: "-9999px",
          top: 0,
          width: "1650px",
        }}
      >
        <FlyerExportRenderer
          templateConfig={templateConfig}
          jobs={jobs}
          onRenderComplete={() => setRenderReady(true)}
        />
      </div>

      <style>{`
        @keyframes ufm-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
