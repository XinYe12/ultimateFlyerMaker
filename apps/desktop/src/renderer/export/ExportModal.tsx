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

type UploadState = "idle" | "uploading" | "done" | "error";

type Props = {
  templateConfig: FlyerTemplateConfig;
  jobs: FlyerJob[];
  onClose: () => void;
  onSuccess?: () => void;
};

export default function ExportModal({
  templateConfig,
  jobs,
  onClose,
  onSuccess,
}: Props) {
  const [renderReady, setRenderReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadResult, setUploadResult] = useState<{ fileUrl: string; liveUrl: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    setError(null);

    try {
      const filename = generateExportFilename(templateConfig.templateId);

      const result = await exportFlyerToPDF({
        filename,
        onProgress: (prog) => setProgress(prog),
      });

      setPdfBase64(result.pdfBase64);
      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      console.error("Export failed:", err);
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleUpload = async () => {
    if (!pdfBase64) return;
    setUploadState("uploading");
    setUploadError(null);
    try {
      const result = await (window as any).ufm.uploadFlyerPDF(pdfBase64, testMode);
      setUploadResult(result);
      setUploadState("done");
    } catch (err: any) {
      setUploadError(err?.message ?? "Upload failed");
      setUploadState("error");
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
        closeOnOverlayClick={canClose && Boolean(showCloseButton)}
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
          <div style={{ padding: "32px 0 8px" }}>
            {/* Export success row */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%", background: "#D3F9D8",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <span style={{ fontSize: 24, color: "var(--color-success)" }}>✓</span>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: "var(--font-semibold)", color: "var(--color-text)" }}>
                  PDF saved to your computer
                </div>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>
                  Flyer exported successfully.
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid var(--color-border, #e2e8f0)", marginBottom: 24 }} />

            {/* Upload to Flipp section */}
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              Step 2 — Publish to Website
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
              Upload the PDF to your website so Flipp can fetch the latest flyer.
            </p>

            {uploadState === "idle" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 8, padding: 3, gap: 2 }}>
                    {(["Test", "Live"] as const).map(mode => {
                      const active = (mode === "Test") === testMode;
                      return (
                        <button
                          key={mode}
                          onClick={() => setTestMode(mode === "Test")}
                          style={{
                            padding: "4px 14px", borderRadius: 6, border: "none", fontSize: 13, fontWeight: 600,
                            cursor: "pointer",
                            background: active ? "#fff" : "transparent",
                            color: active ? (mode === "Live" ? "#16a34a" : "#2563eb") : "#94a3b8",
                            boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                            transition: "all 120ms",
                          }}
                        >
                          {mode}
                        </button>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    {testMode ? "→ flyer/test-upload.pdf" : "→ flyer/london.pdf"}
                  </span>
                </div>
                <Button variant="primary" onClick={handleUpload}>
                  {testMode ? "Upload as Test" : "Publish Live"}
                </Button>
              </div>
            )}

            {uploadState === "uploading" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--color-text-muted)", fontSize: 14 }}>
                <div style={{
                  width: 20, height: 20, border: "3px solid #f3f3f3",
                  borderTop: "3px solid var(--color-primary)", borderRadius: "50%",
                  animation: "ufm-spin 1s linear infinite", flexShrink: 0,
                }} />
                Committing PDF to GitHub...
              </div>
            )}

            {uploadState === "done" && uploadResult && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", background: "#D3F9D8",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 14, color: "var(--color-success)" }}>✓</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
                    Committed to GitHub — Flipp will pick it up shortly.
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>Live URL (may take ~1 min for GitHub Pages to deploy):</div>
                <div style={{
                  background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
                  padding: "10px 12px", fontSize: 12, fontFamily: "monospace",
                  color: "#475569", wordBreak: "break-all", marginBottom: 8,
                }}>
                  {uploadResult.liveUrl}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => { void navigator.clipboard.writeText(uploadResult.liveUrl); }}
                    style={{
                      padding: "6px 14px", borderRadius: 6,
                      border: "1px solid #e2e8f0", background: "#fff",
                      fontSize: 12, color: "#475569", cursor: "pointer",
                    }}
                  >
                    Copy URL
                  </button>
                  <button
                    onClick={() => { (window as any).ufm?.openExternal?.(uploadResult.fileUrl); }}
                    style={{
                      padding: "6px 14px", borderRadius: 6,
                      border: "1px solid #e2e8f0", background: "#fff",
                      fontSize: 12, color: "#475569", cursor: "pointer",
                    }}
                  >
                    View commit on GitHub ↗
                  </button>
                </div>
              </div>
            )}

            {uploadState === "error" && (
              <div>
                <div style={{ color: "var(--color-error)", fontSize: 14, marginBottom: 10 }}>
                  Upload failed: {uploadError}
                </div>
                <Button variant="secondary" onClick={handleUpload}>
                  Retry Upload
                </Button>
              </div>
            )}
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

      {/* Hidden renderer - positioned at left:0 so html2canvas captures the full width.
          z-index:-1 places it behind the modal backdrop (z-index:10000) and the main UI. */}
      <div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: "1650px",
          zIndex: -1,
          pointerEvents: "none",
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
