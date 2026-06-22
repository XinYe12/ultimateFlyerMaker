import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MAX_UNDO = 10;
const CHECKERBOARD = `repeating-conic-gradient(#bbb 0% 25%, #fff 0% 50%) 0 0 / 20px 20px`;
const COUNTDOWN_SECS = 4;

interface Props {
  cutoutPath: string;
  sourcePath?: string | null;
  sourceUrl?: string | null;
  onSave: (newPath: string) => void;
  onClose: () => void;
}

type ToolMode = "erase" | "keep" | "remove";
type EditSource = "source" | "cutout" | "smart";

function canvasAlphaStats(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let opaque = 0;
  let transparent = 0;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = data[(y * canvas.width + x) * 4 + 3];
      if (alpha > 10) {
        opaque++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        transparent++;
      }
    }
  }

  return {
    opaqueFraction: opaque / Math.max(1, canvas.width * canvas.height),
    transparentFraction: transparent / Math.max(1, canvas.width * canvas.height),
    bbox: maxX >= minX && maxY >= minY
      ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
      : null,
  };
}

function trimmedCanvasDataUrl(canvas: HTMLCanvasElement, padding = 20) {
  const stats = canvasAlphaStats(canvas);
  if (!stats.bbox) return null;
  const x = Math.max(0, stats.bbox.x - padding);
  const y = Math.max(0, stats.bbox.y - padding);
  const right = Math.min(canvas.width, stats.bbox.x + stats.bbox.width + padding);
  const bottom = Math.min(canvas.height, stats.bbox.y + stats.bbox.height + padding);
  const out = document.createElement("canvas");
  out.width = Math.max(1, right - x);
  out.height = Math.max(1, bottom - y);
  const outCtx = out.getContext("2d")!;
  outCtx.drawImage(canvas, x, y, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

function shouldExtractFromCanvas(canvas: HTMLCanvasElement, source: EditSource, dirtyErase: boolean) {
  const stats = canvasAlphaStats(canvas);
  return source === "source" || (dirtyErase && stats.transparentFraction < 0.5);
}

export default function CutoutEraserModal({ cutoutPath, sourcePath, sourceUrl, onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [brushRadius, setBrushRadius] = useState(30);
  const [saving, setSaving] = useState(false);
  const [refining, setRefining] = useState(false);
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const [mode, setMode] = useState<ToolMode>("erase");
  const baseCutoutPath = useCallback((p: string) => (
    p.replace(/(?:\.(?:erased|extracted|smart)-\d+)+(?=\.png$)/g, "")
  ), []);

  const originalEditPath = useMemo(() => baseCutoutPath(cutoutPath), [baseCutoutPath, cutoutPath]);
  const isSavedEditPath = useMemo(() => /(?:\.smart-\d+|\.erased-\d+)(?=\.png$)/i.test(cutoutPath), [cutoutPath]);
  const [currentPath, setCurrentPath] = useState(originalEditPath);
  const [currentSource, setCurrentSource] = useState<EditSource>("cutout");
  const [originalSourcePath, setOriginalSourcePath] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [smartPoints, setSmartPoints] = useState<Array<{ x: number; y: number; kind: "keep" | "remove" }>>([]);
  const [dirtyErase, setDirtyErase] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef = useRef({
    smartPoints: [] as Array<{ x: number; y: number; kind: "keep" | "remove" }>,
    currentSource: "cutout" as EditSource,
    dirtyErase: false,
    currentPath: "",
    originalSourcePath: null as string | null,
    brushRadius: 30,
  });

  const comparisonSrc = useMemo(() => {
    const p = originalSourcePath || sourcePath;
    if (p) return p.startsWith("file://") ? p : `file://${p}`;
    return sourceUrl ?? null;
  }, [originalSourcePath, sourcePath, sourceUrl]);
  const [message, setMessage] = useState<string>("Erase background, or use smart clicks to teach the mask.");
  const isPainting = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const undoStack = useRef<ImageData[]>([]);
  const smartPathHistory = useRef<string[]>([]);

  // Keep liveRef in sync so timer callbacks always read the latest state
  useEffect(() => {
    liveRef.current = { smartPoints, currentSource, dirtyErase, currentPath, originalSourcePath, brushRadius };
  });

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
  }, []);

  const cancelCountdown = useCallback(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
    countdownIntervalRef.current = null;
    submitTimeoutRef.current = null;
    setCountdown(null);
  }, []);

  const requestOriginalPath = useCallback(() => (
    (window as any).ufm.restoreOriginalCutout?.({
      cutoutPath,
      sourcePath,
      sourceUrl,
    }) ?? Promise.resolve({ ok: false, error: "Original restore API is unavailable." })
  ), [cutoutPath, sourcePath, sourceUrl]);

  useEffect(() => {
    let cancelled = false;
    cancelCountdown();
    setSmartPoints([]);
    setDirtyErase(false);
    smartPathHistory.current = [];
    setOriginalSourcePath(null);

    // Always start with the existing cutout so smart clicks refine the existing alpha
    // mask rather than triggering a fresh ML extraction. Users can click "Revert Original"
    // to restart from the source image if they want to redo from scratch.
    const startPath = isSavedEditPath ? cutoutPath : originalEditPath;
    setCurrentPath(startPath);
    setCurrentSource("cutout");
    setReloadTick(t => t + 1);
    setLoadingOriginal(false);
    setMessage("Editing the cutout. Erase background or use smart clicks. Use \"Revert Original\" to start from scratch.");

    // Load the original source path in the background so "Revert Original" is available.
    requestOriginalPath().then((result: { ok: boolean; path?: string; error?: string }) => {
      if (!cancelled && result?.ok && result.path) {
        setOriginalSourcePath(result.path);
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [cancelCountdown, requestOriginalPath, originalEditPath, cutoutPath, isSavedEditPath]);

  // Load image into canvas at natural resolution; CSS scales the element to fit viewport
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.onerror = () => {
      if (cancelled) return;
      const fallback = baseCutoutPath(currentPath);
      if (fallback !== currentPath) {
        setCurrentPath(fallback);
        setCurrentSource("cutout");
        setMessage("Preview file was missing; reverted to the base cutout.");
      } else {
        setMessage("Could not load this cutout preview.");
      }
    };
    // Append timestamp to bust Chromium's file:// cache so the canvas always
    // reflects the current on-disk content rather than a stale cached version.
    const fileUrl = currentPath.startsWith("file://") ? currentPath : `file://${currentPath}`;
    img.src = `${fileUrl}?t=${Date.now()}`;
    return () => { cancelled = true; };
  }, [currentPath, baseCutoutPath, reloadTick]);

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
    setDirtyErase(true);
  }, []);

  const persistWorkingCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Canvas is unavailable.");
    if (!dirtyErase) return currentPath;

    const dataUrl = canvas.toDataURL("image/png");
    const result = shouldExtractFromCanvas(canvas, currentSource, dirtyErase)
      ? await (window as any).ufm.cutoutEditedImage(originalEditPath, dataUrl)
      : await (window as any).ufm.saveErasedCutout(
          currentPath,
          dataUrl,
          { sourceMode: false },
        );
    if (!result?.ok || !result.path) {
      throw new Error(result?.error || "Could not prepare the erased image for editing.");
    }
    setCurrentPath(result.path);
    setCurrentSource("smart");
    setDirtyErase(false);
    return result.path as string;
  }, [currentPath, currentSource, dirtyErase, originalEditPath]);

  const submitSmartClicks = useCallback(async () => {
    const { smartPoints: pts, currentSource: src, dirtyErase: dirty,
            currentPath: cp, originalSourcePath: osp, brushRadius: br } = liveRef.current;
    if (pts.length === 0) return;
    setRefining(true);
    setMessage("Processing smart clicks...");
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const sourceLike = shouldExtractFromCanvas(canvas, src, dirty);
      if (sourceLike) {
        setMessage("Running initial extraction...");
        const dataUrl = canvas.toDataURL("image/png");
        const extracted = await (window as any).ufm.cutoutEditedImage(originalEditPath, dataUrl);
        if (!extracted?.ok || !extracted.path) throw new Error(extracted?.error || "Could not extract initial mask.");
        setMessage("Applying smart refinement...");
        const refineResult = await (window as any).ufm.refineCutoutWithClicks({
          image_path: osp || sourcePath || null,
          cutout_path: extracted.path,
          positive_points: pts.filter(p => p.kind === "keep").map(({ x, y }) => ({ x, y })),
          negative_points: pts.filter(p => p.kind === "remove").map(({ x, y }) => ({ x, y })),
          point_radius: Math.max(8, Math.round(br * 0.75)),
        });
        smartPathHistory.current = [...smartPathHistory.current, cp];
        const finalPath = refineResult.ok && refineResult.path ? refineResult.path : extracted.path;
        setCurrentPath(finalPath);
        setCurrentSource("smart");
        setDirtyErase(false);
        setMessage("Done. Add more clicks or Save.");
        return;
      }
      const workingPath = dirty ? await persistWorkingCanvas() : cp;
      const result = await (window as any).ufm.refineCutoutWithClicks({
        image_path: osp || sourcePath || null,
        cutout_path: workingPath,
        positive_points: pts.filter(p => p.kind === "keep").map(({ x, y }) => ({ x, y })),
        negative_points: pts.filter(p => p.kind === "remove").map(({ x, y }) => ({ x, y })),
        point_radius: Math.max(8, Math.round(br * 0.75)),
      });
      if (result.ok && result.path) {
        smartPathHistory.current = [...smartPathHistory.current, workingPath];
        setCurrentPath(result.path);
        setCurrentSource("smart");
        setDirtyErase(false);
        setMessage("Preview updated. Add more clicks or Save.");
      } else {
        setMessage(result.error || "Smart refinement failed.");
      }
    } catch (err: any) {
      setMessage(err?.message || String(err));
    } finally {
      setRefining(false);
      setCountdown(null);
    }
  }, [originalEditPath, sourcePath, persistWorkingCanvas]);

  const startOrResetCountdown = useCallback(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
    setCountdown(COUNTDOWN_SECS);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
    }, 1000);
    submitTimeoutRef.current = setTimeout(() => {
      clearInterval(countdownIntervalRef.current!);
      countdownIntervalRef.current = null;
      setCountdown(null);
      submitSmartClicks();
    }, COUNTDOWN_SECS * 1000);
  }, [submitSmartClicks]);

  const handleMouseDown = useCallback(async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = toCanvasCoords(e);

    if (mode === "keep" || mode === "remove") {
      if (refining) return;
      setSmartPoints(prev => {
        const next = [...prev, { x, y, kind: mode }];
        liveRef.current.smartPoints = next;
        return next;
      });
      startOrResetCountdown();
      return;
    }

    // Snapshot before the stroke so undo restores the pre-stroke state
    const ctx = canvas.getContext("2d")!;
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.current = [...undoStack.current.slice(-(MAX_UNDO - 1)), snap];
    isPainting.current = true;
    lastPos.current = { x, y };
    eraseStrokeTo(x, y, brushRadius);
  }, [toCanvasCoords, eraseStrokeTo, brushRadius, mode, refining, startOrResetCountdown]);

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
    if (mode !== "erase" && smartPathHistory.current.length > 0) {
      const previous = smartPathHistory.current[smartPathHistory.current.length - 1];
      smartPathHistory.current = smartPathHistory.current.slice(0, -1);
      setSmartPoints(prev => prev.slice(0, -1));
      setCurrentPath(previous);
      setCurrentSource(previous === originalSourcePath ? "source" : previous === originalEditPath ? "cutout" : "smart");
      setDirtyErase(false);
      setMessage("Reverted the last smart click.");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || undoStack.current.length === 0) return;
    const ctx = canvas.getContext("2d")!;
    const last = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    ctx.putImageData(last, 0, 0);
    setDirtyErase(true);
  }, [mode, originalSourcePath, originalEditPath]);

  const revertOriginal = useCallback(async () => {
    cancelCountdown();
    setSmartPoints([]);
    smartPathHistory.current = [];
    setLoadingOriginal(true);
    setMessage("Loading original image...");
    try {
      let source = originalSourcePath;
      if (!source) {
        const result: { ok: boolean; path?: string; error?: string } = await requestOriginalPath();
        if (result?.ok && result.path) {
          source = result.path;
          setOriginalSourcePath(result.path);
        } else {
          throw new Error(result?.error || "Original image unavailable.");
        }
      }
      setCurrentPath(source);
      setCurrentSource("source");
      setDirtyErase(false);
      setReloadTick(t => t + 1);
      setMessage("Reverted to the original image.");
    } catch (err: any) {
      setCurrentPath(originalEditPath);
      setCurrentSource("cutout");
      setDirtyErase(false);
      setReloadTick(t => t + 1);
      setMessage(err?.message || "Original image unavailable; reverted to the previous cutout.");
    } finally {
      setLoadingOriginal(false);
    }
  }, [cancelCountdown, originalSourcePath, originalEditPath, requestOriginalPath]);

  const revertCutout = useCallback(() => {
    cancelCountdown();
    setSmartPoints([]);
    smartPathHistory.current = [];
    setCurrentPath(cutoutPath);
    setCurrentSource("cutout");
    setDirtyErase(false);
    setReloadTick(t => t + 1);
    setMessage("Reverted to the saved cutout.");
  }, [cancelCountdown, cutoutPath]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, onClose]);

  const handleSave = async () => {
    cancelCountdown();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      // Fast path: nothing was changed — return the current path without re-encoding
      // the canvas. The toDataURL round-trip premultiplies alpha and rounds low-alpha
      // shadow pixels to 0, shifting the bounding box and making the product appear cropped.
      if (!dirtyErase && currentSource !== "source") {
        onSave(currentPath);
        return;
      }
      // Always save the canvas as-is — never re-run ML inference from the Save button.
      // ML extraction (cutoutEditedImage) is only triggered by smart clicks, not by Save.
      const dataUrl = canvas.toDataURL("image/png");
      if (!dataUrl) {
        setMessage("Nothing visible to save.");
        return;
      }
      const result = await (window as any).ufm.saveErasedCutout(
        currentSource === "source" ? originalEditPath : currentPath,
        dataUrl,
        { sourceMode: currentSource === "source" },
      );
      if (result.ok && result.path) onSave(result.path);
      else setMessage(result.error || "Could not save edited cutout.");
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
        <span style={{ fontWeight: 600 }}>Fix Cutout</span>
        {([
          ["erase", "Erase"],
          ["keep", "Keep Product"],
          ["remove", "Remove Background"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              if ((id === "keep" || id === "remove") && (mode === "keep" || mode === "remove")
                  && id !== mode && liveRef.current.smartPoints.length > 0) {
                startOrResetCountdown();
              }
              setMode(id);
            }}
            disabled={refining || loadingOriginal}
            style={{
              background: mode === id ? (id === "keep" ? "#16a34a" : id === "remove" ? "#dc2626" : "#2563eb") : "#444",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: refining || loadingOriginal ? "wait" : "pointer",
              fontWeight: mode === id ? 700 : 500,
            }}
          >
            {label}
          </button>
        ))}
        <span style={{ color: "#aaa" }}>Brush:</span>
        <input
          type="range" min={5} max={80} value={brushRadius}
          onChange={e => setBrushRadius(Number(e.target.value))}
          style={{ width: 100 }}
        />
        <span style={{ minWidth: 32 }}>{brushRadius}px</span>
        <button
          onClick={undo}
          disabled={(mode === "erase" && undoStack.current.length === 0) || refining || loadingOriginal}
          style={{ background: "#444", color: "#fff", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}
        >
          Undo
        </button>
        <button
          onClick={revertCutout}
          disabled={refining || loadingOriginal || (smartPoints.length === 0 && currentPath === cutoutPath && !dirtyErase)}
          style={{ background: "#444", color: "#fff", border: "none", borderRadius: 4, padding: "4px 12px", cursor: refining || loadingOriginal ? "wait" : "pointer" }}
        >
          Reset Clicks
        </button>
        <button
          onClick={revertOriginal}
          disabled={refining || loadingOriginal || (!originalSourcePath && !sourcePath && !sourceUrl) || (currentPath === originalSourcePath && !dirtyErase)}
          style={{ background: "#5b4b1f", color: "#fff", border: "none", borderRadius: 4, padding: "4px 12px", cursor: refining || loadingOriginal ? "wait" : "pointer" }}
        >
          Revert Original
        </button>
        <button
          onClick={revertCutout}
          disabled={refining || loadingOriginal || (currentPath === cutoutPath && !dirtyErase)}
          style={{ background: "#374151", color: "#fff", border: "none", borderRadius: 4, padding: "4px 12px", cursor: refining || loadingOriginal ? "wait" : "pointer" }}
        >
          Revert Cutout
        </button>
        <div style={{ width: 1, height: 20, background: "#555" }} />
        <button
          onClick={() => setShowComparison(v => !v)}
          disabled={!comparisonSrc}
          title={comparisonSrc ? "Toggle side-by-side comparison with original photo" : "Original photo not available"}
          style={{
            background: showComparison ? "#7c3aed" : "#444",
            color: "#fff", border: "none", borderRadius: 4,
            padding: "4px 10px", cursor: comparisonSrc ? "pointer" : "default",
          }}
        >
          {showComparison ? "Hide Original" : "Compare"}
        </button>
        <div style={{ width: 1, height: 20, background: "#555" }} />
        <button
          onClick={handleSave} disabled={saving || refining || loadingOriginal}
          style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 4, padding: "4px 16px", cursor: "pointer", fontWeight: 600 }}
        >
          {saving ? "Saving..." : refining ? "Refining..." : loadingOriginal ? "Loading..." : "Save"}
        </button>
        <button
          onClick={onClose}
          style={{ background: "#555", color: "#fff", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>

      <div style={{ color: "#ddd", fontSize: 12, minHeight: 18, display: "flex", alignItems: "center", gap: 8 }}>
        {countdown !== null ? (
          <>
            <span style={{ color: "#facc15", fontWeight: 600 }}>
              Auto-submitting in {countdown}s…
            </span>
            <div style={{ width: 100, height: 4, background: "#333", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: "#facc15",
                width: `${(countdown / COUNTDOWN_SECS) * 100}%`,
                transition: "width 0.9s linear",
              }} />
            </div>
            <span style={{ color: "#aaa", fontSize: 11 }}>
              ({smartPoints.length} point{smartPoints.length !== 1 ? "s" : ""} queued)
            </span>
          </>
        ) : (
          mode === "keep"
            ? "Green click: click each distinct part of the product (bag, bowl, lid…) — every seed teaches the model another colour that must stay."
            : mode === "remove"
              ? "Red click: click on a background artifact that should be removed — it will be re-segmented as background."
              : message
        )}
      </div>

      {/* Canvas area — single pane normally, side-by-side when comparison is on */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

        {/* Working canvas (left / only pane) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          {showComparison && (
            <div style={{ color: "#aaa", fontSize: 11 }}>Cutout (editing)</div>
          )}
          <div ref={wrapperRef} style={{ position: "relative", background: CHECKERBOARD, borderRadius: 4, overflow: "hidden", lineHeight: 0 }}>
            <canvas
              ref={canvasRef}
              style={{
                display: "block",
                maxWidth: showComparison ? "44vw" : "82vw",
                maxHeight: "76vh",
                cursor: refining || loadingOriginal ? "wait" : "crosshair",
                opacity: refining || loadingOriginal ? 0.72 : 1,
              }}
              onMouseDown={e => { e.stopPropagation(); handleMouseDown(e); }}
              onMouseMove={e => { e.stopPropagation(); handleMouseMove(e); }}
              onMouseUp={e => { e.stopPropagation(); stopPainting(); }}
              onMouseLeave={e => { e.stopPropagation(); stopPainting(); }}
            />
            {smartPoints.length > 0 && (() => {
              const canvas = canvasRef.current;
              const cw = canvas?.width ?? 1;
              const ch = canvas?.height ?? 1;
              const r = Math.max(8, Math.round(brushRadius * 0.75));
              return (
                <svg
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                  viewBox={`0 0 ${cw} ${ch}`}
                  preserveAspectRatio="none"
                >
                  {smartPoints.map((p, idx) => (
                    <circle
                      key={idx}
                      cx={p.x} cy={p.y} r={r}
                      fill={p.kind === "keep" ? "rgba(22,163,74,0.30)" : "rgba(220,38,38,0.30)"}
                      stroke={p.kind === "keep" ? "#16a34a" : "#dc2626"}
                      strokeWidth={Math.max(1.5, r * 0.12)}
                    />
                  ))}
                </svg>
              );
            })()}
            {loadingOriginal && (
              <>
                <style>{`
                  @keyframes ufmCutoutSpin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                  }
                `}</style>
                <div
                  style={{
                    position: "absolute", inset: 0,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 10,
                    background: "rgba(0,0,0,0.28)", color: "#fff",
                    fontSize: 13, fontWeight: 600, pointerEvents: "none",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    border: "3px solid rgba(255,255,255,0.35)", borderTopColor: "#fff",
                    animation: "ufmCutoutSpin 0.8s linear infinite",
                  }} />
                  <div>Loading original image...</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Original photo (right pane — only when comparison is on) */}
        {showComparison && comparisonSrc && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
            <div style={{ color: "#aaa", fontSize: 11 }}>Original photo</div>
            <div style={{ borderRadius: 4, overflow: "hidden", lineHeight: 0, border: "1px solid #444" }}>
              <img
                src={comparisonSrc}
                alt="Original"
                draggable={false}
                style={{ display: "block", maxWidth: "44vw", maxHeight: "76vh", objectFit: "contain" }}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
