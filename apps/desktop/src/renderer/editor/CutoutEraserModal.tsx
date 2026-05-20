import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MAX_UNDO = 10;
const CHECKERBOARD = `repeating-conic-gradient(#bbb 0% 25%, #fff 0% 50%) 0 0 / 20px 20px`;

interface Props {
  cutoutPath: string;
  onSave: (newPath: string) => void;
  onClose: () => void;
}

export default function CutoutEraserModal({ cutoutPath, onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [brushRadius, setBrushRadius] = useState(30);
  const [saving, setSaving] = useState(false);
  const isPainting = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const undoStack = useRef<ImageData[]>([]);

  // Load image into canvas at natural resolution; CSS scales the element to fit viewport
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = cutoutPath.startsWith("file://") ? cutoutPath : `file://${cutoutPath}`;
  }, [cutoutPath]);

  // Convert a mouse event's CSS-space coords to canvas pixel coords
  const toCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  // Draw an eraser stroke segment from lastPos to (x, y).
  // Uses a round-capped line so consecutive segments join seamlessly — no gaps at any speed.
  const eraseStrokeTo = useCallback((x: number, y: number, radius: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = radius * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const from = lastPos.current ?? { x, y };
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
    lastPos.current = { x, y };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Snapshot before the stroke so undo restores the pre-stroke state
    const ctx = canvas.getContext("2d")!;
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.current = [...undoStack.current.slice(-(MAX_UNDO - 1)), snap];
    isPainting.current = true;
    const { x, y } = toCanvasCoords(e);
    lastPos.current = { x, y };
    eraseStrokeTo(x, y, brushRadius);
  }, [toCanvasCoords, eraseStrokeTo, brushRadius]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPainting.current) return;
    const { x, y } = toCanvasCoords(e);
    eraseStrokeTo(x, y, brushRadius);
  }, [toCanvasCoords, eraseStrokeTo, brushRadius]);

  const stopPainting = useCallback(() => {
    isPainting.current = false;
    lastPos.current = null;
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || undoStack.current.length === 0) return;
    const ctx = canvas.getContext("2d")!;
    const last = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    ctx.putImageData(last, 0, 0);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, onClose]);

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const result = await (window as any).ufm.saveErasedCutout(cutoutPath, dataUrl);
      if (result.ok) onSave(result.path);
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 20000,
        background: "rgba(0,0,0,0.82)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 12,
      }}
      onMouseDown={e => e.stopPropagation()}
      onMouseMove={e => e.stopPropagation()}
      onMouseUp={e => { e.stopPropagation(); stopPainting(); }}
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.stopPropagation()}
    >
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        background: "#1e1e1e", borderRadius: 8, padding: "8px 16px",
        color: "#fff", fontSize: 13, boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
        userSelect: "none",
      }}>
        <span style={{ fontWeight: 600 }}>✏️ Erase</span>
        <span style={{ color: "#aaa" }}>Brush:</span>
        <input
          type="range" min={5} max={80} value={brushRadius}
          onChange={e => setBrushRadius(Number(e.target.value))}
          style={{ width: 100 }}
        />
        <span style={{ minWidth: 32 }}>{brushRadius}px</span>
        <button
          onClick={undo}
          style={{ background: "#444", color: "#fff", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}
        >
          Undo
        </button>
        <div style={{ width: 1, height: 20, background: "#555" }} />
        <button
          onClick={handleSave} disabled={saving}
          style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 4, padding: "4px 16px", cursor: "pointer", fontWeight: 600 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onClose}
          style={{ background: "#555", color: "#fff", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>

      {/* Canvas — CSS max-width/max-height scales it; canvas pixel dimensions stay at natural size */}
      <div style={{ background: CHECKERBOARD, borderRadius: 4, overflow: "hidden", lineHeight: 0 }}>
        <canvas
          ref={canvasRef}
          style={{ display: "block", maxWidth: "82vw", maxHeight: "76vh", cursor: "crosshair" }}
          onMouseDown={e => { e.stopPropagation(); handleMouseDown(e); }}
          onMouseMove={e => { e.stopPropagation(); handleMouseMove(e); }}
          onMouseUp={e => { e.stopPropagation(); stopPainting(); }}
          onMouseLeave={e => { e.stopPropagation(); stopPainting(); }}
        />
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
