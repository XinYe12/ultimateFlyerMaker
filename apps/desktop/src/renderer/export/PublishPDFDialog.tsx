// Dialog for publishing a locally-selected PDF to the website via GitHub.

import { useState } from "react";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";

type UploadState = "idle" | "uploading" | "done" | "error";

type Props = {
  onClose: () => void;
};

export default function PublishPDFDialog({ onClose }: Props) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadResult, setUploadResult] = useState<{ fileUrl: string; liveUrl: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleChoose = async () => {
    const result = await (window as any).ufm.openPdfDialog();
    if (!result) return;
    setSelectedFile(result.filePath);
    setBase64(result.base64);
    setUploadState("idle");
    setUploadResult(null);
    setUploadError(null);
  };

  const handleUpload = async () => {
    if (!base64) return;
    setUploadState("uploading");
    setUploadError(null);
    try {
      const result = await (window as any).ufm.uploadFlyerPDF(base64);
      setUploadResult(result);
      setUploadState("done");
    } catch (err: any) {
      setUploadError(err?.message ?? "Upload failed");
      setUploadState("error");
    }
  };

  const filename = selectedFile ? selectedFile.split(/[\\/]/).pop() : null;
  const busy = uploadState === "uploading";

  return (
    <Modal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} closeOnOverlayClick={!busy} contentStyle={{ maxWidth: 520 }}>
      <h2 style={{ margin: "0 0 20px", fontSize: "var(--text-xl)", fontWeight: "var(--font-semibold)", color: "var(--color-text)" }}>
        Publish PDF to Website
      </h2>

      {/* File picker */}
      <div style={{
        border: "1.5px dashed #cbd5e1", borderRadius: 10, padding: "20px 16px",
        textAlign: "center", marginBottom: 20, background: "#f8fafc",
      }}>
        {filename ? (
          <div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 12, wordBreak: "break-all" }}>
              <span style={{ fontWeight: 600, color: "#1e293b" }}>{filename}</span>
            </div>
            <button
              onClick={handleChoose}
              style={{
                padding: "5px 14px", fontSize: 12, borderRadius: 6,
                border: "1px solid #cbd5e1", background: "#fff",
                color: "#475569", cursor: "pointer",
              }}
            >
              Choose different file
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 12 }}>
              Select the PDF file you want to publish
            </div>
            <Button variant="secondary" onClick={handleChoose}>
              Choose PDF…
            </Button>
          </div>
        )}
      </div>

      {/* Upload status */}
      {uploadState === "uploading" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#64748b", fontSize: 14, marginBottom: 16 }}>
          <div style={{
            width: 18, height: 18, border: "3px solid #f1f5f9",
            borderTop: "3px solid var(--color-primary)", borderRadius: "50%",
            animation: "ufm-spin 1s linear infinite", flexShrink: 0,
          }} />
          Committing to GitHub…
        </div>
      )}

      {uploadState === "done" && uploadResult && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", background: "#dcfce7",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <span style={{ fontSize: 13, color: "#16a34a" }}>✓</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#15803d" }}>
              Published — Flipp will pick it up on its next fetch.
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Live URL:</div>
          <div style={{
            background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
            padding: "8px 12px", fontSize: 12, fontFamily: "monospace",
            color: "#475569", wordBreak: "break-all", marginBottom: 8,
          }}>
            {uploadResult.liveUrl}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { void navigator.clipboard.writeText(uploadResult.liveUrl); }}
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, color: "#475569", cursor: "pointer" }}
            >
              Copy URL
            </button>
            <button
              onClick={() => { (window as any).ufm?.openExternal?.(uploadResult.fileUrl); }}
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, color: "#475569", cursor: "pointer" }}
            >
              View commit ↗
            </button>
          </div>
        </div>
      )}

      {uploadState === "error" && (
        <div style={{ marginBottom: 16, padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>
          {uploadError}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {uploadState === "done" ? "Close" : "Cancel"}
        </Button>
        {base64 && uploadState !== "done" && (
          <Button variant="primary" onClick={handleUpload} disabled={busy}>
            {uploadState === "uploading" ? "Uploading…" : uploadState === "error" ? "Retry" : "Publish to Website"}
          </Button>
        )}
      </div>

      <style>{`@keyframes ufm-spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>
    </Modal>
  );
}
