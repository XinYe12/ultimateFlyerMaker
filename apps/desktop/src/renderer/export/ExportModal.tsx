// apps/desktop/src/renderer/export/ExportModal.tsx
// Modal for exporting flyer with progress indicator

import { useState, useEffect } from "react";
import { FlyerJob } from "../types";
import { FlyerTemplateConfig } from "../editor/loadFlyerTemplateConfig";
import FlyerExportRenderer from "./FlyerExportRenderer";
import { exportFlyerToPDF, generateExportFilename, ExportProgress } from "./exportService";

type Props = {
  templateConfig: FlyerTemplateConfig;
  jobs: FlyerJob[];
  onClose: () => void;
};

export default function ExportModal({ templateConfig, jobs, onClose }: Props) {
  const [renderReady, setRenderReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Start export once rendering is complete
  useEffect(() => {
    if (renderReady && !exporting && !success && !error) {
      handleExport();
    }
  }, [renderReady]);

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

  const handleClose = () => {
    if (!exporting) {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        overflow: "auto",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 32,
          maxWidth: 600,
          width: "90%",
          boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h2 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 600 }}>
          Export Flyer
        </h2>

        {/* Progress/Status Display */}
        {!renderReady && !error && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div
              style={{
                width: 48,
                height: 48,
                border: "4px solid #f3f3f3",
                borderTop: "4px solid #4C6EF5",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <p style={{ color: "#666", fontSize: 15 }}>
              Preparing flyer for export...
            </p>
          </div>
        )}

        {renderReady && exporting && progress && (
          <div style={{ padding: "20px 0" }}>
            {/* Progress bar */}
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
                  background: "#4C6EF5",
                  width: `${(progress.currentPage / progress.totalPages) * 100}%`,
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            {/* Progress text */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                {progress.message}
              </div>
              <div style={{ fontSize: 14, color: "#666" }}>
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
              <span style={{ fontSize: 32, color: "#2F9E44" }}>✓</span>
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 600 }}>
              Export Complete!
            </h3>
            <p style={{ margin: 0, color: "#666", fontSize: 15 }}>
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
              <span style={{ fontSize: 32, color: "#C92A2A" }}>✕</span>
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 600 }}>
              Export Failed
            </h3>
            <p style={{ margin: 0, color: "#666", fontSize: 15 }}>{error}</p>
          </div>
        )}

        {/* Action Button */}
        {(success || error) && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
            <button
              onClick={handleClose}
              style={{
                padding: "10px 24px",
                background: "#4C6EF5",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Hidden renderer - renders flyer pages off-screen */}
      <div
        style={{
          position: "fixed",
          left: "-9999px",
          top: 0,
          width: "1650px", // Fixed width matching flyer template size
        }}
      >
        <FlyerExportRenderer
          templateConfig={templateConfig}
          jobs={jobs}
          onRenderComplete={() => setRenderReady(true)}
        />
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
