// PATH: apps/desktop/src/renderer/editor/RenderFlyerPlacements.tsx
//
// PURE TEXT RENDERING - NO PNG LABELS
// Titles use Maven Pro, Prices use Trade Winds

import React, { useState, useCallback, useRef, useLayoutEffect, useEffect } from "react";
import { formatDaysOnlyBanner, getCycleStartFriday } from "../utils/flyerCycle";
import { acceptPanelImageDrag, handlePanelImageDropEvent, type PanelImageDropHandler } from "./panelImageDrag";
import { titleNudgeStyle, priceNudgeStyle, type CardOrientation } from "./textElementNudge";

// Helper to parse price display into parts for rendering
function parsePriceDisplay(display: string) {
  // Match patterns like "2 FOR $4.99" or "$19.90" or "$4.99/EA"
  const multiBuyMatch = display.match(/^(\d+)\s+FOR\s+\$?([\d.]+)/i);
  if (multiBuyMatch) {
    const [intPart, decPart = ""] = multiBuyMatch[2].split(".");
    return {
      type: "MULTI",
      quantity: multiBuyMatch[1],
      integer: intPart,
      decimal: decPart,
      unit: "",
    };
  }

  // Single price pattern: "$19.90" or "$19.90/EA"
  const singleMatch = display.match(/\$?([\d.]+)(?:\/(\w+))?/i);
  if (singleMatch) {
    const [intPart, decPart = ""] = singleMatch[1].split(".");
    return {
      type: "SINGLE",
      quantity: null,
      integer: intPart,
      decimal: decPart,
      unit: singleMatch[2] || "",
    };
  }

  return null;
}

const DAY_ABBR: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};
const CYCLE_ORDER = ["fri","sat","sun","mon","tue","wed","thu"];

// Pill-shaped overlay positioned at the top-center of the card, matching the
// "3 DAYS ONLY / May 15, 16, 17" promotional badge style.
function DaysOnlyBanner({
  days,
  flyerWeekStart,
  cardWidth,
  offsetX = 0,
  offsetY = 0,
  side = 'right',
  topPct = 8,
  editMode,
  onPanStart,
  onSelect,
  onEdit,
}: {
  days: string[];
  flyerWeekStart?: string;
  cardWidth: number;
  offsetX?: number;
  offsetY?: number;
  side?: 'left' | 'right';
  topPct?: number;
  editMode?: boolean;
  onPanStart?: (startOffsetX: number, startOffsetY: number, e: React.MouseEvent) => void;
  onSelect?: () => void;
  onEdit?: () => void;
}) {
  const cycleStart = flyerWeekStart
    ? new Date(flyerWeekStart + "T00:00:00")
    : getCycleStartFriday(new Date());
  const { count, dateStr } = formatDaysOnlyBanner(days, cycleStart);
  const topLine = count === 1 ? "1 DAY ONLY" : `${count} DAYS ONLY`;
  const bottomLine = dateStr;

  const mainSize = Math.max(8, Math.min(14, Math.round(cardWidth * 0.058)));
  const subSize  = Math.max(7, Math.min(11, Math.round(cardWidth * 0.044)));
  const padH     = Math.round(cardWidth * 0.06);

  return (
    <div
      onMouseDown={editMode && onPanStart
        ? (e) => { e.stopPropagation(); e.preventDefault(); onPanStart(offsetX, offsetY, e); }
        : undefined}
      onClick={editMode && onSelect ? (e) => { e.stopPropagation(); onSelect(); } : undefined}
      onDoubleClick={editMode && onEdit ? (e) => { e.stopPropagation(); onEdit(); } : undefined}
      style={{
        position: "absolute",
        top: `calc(${topPct}% + ${offsetY}px)`,
        right: side === 'left' ? "auto" : `calc(6% - ${offsetX}px)`,
        left: side === 'left' ? `calc(6% + ${offsetX}px)` : "auto",
        transform: `rotate(${side === 'left' ? -6 : 6}deg)`,
        zIndex: 20,
        background: "#fff",
        border: "2px solid #f97316",
        borderRadius: 100,
        padding: `3px ${padH}px 4px`,
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        whiteSpace: "nowrap",
        boxShadow: "0 0 10px 3px rgba(249,115,22,0.45), 0 2px 6px rgba(0,0,0,0.12)",
        pointerEvents: editMode ? "auto" : "none",
        cursor: editMode ? "move" : undefined,
      }}
    >
      <span style={{ fontSize: mainSize, fontWeight: 800, color: "#f97316", letterSpacing: 0.5, lineHeight: 1.3, textTransform: "uppercase" }}>
        {topLine}
      </span>
      <span style={{ fontSize: subSize, color: "#f97316", lineHeight: 1.2, fontWeight: 600 }}>
        {bottomLine}
      </span>
    </div>
  );
}

/** Scale (naturalW × naturalH) to fit inside (cellW × cellH), preserving aspect ratio. */
function fitContain(natW: number, natH: number, cellW: number, cellH: number) {
  const scale = Math.min(cellW / natW, cellH / natH);
  return { width: Math.round(natW * scale), height: Math.round(natH * scale) };
}

/** Clamp val to [min, max] and round to nearest integer. */
function clamp(min: number, val: number, max: number): number {
  return Math.round(Math.min(Math.max(val, min), max));
}

/** Grid cols/rows for n images (used for non-diagonal layouts). */
function getGridDims(n: number): { cols: number; rows: number } {
  if (n <= 2) return { cols: n, rows: 1 };
  if (n <= 5) return { cols: 2, rows: Math.ceil(n / 2) };
  return { cols: 3, rows: Math.ceil(n / 3) };
}

type DiscountLabel = {
  id: string;
  title: {
    en: string;
    zh: string;
    size: string;
    regularPrice: string;
  };
  price: {
    display: string;
    quantity?: number | null;
    unit?: string;
    regular?: string;
    days?: string[];
  };
};

const FRAME_CORNERS: Array<['tl' | 'tr' | 'bl' | 'br', React.CSSProperties]> = [
  ['tl', { top: 2, left: 2, cursor: 'nw-resize' }],
  ['tr', { top: 2, right: 2, cursor: 'ne-resize' }],
  ['bl', { bottom: 2, left: 2, cursor: 'sw-resize' }],
  ['br', { bottom: 2, right: 2, cursor: 'se-resize' }],
];

// Corner rotation handle — sits just outside the top-right of the image bounding box.
// No overlay on the image itself. Drag anywhere from the handle to rotate.
function RotationDial({
  bL, bT, bW, bH, rotation, visible, isDragging, onRotateDragStart,
}: {
  bL: number; bT: number; bW: number; bH: number;
  rotation: number;
  visible: boolean;
  isDragging?: boolean;
  onRotateDragStart: (startRotation: number, centerX: number, centerY: number, e: React.MouseEvent) => void;
}) {
  const centerRef = useRef<HTMLDivElement>(null);
  const HANDLE = 22;
  const OFFSET = 16;
  const norm = Math.round(((rotation % 360) + 360) % 360);

  return (
    <>
      {/* 0×0 anchor at image center — used to get screen coords for the rotate pivot */}
      <div
        ref={centerRef}
        style={{ position: 'absolute', left: bL + bW / 2, top: bT + bH / 2, pointerEvents: 'none' }}
      />

      {/* Handle: just outside the top-right corner */}
      <div
        onMouseDown={(e: React.MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          const c = centerRef.current!.getBoundingClientRect();
          onRotateDragStart(rotation, c.left, c.top, e);
        }}
        style={{
          position: 'absolute',
          left: bL + bW + OFFSET - HANDLE / 2,
          top: bT - OFFSET - HANDLE / 2,
          width: HANDLE,
          height: HANDLE,
          borderRadius: '50%',
          background: '#007AFF',
          border: '2.5px solid #fff',
          boxShadow: '0 2px 8px rgba(0,122,255,0.45)',
          zIndex: 100,
          cursor: isDragging ? 'grabbing' : 'crosshair',
          pointerEvents: visible ? 'all' : 'none',
          opacity: visible ? 1 : 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          transition: 'opacity 0.15s',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.5 2v6h-6" />
          <path d="M21.34 15.57a10 10 0 1 1-.57-8.38" />
        </svg>
      </div>

      {/* Angle badge below the handle */}
      <div style={{
        position: 'absolute',
        left: bL + bW + OFFSET - 16,
        top: bT - OFFSET + HANDLE / 2 + 5,
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        fontSize: 10,
        fontWeight: 600,
        padding: '1px 5px',
        borderRadius: 4,
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        zIndex: 101,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.15s',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}>
        {norm}°
      </div>
    </>
  );
}

function PlacementCard({
  p, item, label, flyerWeekStart, editMode, activeScaleDrag, onElementDragStart, onRotateDragStart, onEditTitle, onEditPrice,
  onSubImageScaleDragStart, onSubImageRotateDragStart, onDeleteSubImage,
  onImagePanStart, onSubImagePanStart, onOrientationChange, onCropDragStart, onSubImageCropDragStart,
  onBannerPanStart, onEditBanner,
  onPricePanStart,
  onElementSelect,
  onContextMenu,
  selectedEl = null,
  onSetSelectedEl,
  selectedSubIdx = null,
  onSelectSubIdx,
  rerunningCutoutPath = null,
  activeReplacementJobs,
  onCancelReplacementJob,
  onPanelImageDrop,
}: {
  p: any;
  item: any;
  label: DiscountLabel | null;
  flyerWeekStart?: string;
  editMode?: boolean;
  activeScaleDrag?: { itemId: string; type: string } | null;
  onElementDragStart?: (type: 'image' | 'title' | 'price', corner: 'tl' | 'tr' | 'bl' | 'br', startScale: number, e: React.MouseEvent) => void;
  onRotateDragStart?: (startRotation: number, centerX: number, centerY: number, e: React.MouseEvent) => void;
  onEditTitle?: () => void;
  onEditPrice?: () => void;
  onSubImageScaleDragStart?: (subIdx: number, corner: 'tl' | 'tr' | 'bl' | 'br', startScale: number, e: React.MouseEvent) => void;
  onSubImageRotateDragStart?: (subIdx: number, startRot: number, cx: number, cy: number, e: React.MouseEvent) => void;
  onDeleteSubImage?: (subIdx: number) => void;
  onImagePanStart?: (startOffsetX: number, startOffsetY: number, e: React.MouseEvent) => void;
  onSubImagePanStart?: (subIdx: number, startOffsetX: number, startOffsetY: number, e: React.MouseEvent) => void;
  onOrientationChange?: (orientation: 'vertical' | 'horizontal' | 'top') => void;
  onCropDragStart?: (side: 'left' | 'right' | 'top' | 'bottom', startValue: number, e: React.MouseEvent, bounds?: { width: number; height: number }) => void;
  onSubImageCropDragStart?: (subIdx: number, side: 'left' | 'right' | 'top' | 'bottom', startValue: number, e: React.MouseEvent, bounds: { width: number; height: number }) => void;
  onBannerPanStart?: (startOffsetX: number, startOffsetY: number, e: React.MouseEvent) => void;
  onEditBanner?: () => void;
  onPricePanStart?: (startOffsetY: number, e: React.MouseEvent) => void;
  onElementSelect?: (element: 'title' | 'price' | 'banner' | null) => void;
  onContextMenu?: () => void;
  selectedEl?: 'image' | 'title' | 'price' | null;
  onSetSelectedEl?: (el: 'image' | 'title' | 'price' | null) => void;
  selectedSubIdx?: number | null;
  onSelectSubIdx?: (idx: number | null) => void;
  rerunningCutoutPath?: string | null;
  activeReplacementJobs?: Array<{ id: string; status: "processing" | "done" | "error" }>;
  onCancelReplacementJob?: (jobId: string) => void;
  onPanelImageDrop?: PanelImageDropHandler;
}) {
  const [imgInfo, setImgInfo] = useState<{
    natW: number; natH: number;
    bboxX: number; bboxY: number; bboxW: number; bboxH: number;
    arW: number; arH: number;
  } | null>(null);
  const [rotatingActive, setRotatingActive] = useState(false);
  // Suppresses spurious click-to-edit after a corner-handle drag ends inside the text div.
  const suppressClickRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handlePanelDragOver = (e: React.DragEvent) => {
    if (!onPanelImageDrop) return;
    acceptPanelImageDrag(e);
  };

  const handlePanelDrop = (e: React.DragEvent) => {
    if (!onPanelImageDrop) return;
    handlePanelImageDropEvent(e, onPanelImageDrop, { itemId: p.itemId ?? null });
  };

  const blankDropZoneStyle: React.CSSProperties = {
    flex: 1,
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1.5px dashed #ADB5BD",
    borderRadius: 4,
    background: "#F1F3F5",
    color: "#868e96",
    fontSize: 11,
    fontWeight: 600,
    textAlign: "center",
    padding: 8,
  };

  const renderBlankImageDrop = () =>
    editMode && onPanelImageDrop ? (
      <div style={{ ...blankDropZoneStyle, width: "100%", height: "100%" }}>
        Drop image from library
      </div>
    ) : null;

  const onElementSelectRef = useRef(onElementSelect);
  onElementSelectRef.current = onElementSelect;
  const [titleDrag, setTitleDrag] = useState<{
    active: boolean;
    hoveredZone: 'vertical' | 'horizontal' | 'top' | null;
  } | null>(null);

  useEffect(() => {
    if (!selectedEl && selectedSubIdx === null) return;
    const handleOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onSetSelectedEl?.(null);
        onSelectSubIdx?.(null);
        onElementSelectRef.current?.(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [selectedEl, selectedSubIdx, onSetSelectedEl, onSelectSubIdx]);

  // For n=3 multi-image: randomly choose diagonal vs 2+1 grid (decided once per mount)
  const diagonalRef = useRef<boolean>(Math.random() < 0.5);

  // Reset imgInfo whenever the displayed image changes (e.g. after a cutout rerun).
  // Without this, the old bbox/ratio stays cached and the new image renders at the wrong size.
  const imgSrcForInfo = (item?.result?.cutoutPaths?.[0] ?? item?.result?.cutoutPath ?? item?.result?.inputPath) || null;
  const prevImgSrcForInfoRef = useRef(imgSrcForInfo);
  if (prevImgSrcForInfoRef.current !== imgSrcForInfo) {
    prevImgSrcForInfoRef.current = imgSrcForInfo;
    setImgInfo(null);
  }

  const onFirstImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    if (el.naturalWidth <= 0 || imgInfo) return;

    const SCAN = 500;
    const cv = document.createElement("canvas");
    cv.width = SCAN; cv.height = SCAN;
    const ctx = cv.getContext("2d")!;
    let data: Uint8ClampedArray;
    try {
      ctx.drawImage(el, 0, 0, SCAN, SCAN);
      data = ctx.getImageData(0, 0, SCAN, SCAN).data;
    } catch {
      // canvas taint (cross-origin) — fall back to full dims
      setImgInfo({ natW: el.naturalWidth, natH: el.naturalHeight,
                   bboxX: 0, bboxY: 0, bboxW: el.naturalWidth, bboxH: el.naturalHeight,
                   arW: el.naturalWidth, arH: el.naturalHeight });
      return;
    }

    let top = -1, bottom = -1, left = SCAN, right = -1;
    let alphaFg = 0;
    let borderLight = 0;
    let borderCount = 0;
    const borderPx = Math.max(4, Math.round(SCAN * 0.03));
    for (let y = 0; y < SCAN; y++) {
      for (let x = 0; x < SCAN; x++) {
        const idx = (y * SCAN + x) * 4;
        const a = data[idx + 3];
        if (a > 1) alphaFg++;
        if (x < borderPx || y < borderPx || x >= SCAN - borderPx || y >= SCAN - borderPx) {
          borderCount++;
          if (a > 1 && data[idx] > 240 && data[idx + 1] > 240 && data[idx + 2] > 240) borderLight++;
        }
      }
    }
    const alphaCoverage = alphaFg / Math.max(1, SCAN * SCAN);
    const lightBorderCoverage = borderLight / Math.max(1, borderCount);
    const ignoreWhiteBackground = alphaCoverage > 0.97 && lightBorderCoverage > 0.55;
    const isForegroundPixel = (arr: Uint8ClampedArray, idx: number) => {
      if (arr[idx + 3] <= 1) return false;
      if (!ignoreWhiteBackground) return true;
      return !(arr[idx] > 240 && arr[idx + 1] > 240 && arr[idx + 2] > 240);
    };

    for (let y = 0; y < SCAN; y++) {
      for (let x = 0; x < SCAN; x++) {
        if (isForegroundPixel(data, (y * SCAN + x) * 4)) {
          if (top === -1) top = y;
          bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }

    const { naturalWidth: nw, naturalHeight: nh } = el;

    // Precise top-boundary scan: draw only the top TOP_PX natural rows into a SCAN×TOP_PX
    // canvas (1:1 vertical scale, no vertical compression). For large images the main SCAN
    // compresses many natural rows per scan row, averaging faint shadow pixels toward zero.
    // This strip preserves full per-row alpha so shadow bleed at ~y=75 is always detected.
    const TOP_PX = Math.min(200, nh);
    let bboxY = top === -1 ? 0 : Math.round(top / SCAN * nh);
    if (top !== -1) {
      try {
        const topCv = document.createElement("canvas");
        topCv.width = SCAN; topCv.height = TOP_PX;
        const topCtx = topCv.getContext("2d")!;
        topCtx.drawImage(el, 0, 0, nw, TOP_PX, 0, 0, SCAN, TOP_PX);
        const topData = topCtx.getImageData(0, 0, SCAN, TOP_PX).data;
        // Use alpha > 1 (not > 0) to ignore near-zero rembg artifacts (alpha=1).
        // The actual shadow bleed from a real product has alpha ≈ 29+ at its edge.
        for (let y = 0; y < TOP_PX; y++) {
          let found = false;
          for (let x = 0; x < SCAN; x++) {
            if (isForegroundPixel(topData, (y * SCAN + x) * 4)) { bboxY = y; found = true; break; }
          }
          if (found) break;
        }
      } catch { /* keep rough estimate */ }
    }

    const bboxX = top === -1 ? 0 : Math.round(left / SCAN * nw);
    const botNat = top === -1 ? nh : Math.round(bottom / SCAN * nh);
    const bboxW = top === -1 ? nw : Math.round((right - left + 1) / SCAN * nw);
    const bboxH = top === -1 ? nh : botNat - bboxY + 1;
    // Shadow PNGs have 100px padding on each side. Use the de-padded natural size
    // for aspect-ratio-based cell width so landscape products are not squeezed.
    const isShadow = el.src.includes(".shadow.png");
    const arW = isShadow && nw > 200 ? nw - 200 : bboxW;
    const arH = isShadow && nh > 200 ? nh - 200 : bboxH;
    setImgInfo({ natW: nw, natH: nh, bboxX, bboxY, bboxW, bboxH, arW, arH });
  }, [imgInfo]);

  // Set flag on corner-handle mousedown; clear it after mouseup (after click fires).
  const handleCornerMouseDown = useCallback((
    type: 'image' | 'title' | 'price',
    corner: 'tl' | 'tr' | 'bl' | 'br',
    startScale: number,
    e: React.MouseEvent,
  ) => {
    if (!onElementDragStart) return;
    e.stopPropagation();
    e.preventDefault();
    suppressClickRef.current = true;
    const onUp = () => {
      // setTimeout(0) lets the click event fire first, then we clear the flag.
      setTimeout(() => { suppressClickRef.current = false; }, 0);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mouseup', onUp);
    onElementDragStart(type, corner, startScale, e);
  }, [onElementDragStart]);

  const handleTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!effectiveEditMode || !onOrientationChange) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;
    let hoveredZone: 'vertical' | 'horizontal' | 'top' | null = null;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!active && Math.sqrt(dx * dx + dy * dy) < 5) return;
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const relXPct = (ev.clientX - rect.left) / rect.width * 100;
      const relYPct = (ev.clientY - rect.top) / rect.height * 100;
      // Distance to center of each zone (in % of card)
      // Vertical zone: left:0, bottom:0, width:50%, height:35% → center at (25%, 82.5%)
      // Horizontal zone: right:0, top:20%, width:45%, height:60% → center at (77.5%, 50%)
      // Top zone: top:0, left:25%, width:50%, height:30% → center at (50%, 15%)
      const distV = Math.sqrt(Math.pow(relXPct - 25, 2) + Math.pow(relYPct - 82.5, 2));
      const distH = Math.sqrt(Math.pow(relXPct - 77.5, 2) + Math.pow(relYPct - 50, 2));
      const distT = Math.sqrt(Math.pow(relXPct - 50, 2) + Math.pow(relYPct - 15, 2));
      const minDist = Math.min(distV, distH, distT);
      hoveredZone = minDist === distT ? 'top' : minDist === distH ? 'horizontal' : 'vertical';
      active = true;
      setTitleDrag({ active: true, hoveredZone });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (active && hoveredZone) {
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 0);
        onOrientationChange(hoveredZone);
      }
      setTitleDrag(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [editMode, onOrientationChange]);

  // ── processing guard — disable all edit interactions while cutout or replacement is running ──
  const isProcessing = item?.status === "processing_cutout" || item?.status === "running" ||
    !!rerunningCutoutPath ||
    !!(activeReplacementJobs && activeReplacementJobs.length > 0);
  // Replace editMode with this throughout — all guards like `onXxx && editMode` naturally become no-ops
  const effectiveEditMode = !isProcessing && !!editMode;

  // ── source resolution ──
  const isPendingFlavors = item?.result?.pendingFlavorSelection === true;
  const rawPaths = item?.result?.cutoutPaths;
  // When pending, show all flavors dimmed. After selection, show only chosen ones.
  const hasMultiImages = !isPendingFlavors && Array.isArray(rawPaths) && rawPaths.length > 1;
  const rawSrc =
    item?.image?.src ??
    item?.cutoutPath ??
    (item?.result?.cutoutPath || null) ??
    (Array.isArray(rawPaths) && rawPaths.length > 0 ? rawPaths[0] : null) ??
    item?.result?.inputPath ??   // show original photo while Phase 2 is pending
    null;

  const imgSrc = rawSrc
    ? rawSrc.startsWith("http") || rawSrc.startsWith("file://") ? rawSrc : `file://${rawSrc}`
    : null;

  const imgSrcs = hasMultiImages
    ? rawPaths.map((rp: string) =>
        rp.startsWith("http") || rp.startsWith("file://") ? rp : `file://${rp}`
      )
    : null;

  // Staged flavors (dimmed preview) for pending items — use allFlavorPaths when available
  const allFlavorPaths = item?.result?.allFlavorPaths;
  const stagedSrcs = isPendingFlavors
    ? (Array.isArray(allFlavorPaths) && allFlavorPaths.length > 0 ? allFlavorPaths : rawPaths ?? [])
        .map((rp: string) =>
          rp.startsWith("http") || rp.startsWith("file://") ? rp : `file://${rp}`
        )
    : null;

  const hasLabel = label != null;
  const priceParts = label?.price.display ? parsePriceDisplay(label.price.display) : null;
  const multiQty = priceParts?.type === "MULTI" ? parseInt(priceParts.quantity!, 10) : 0;
  const displaySrcs = imgSrcs ?? (multiQty >= 2 && imgSrc ? Array(multiQty).fill(imgSrc) : null);
  // Price-based duplicates: same single image repeated N times (not distinct variant images)
  const isPriceDupe = !imgSrcs && multiQty >= 2;

  // ── image sizing ──
  const SIDE_PAD = 8;
  const scale = (p.contentScale ?? 1) as number;
  const imgScale  = (p.imageScale  ?? 1) as number;
  const titScale  = (p.titleScale  ?? 1) as number;
  const prcScale  = (p.priceScale  ?? 1) as number;
  const imgRotation = (p.imageRotation ?? 0) as number;
  const imgOffsetX  = (p.imageOffsetX  ?? 0) as number;
  const imgOffsetY  = (p.imageOffsetY  ?? 0) as number;
  const titleOffsetX = (p.titleOffsetX ?? 0) as number;
  const titleOffsetY = (p.titleOffsetY ?? 0) as number;
  const priceOffsetX = (p.priceOffsetX ?? 0) as number;
  const priceOffsetY = (p.priceOffsetY ?? 0) as number;
  const cardOrientation = (p.orientation ?? "vertical") as CardOrientation;
  const cropL = (p.cropLeft  ?? 0) as number;
  const cropR = (p.cropRight ?? 0) as number;
  const cropT = (p.cropTop   ?? 0) as number;
  const cropB = (p.cropBottom ?? 0) as number;
  const hasCrop = cropL > 0 || cropR > 0 || cropT > 0 || cropB > 0;
  const imageRadius     = (p.imageRadius     ?? 0) as number;
  const imageBrightness = (p.imageBrightness ?? 100) as number;
  const imageContrast   = (p.imageContrast   ?? 100) as number;
  const imageSaturation = (p.imageSaturation ?? 100) as number;
  const imageOpacity    = (p.imageOpacity    ?? 100) as number;
  const imageFlipH      = !!(p.imageFlipH);
  const imageFlipV      = !!(p.imageFlipV);
  const imgFilterStr = [
    imageBrightness !== 100 && `brightness(${imageBrightness}%)`,
    imageContrast   !== 100 && `contrast(${imageContrast}%)`,
    imageSaturation !== 100 && `saturate(${imageSaturation}%)`,
  ].filter(Boolean).join(' ') || undefined;

  // ── font customization ──
  const titleFontFamily = p.titleFontFamily as string | undefined;
  const titleColor = p.titleColor as string | undefined;
  const titleItalic = p.titleItalic as boolean | undefined;
  const titleBg = p.titleBg as string | undefined;
  const titleBgPad = (p.titleBgPad as number | undefined) ?? 2;
  const titleEffect = p.titleEffect as 'stroke' | 'glow' | 'shadow' | undefined;
  const priceFontFamily = p.priceFontFamily as string | undefined;
  const priceColor = p.priceColor as string | undefined;
  const priceShowDollar = p.priceShowDollar as boolean | undefined;
  const priceBg = p.priceBg as string | undefined;
  const priceBgPad = (p.priceBgPad as number | undefined) ?? 2;
  const priceEffect = p.priceEffect as 'stroke' | 'glow' | 'shadow' | undefined;

  function buildTextEffect(effect: typeof titleEffect, color: string | undefined, size: number): React.CSSProperties {
    if (!effect || !color) return {};
    if (effect === 'stroke') return { WebkitTextStroke: `${size}px ${color}`, paintOrder: 'stroke fill' as any };
    if (effect === 'glow') return { textShadow: `0 0 ${size}px ${color}, 0 0 ${size * 2}px ${color}, 0 0 ${size * 3}px ${color}` };
    // shadow
    return { textShadow: `${size}px ${size}px ${Math.ceil(size * 0.8)}px ${color}` };
  }

  const titleTextStyle: React.CSSProperties = {
    fontFamily: titleFontFamily ?? undefined,
    color: titleColor ?? undefined,
    fontStyle: titleItalic ? 'italic' : undefined,
    ...buildTextEffect(titleEffect, titleBg, titleBgPad),
  };
  // Effect-free variant for supplementary text (reg price, size) that should stay plain
  const titleBaseStyle: React.CSSProperties = {
    fontFamily: titleFontFamily ?? undefined,
    color: titleColor ?? undefined,
  };
  const priceTextStyle: React.CSSProperties = {
    fontFamily: priceFontFamily ?? undefined,
    color: priceColor ?? undefined,
    ...buildTextEffect(priceEffect, priceBg, priceBgPad),
  };

  const topPad = Math.round(p.height * 0.05 * scale);
  const LABEL_ZONE_H = 0;

  // ── font sizes ──
  // All price labels in the same card size should occupy the same width.
  // Strategy: pick a fixed target width (TARGET_PRICE_W = 42% of card),
  // then derive priceMainSize so the full label (qty + integer + decimal) fills it exactly.
  //   qty  at 0.55× font, integer at 1.0×, decimal at 0.5×; each char ≈ CHAR_RATIO × size wide.
  // This makes "$9.99" and "3/$5.99" produce the same pixel-wide label on equal-sized cards.
  const CHAR_RATIO = 0.60;
  const intStr    = priceParts?.integer ?? "0";
  const decStr    = priceParts?.decimal ?? "";
  const qtyStr    = priceParts?.type === "MULTI" ? `${priceParts.quantity ?? ""}/` : "";
  const charUnits = qtyStr.length * 0.55 + intStr.length * 1.0 + decStr.length * 0.5;
  const TARGET_PRICE_W = p.width * 0.42;
  const sizeByWidth = TARGET_PRICE_W / (Math.max(1, charUnits) * CHAR_RATIO);
  // Height cap: prevent font from exceeding card height (safety net for very wide/short cards).
  const priceMainBase = clamp(16, Math.min(p.height * 0.55, sizeByWidth), 220) * scale * prcScale;
  const titleMainSize = clamp(13, p.width * 0.034, 22) * scale * titScale;
  const titleMetaSize = clamp(11, p.width * 0.026, 17) * scale * titScale;
  const titleMetaSizeActual = Math.round(titleMetaSize * ((p.titleCompMetaScale as number | undefined) ?? 1.0));
  const titleMetaOffsetY = (p.titleCompMetaOffsetY as number | undefined) ?? 0;

  // ── overlap-based price font scaling ──
  // Starts at 1; shrunk by useLayoutEffect if price overlaps title.
  const [priceFontScale, setPriceFontScale] = useState(1);
  const titleRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);
  // Track which layout inputs we've last adjusted for, to reset + re-measure on change.
  const adjustKey = `${label?.price.display}|${label?.title.en}|${p.width}|${p.height}|${scale}|${titScale}|${prcScale}`;
  const prevAdjustKey = useRef('');

  useLayoutEffect(() => {
    if (adjustKey === prevAdjustKey.current) return;
    // If scale isn't reset yet, reset it first and wait for the next render to measure.
    if (priceFontScale !== 1) {
      setPriceFontScale(1);
      return;
    }
    prevAdjustKey.current = adjustKey;
    if (!titleRef.current || !priceRef.current) return;
    const titleRect = titleRef.current.getBoundingClientRect();
    const priceRect = priceRef.current.getBoundingClientRect();
    const overlap = titleRect.right - priceRect.left;
    if (overlap > 2) {
      const available = priceRect.right - titleRect.right - 4;
      if (available > 0 && priceRect.width > 0) {
        setPriceFontScale(Math.max(0.2, available / priceRect.width));
      }
    }
  }, [adjustKey, priceFontScale]);

  const priceMainSize = Math.round(priceMainBase * priceFontScale);
  const priceDecSize  = Math.round(priceMainSize * ((p.priceCompDecRatio as number | undefined) ?? 0.50));
  const priceDecTop   = -Math.round(priceMainSize * 0.20) + ((p.priceCompDecOffsetY as number | undefined) ?? 0);
  const priceQtySize  = Math.round(priceMainSize * ((p.priceCompQtyRatio as number | undefined) ?? 0.55));
  const priceUnitSize = Math.round(priceMainSize * ((p.priceCompUnitRatio as number | undefined) ?? 0.12));
  const priceUnitOffsetY = (p.priceCompUnitOffsetY as number | undefined) ?? 0;
  const dollarSize    = Math.round(priceMainSize * ((p.priceCompDollarRatio as number | undefined) ?? 0.35));
  const dollarTop     = -Math.round(priceMainSize * 0.44) + ((p.priceCompDollarOffsetY as number | undefined) ?? 0);

  const availW = p.orientation === 'horizontal'
    ? Math.max(1, Math.round(p.width * 0.55) - SIDE_PAD * 2)
    : p.width - SIDE_PAD * 2;
  let availH = p.height - topPad - LABEL_ZONE_H;
  // Top layout: image zone is below title; use zone height so image fits and zone overflow doesn't misalign clip/border
  if (p.orientation === 'top' && hasLabel && (label?.title?.en || label?.title?.zh)) {
    const hasTitleMeta = !!(label?.title?.size || label?.title?.regularPrice);
    const estimatedTitleH = SIDE_PAD * 2 + titleMainSize * 1.2 + (hasTitleMeta ? titleMetaSize * 1.2 + 2 : 0);
    availH = Math.max(1, p.height - estimatedTitleH);
  }
  const n = displaySrcs ? displaySrcs.length : 1;
  const GAP = 4;
  const useDiagonal = n === 3 && diagonalRef.current;
  const { cols, rows } = useDiagonal
    ? { cols: 1, rows: 1 }
    : (n === 5 ? { cols: 2, rows: 2 } : getGridDims(n));
  // Height-first sizing: constrain by row height, derive natural width from aspect ratio.
  // This makes horizontal gap between images match vertical GAP (no wide empty cell sides).
  const maxCellW = cols > 1 ? (availW - (cols - 1) * GAP) / cols : availW;
  const cellH = useDiagonal
    ? availH * 0.65
    : rows > 1 ? (availH - (rows - 1) * GAP) / rows : availH;
  const cellW = useDiagonal
    ? availW * 0.65
    : imgInfo && imgInfo.arH > 0
      ? Math.min(cellH * imgInfo.arW / imgInfo.arH, maxCellW)
      : maxCellW;

  // Derived render info — null until image loads and bbox is scanned.
  const imgRender = imgInfo ? (() => {
    const { natW, natH, bboxX, bboxY, bboxW, bboxH } = imgInfo;
    const { width: fitW, height: fitH } = fitContain(bboxW, bboxH, cellW, cellH);
    const dispW = Math.round(fitW * imgScale);
    const dispH = Math.round(fitH * imgScale);
    const sc = dispW / bboxW;
    return {
      wrapperStyle: {
        position: "relative" as const,
        width: dispW, height: dispH,
        overflow: "hidden" as const,
        flexShrink: 0,
      },
      imgAbsStyle: {
        position: "absolute" as const,
        width: Math.round(natW * sc),
        height: Math.round(natH * sc),
        left: Math.round(-bboxX * sc),
        top: Math.round(-bboxY * sc),
        display: "block" as const,
      },
    };
  })() : null;

  // n=5: center item is N5_OVERLAP× larger than a corner cell
  const N5_OVERLAP = 1.3;
  const n5CenterCellW = cellW * N5_OVERLAP;
  const n5CenterCellH = cellH * N5_OVERLAP;
  const n5CenterRender = n === 5 && imgInfo ? (() => {
    const { natW, natH, bboxX, bboxY, bboxW, bboxH } = imgInfo;
    const { width: fitW, height: fitH } = fitContain(bboxW, bboxH, n5CenterCellW, n5CenterCellH);
    const dispW = Math.round(fitW * imgScale);
    const dispH = Math.round(fitH * imgScale);
    const sc = dispW / bboxW;
    return {
      wrapperStyle: { position: "relative" as const, width: dispW, height: dispH, overflow: "hidden" as const, flexShrink: 0 },
      imgAbsStyle: { position: "absolute" as const, width: Math.round(natW * sc), height: Math.round(natH * sc), left: Math.round(-bboxX * sc), top: Math.round(-bboxY * sc), display: "block" as const },
    };
  })() : null;

  const fallbackImgStyle: React.CSSProperties = {
    width: "100%", maxWidth: cellW, maxHeight: cellH,
    height: "auto", objectFit: "contain" as const, display: "block",
  };

  const renderImg = (src: string, idx?: number, overlay?: React.ReactNode) => {
    const isFirst = idx === undefined || idx === 0;
    const isMulti = idx !== undefined;
    const subOverride = isMulti ? (item?.result?.subImageOverrides?.[idx] ?? {}) : {};
    const subCropL = (subOverride.cropLeft ?? 0) as number;
    const subCropR = (subOverride.cropRight ?? 0) as number;
    const subCropT = (subOverride.cropTop ?? 0) as number;
    const subCropB = (subOverride.cropBottom ?? 0) as number;
    const subHasCrop = isMulti && (subCropL > 0 || subCropR > 0 || subCropT > 0 || subCropB > 0);
    const subScale = subOverride.scale ?? 1;
    const subRotation = subOverride.rotation ?? 0;
    const subOffsetX = isMulti ? (subOverride.x ?? 0) : imgOffsetX;
    const subOffsetY = isMulti ? (subOverride.y ?? 0) : imgOffsetY;
    const totalRotation = imgRotation + subRotation;
    const flipExtra = [imageFlipH && 'scaleX(-1)', imageFlipV && 'scaleY(-1)'].filter(Boolean).join(' ');
    const transform = `translate(${subOffsetX}px, ${subOffsetY}px) rotate(${totalRotation}deg) scale(${subScale})${flipExtra ? ' ' + flipExtra : ''}`;

    // Selection UI lives INSIDE the transformed wrapper so it tracks the image exactly
    const isSelected = isMulti && effectiveEditMode && selectedSubIdx === idx;
    const handleMouseDown = isMulti && effectiveEditMode
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          if (selectedSubIdx === idx) {
            // Same image already selected → start drag
            onSubImagePanStart?.(idx, subOverride.x ?? 0, subOverride.y ?? 0, e);
          } else if (selectedSubIdx !== null) {
            // A sibling is selected → auto-select this one and start drag immediately
            onSelectSubIdx?.(idx);
            onSubImagePanStart?.(idx, subOverride.x ?? 0, subOverride.y ?? 0, e);
          } else {
            // Nothing selected → select only
            onSelectSubIdx?.(idx);
          }
        }
      : undefined;
    const handleClick = isMulti && editMode ? (e: React.MouseEvent) => e.stopPropagation() : undefined;

    const EDGE = 4;
    const selectionFrameW = imgRender ? Math.max(1, imgRender.wrapperStyle.width - subCropL - subCropR) : 0;
    const selectionFrameH = imgRender ? Math.max(1, imgRender.wrapperStyle.height - subCropT - subCropB) : 0;
    const selectionUI = isSelected ? (
      <>
        {imgRender && (
          <div style={{ position: 'absolute', left: subCropL, top: subCropT, width: selectionFrameW, height: selectionFrameH, zIndex: 95, pointerEvents: 'none' }}>
            {onSubImageCropDragStart && (
              <>
                <div style={{ position: 'absolute', left: 0, top: 0, width: EDGE, height: '100%', borderLeft: '2px dashed #F59E0B', cursor: 'ew-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onSubImageCropDragStart(idx, 'left', subCropL, e, { width: imgRender!.wrapperStyle.width, height: imgRender!.wrapperStyle.height }); }} />
                <div style={{ position: 'absolute', right: 0, top: 0, width: EDGE, height: '100%', borderRight: '2px dashed #F59E0B', cursor: 'ew-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onSubImageCropDragStart(idx, 'right', subCropR, e, { width: imgRender!.wrapperStyle.width, height: imgRender!.wrapperStyle.height }); }} />
                <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: EDGE, borderTop: '2px dashed #F59E0B', cursor: 'ns-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onSubImageCropDragStart(idx, 'top', subCropT, e, { width: imgRender!.wrapperStyle.width, height: imgRender!.wrapperStyle.height }); }} />
                <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: EDGE, borderBottom: '2px dashed #F59E0B', cursor: 'ns-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onSubImageCropDragStart(idx, 'bottom', subCropB, e, { width: imgRender!.wrapperStyle.width, height: imgRender!.wrapperStyle.height }); }} />
              </>
            )}
            {(!onSubImageCropDragStart) && (
              <>
                <div style={{ position: 'absolute', left: 0, top: 0, width: EDGE, height: '100%', borderLeft: '2px dashed #F59E0B', zIndex: 90, pointerEvents: 'none', boxSizing: 'border-box' }} />
                <div style={{ position: 'absolute', right: 0, top: 0, width: EDGE, height: '100%', borderRight: '2px dashed #F59E0B', zIndex: 90, pointerEvents: 'none', boxSizing: 'border-box' }} />
                <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: EDGE, borderTop: '2px dashed #F59E0B', zIndex: 90, pointerEvents: 'none', boxSizing: 'border-box' }} />
                <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: EDGE, borderBottom: '2px dashed #F59E0B', zIndex: 90, pointerEvents: 'none', boxSizing: 'border-box' }} />
              </>
            )}
            {(['tl','tr','bl','br'] as const).map(corner => (
              <div
                key={corner}
                onMouseDown={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); onSubImageScaleDragStart?.(idx, corner, subScale, e); }}
                style={{
                  position: 'absolute',
                  ...(corner.includes('l') ? { left: -5 } : { right: -5 }),
                  ...(corner.includes('t') ? { top: -5 } : { bottom: -5 }),
                  width: 10, height: 10,
                  background: '#fff', border: '2px solid #F59E0B', borderRadius: 2,
                  cursor: corner === 'tl' || corner === 'br' ? 'nw-resize' : 'ne-resize',
                  zIndex: 91, pointerEvents: 'auto',
                }}
              />
            ))}
          </div>
        )}
        {!imgRender && (
          <>
            {(['tl','tr','bl','br'] as const).map(corner => (
              <div
                key={corner}
                onMouseDown={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); onSubImageScaleDragStart?.(idx, corner, subScale, e); }}
                style={{
                  position: 'absolute',
                  ...(corner.includes('l') ? { left: -5 } : { right: -5 }),
                  ...(corner.includes('t') ? { top: -5 } : { bottom: -5 }),
                  width: 10, height: 10,
                  background: '#fff', border: '2px solid #F59E0B', borderRadius: 2,
                  cursor: corner === 'tl' || corner === 'br' ? 'nw-resize' : 'ne-resize',
                }}
              />
            ))}
          </>
        )}
        <div
          onMouseDown={(e: React.MouseEvent) => {
            e.stopPropagation(); e.preventDefault();
            const parent = (e.currentTarget as HTMLElement).parentElement!;
            const r = parent.getBoundingClientRect();
            onSubImageRotateDragStart?.(idx, subRotation, r.left + r.width / 2, r.top + r.height / 2, e);
          }}
          style={{ position: 'absolute', left: '50%', bottom: -18, transform: 'translateX(-50%)', width: 12, height: 12, background: '#F59E0B', borderRadius: '50%', border: '2px solid white', cursor: 'grab' }}
        />
        {!isPriceDupe && (
          <div
            onMouseDown={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); onDeleteSubImage?.(idx); }}
            style={{ position: 'absolute', right: -10, top: -10, width: 18, height: 18, background: '#EF4444', borderRadius: '50%', color: 'white', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', lineHeight: 1 }}
          >×</div>
        )}
      </>
    ) : null;

    if (imgRender) {
      return (
        <div
          key={idx}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          style={{
            position: 'relative', width: imgRender.wrapperStyle.width, height: imgRender.wrapperStyle.height,
            flexShrink: 0, transform, transformOrigin: 'center center',
            cursor: isMulti && editMode ? (isSelected ? 'grab' : 'pointer') : undefined,
            opacity: imageOpacity < 100 ? imageOpacity / 100 : undefined,
          }}
        >
          <div style={{
            position: 'absolute', inset: 0, overflow: 'hidden',
            borderRadius: imageRadius > 0 && !hasCrop && !(isMulti && subHasCrop) ? `${imageRadius}%` : undefined,
            clipPath: !isMulti && hasCrop
              ? `inset(${cropT}px ${cropR}px ${cropB}px ${cropL}px${imageRadius > 0 ? ` round ${imageRadius}%` : ''})`
              : (isMulti && subHasCrop
                ? `inset(${subCropT}px ${subCropR}px ${subCropB}px ${subCropL}px${imageRadius > 0 ? ` round ${imageRadius}%` : ''})`
                : undefined),
            filter: imgFilterStr,
          }}>
            <img style={imgRender.imgAbsStyle} src={src} alt="" />
          </div>
          {selectionUI}
          {overlay}
          {isMulti && rerunningCutoutPath && src === rerunningCutoutPath && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 202, pointerEvents: 'all', cursor: 'not-allowed',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(3px)', borderRadius: 'inherit' }}
              onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 18, height: 18, border: '2.5px solid rgba(59,130,246,0.18)',
                              borderTopColor: '#3b82f6', borderRadius: '50%',
                              animation: 'ufm-spin 0.75s linear infinite' }} />
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
                               color: '#3b82f6', textTransform: 'uppercase' }}>Cutout…</span>
              </div>
            </div>
          )}
        </div>
      );
    }
    return (
      <div
        key={idx}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={{ position: 'relative', display: 'inline-block', transform, transformOrigin: 'center center', cursor: isMulti && editMode ? (isSelected ? 'grab' : 'pointer') : undefined, opacity: imageOpacity < 100 ? imageOpacity / 100 : undefined }}
      >
        <img style={{ ...fallbackImgStyle, filter: imgFilterStr, borderRadius: imageRadius > 0 ? `${imageRadius}%` : undefined }} src={src} alt="" onLoad={isFirst ? onFirstImgLoad : undefined} />
        {selectionUI}
        {isMulti && rerunningCutoutPath && src === rerunningCutoutPath && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 202, pointerEvents: 'all', cursor: 'not-allowed',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(3px)' }}
            onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 18, height: 18, border: '2.5px solid rgba(59,130,246,0.18)',
                            borderTopColor: '#3b82f6', borderRadius: '50%',
                            animation: 'ufm-spin 0.75s linear infinite' }} />
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
                             color: '#3b82f6', textTransform: 'uppercase' }}>Cutout…</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── PENDING FLAVOR SELECTION: show dimmed grid + amber badge ──
  if (isPendingFlavors && stagedSrcs) {
    const cols = Math.min(3, stagedSrcs.length);
    return (
      <div
        style={{
          position: "absolute",
          left: p.x,
          top: p.y,
          width: p.width,
          height: p.height,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* top spacing */}
        <div style={{ flex: 1, minHeight: 0 }} />

        {/* dimmed flavor grid */}
        <div style={{
          flex: 3,
          minHeight: 0,
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          opacity: 0.35,
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 4,
            maxWidth: "100%",
            maxHeight: "100%",
          }}>
            {stagedSrcs.map((src: string, idx: number) => (
              <img key={idx} src={src} alt="" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "contain" }} />
            ))}
          </div>
        </div>

        {/* amber "select flavors" banner */}
        <div style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {hasLabel && (() => {
            const pp = label!.price.display ? parsePriceDisplay(label!.price.display) : null;
            return (
              <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", padding: "4px", width: "100%" }}>
                {(label!.title.en || label!.title.zh) && (
                  <div className="ufm-title-main" style={{ fontSize: titleMainSize, ...titleTextStyle }}>{label!.title.en.toUpperCase()}</div>
                )}
                {pp && (
                  <div className="ufm-price" style={{ alignItems: "baseline", paddingRight: 4 }}>
                    {pp.type === "MULTI" && <span className="ufm-price-qty" style={{ fontSize: priceQtySize, marginRight: 0, ...priceTextStyle }}>{pp.quantity}/</span>}
                    <span style={{ display: "inline-flex", alignItems: "baseline" }}>
                      {priceShowDollar && (
                        <span style={{ fontSize: dollarSize, paddingRight: 2, lineHeight: 1, position: "relative", top: dollarTop, ...priceTextStyle }}>$</span>
                      )}
                      <span className="ufm-price-main" style={{ fontSize: priceMainSize, ...priceTextStyle }}>{pp.integer}</span>
                    </span>
                    {pp.decimal && <span className="ufm-price-decimal" style={{ fontSize: priceDecSize, top: priceDecTop, ...priceTextStyle }}>{pp.decimal}</span>}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // Nothing to render at all — still allow image-library drop when we have a slot item
  if (!imgSrc && !imgSrcs?.length && !hasLabel) {
    if (!p.itemId || !onPanelImageDrop) return null;
    return (
      <div
        style={{
          position: "absolute", left: p.x, top: p.y,
          width: p.width, height: p.height,
          display: "flex", flexDirection: "column",
          padding: 8, boxSizing: "border-box",
        }}
        onDragOver={handlePanelDragOver}
        onDrop={handlePanelDrop}
      >
        <div style={blankDropZoneStyle}>Drop image from library</div>
      </div>
    );
  }

  // ── Confidence badge (automation slots only) ──
  const matchSource = item?.result?.matchSource;
  const isAutoSlot = matchSource === "db" || matchSource === "serper";
  const isLow = item?.result?.lowConfidence === true;
  const confidenceBadge = editMode && isAutoSlot ? (
    <div style={{
      position: "absolute", top: 4, right: 4, zIndex: 10,
      padding: "2px 6px", borderRadius: 3,
      fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
      pointerEvents: "none",
      background: isLow ? "#FF922B" : "#40C057",
      color: "white",
    }}>
      {isLow ? "LOW" : "HIGH"}
    </div>
  ) : null;


  // ── Days-only promotional badge overlay ──
  const bannerSide: 'left' | 'right' = p.orientation === 'horizontal' ? 'left' : 'right';
  const bannerTopPct = (() => {
    if (p.orientation !== 'top') return 8;
    const hasTitleMeta = !!(label?.title?.size || label?.title?.regularPrice);
    const estimatedTitleH = SIDE_PAD * 2 + titleMainSize * 1.2
      + (hasTitleMeta ? titleMetaSize * 1.2 + 2 : 0);
    return Math.min(60, Math.round((estimatedTitleH / p.height) * 100) + 5);
  })();

  const daysBanner = label?.price?.days && label.price.days.length > 0 ? (
    <DaysOnlyBanner
      days={label.price.days}
      flyerWeekStart={flyerWeekStart}
      cardWidth={p.width}
      offsetX={p.bannerOffsetX ?? 0}
      offsetY={p.bannerOffsetY ?? 0}
      side={bannerSide}
      topPct={bannerTopPct}
      editMode={editMode}
      onPanStart={onBannerPanStart}
      onSelect={onElementSelect ? () => onElementSelect('banner') : undefined}
      onEdit={onEditBanner}
    />
  ) : null;

  // ── No-image placeholder — only during streaming before labels arrive ──
  // Once hasLabel=true, fall through to the normal layout so title/price use proper placement styling.
  if (!imgSrc && !imgSrcs?.length && matchSource === "none" && !hasLabel) {
    return (
      <div style={{
        position: "absolute", left: p.x, top: p.y,
        width: p.width, height: p.height,
        background: "#F1F3F5",
        border: "1.5px dashed #ADB5BD",
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#868e96",
        fontSize: 11,
        fontWeight: 600,
      }}
        onDragOver={handlePanelDragOver}
        onDrop={handlePanelDrop}
      >
        Drop image from library
      </div>
    );
  }

  // ── Image-zone-only processing overlays (scoped to image area, not the full card) ──
  // These are injected inside each layout's image div so price/title stay visible and interactive.
  const imgZoneOverlay = (
    <>
      {activeReplacementJobs && activeReplacementJobs.length > 0 && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 201, pointerEvents: "all", cursor: "not-allowed",
                   display: "flex", alignItems: "center", justifyContent: "center",
                   background: "rgba(255,255,255,0.6)", backdropFilter: "blur(2px)" }}
          onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "70%" }}>
            <div style={{ width: 22, height: 22, border: "3px solid rgba(0,0,0,0.12)",
                          borderTopColor: "#4C6EF5", borderRadius: "50%",
                          animation: "ufm-spin 0.75s linear infinite" }} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                           color: "rgba(0,0,0,0.5)", textTransform: "uppercase", textAlign: "center" }}>
              {!item?.result?.cutoutPath ? "Adding…" : "Replacing…"}
            </span>
            <div style={{ width: "100%", height: 3, borderRadius: 2, background: "rgba(0,0,0,0.1)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: "30%", background: "#4C6EF5", borderRadius: 2,
                            animation: "ufm-progress-pulse 1.4s ease-in-out infinite" }} />
            </div>
            {onCancelReplacementJob && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  activeReplacementJobs!.forEach(j => onCancelReplacementJob(j.id));
                }}
                style={{ marginTop: 4, padding: "5px 14px", fontSize: 11, fontWeight: 700,
                         letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer",
                         border: "none", borderRadius: 5,
                         background: "#E03131", color: "#fff",
                         boxShadow: "0 2px 6px rgba(224,49,49,0.4)" }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
      {item?.status === "processing_cutout" && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 200, pointerEvents: "all", cursor: "not-allowed",
                   display: "flex", alignItems: "center", justifyContent: "center",
                   background: "rgba(255,255,255,0.55)", backdropFilter: "blur(2px)" }}
          onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ width: 22, height: 22, border: "3px solid rgba(0,0,0,0.15)",
                          borderTopColor: "#1a1a1a", borderRadius: "50%",
                          animation: "ufm-spin 0.75s linear infinite" }} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                           color: "rgba(0,0,0,0.45)", textTransform: "uppercase" }}>
              Processing…
            </span>
          </div>
        </div>
      )}
      {!!rerunningCutoutPath && !hasMultiImages && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 202, pointerEvents: "all", cursor: "not-allowed",
                   display: "flex", alignItems: "center", justifyContent: "center",
                   background: "rgba(255,255,255,0.65)", backdropFilter: "blur(3px)" }}
          onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
            <div style={{ width: 26, height: 26, border: "3px solid rgba(59,130,246,0.18)",
                          borderTopColor: "#3b82f6", borderRadius: "50%",
                          animation: "ufm-spin 0.75s linear infinite" }} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                           color: "#3b82f6", textTransform: "uppercase", textAlign: "center" }}>
              Cutout…
            </span>
          </div>
        </div>
      )}
    </>
  );


  // ── Horizontal layout ──
  if (p.orientation === 'horizontal') {
    return (
      <div
        ref={cardRef}
        style={{
          position: "absolute", left: p.x, top: p.y,
          width: p.width, height: p.height, overflow: "visible",
        }}
        onClick={editMode ? (e) => { e.stopPropagation(); onSetSelectedEl?.(null); onElementSelect?.(null); if (selectedSubIdx !== null) onSelectSubIdx?.(null); } : undefined}
        onDragOver={handlePanelDragOver}
        onDrop={handlePanelDrop}
      >
        {/* Content wrapper — crop applied only to image div below */}
        <div style={{ position: 'absolute', inset: 0, overflow: editMode && selectedSubIdx !== null ? 'visible' : 'hidden' }}>
        {titleDrag?.active && (
          <>
            <div style={{ position: 'absolute', left: 0, bottom: 0, width: '50%', height: '35%', background: titleDrag.hoveredZone === 'vertical' ? 'rgba(34,197,94,0.40)' : 'rgba(34,197,94,0.08)', border: titleDrag.hoveredZone === 'vertical' ? '2px solid #22c55e' : '1px dashed rgba(34,197,94,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', borderRadius: 4 }}>
              <span style={{ color: '#15803d', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', opacity: titleDrag.hoveredZone === 'vertical' ? 1 : 0.4 }}>↕ VERTICAL</span>
            </div>
            <div style={{ position: 'absolute', right: 0, top: '20%', width: '45%', height: '60%', background: titleDrag.hoveredZone === 'horizontal' ? 'rgba(34,197,94,0.40)' : 'rgba(34,197,94,0.08)', border: titleDrag.hoveredZone === 'horizontal' ? '2px solid #22c55e' : '1px dashed rgba(34,197,94,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', borderRadius: 4 }}>
              <span style={{ color: '#15803d', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', opacity: titleDrag.hoveredZone === 'horizontal' ? 1 : 0.4 }}>↔ HORIZONTAL</span>
            </div>
            <div style={{ position: 'absolute', top: 0, left: '25%', width: '50%', height: '30%', background: titleDrag.hoveredZone === 'top' ? 'rgba(34,197,94,0.40)' : 'rgba(34,197,94,0.08)', border: titleDrag.hoveredZone === 'top' ? '2px solid #22c55e' : '1px dashed rgba(34,197,94,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', borderRadius: 4 }}>
              <span style={{ color: '#15803d', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', opacity: titleDrag.hoveredZone === 'top' ? 1 : 0.4 }}>↑ TOP</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
          {/* Left 55% — image; crop applied in renderImg */}
          <div
            onMouseDown={editMode && onImagePanStart ? (e) => { e.stopPropagation(); onImagePanStart(imgOffsetX, imgOffsetY, e); } : undefined}
            onClick={editMode ? (e) => { e.stopPropagation(); onSetSelectedEl?.('image'); onElementSelect?.(null); } : undefined}
            style={{ width: '55%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: editMode && selectedSubIdx !== null ? 'visible' : 'hidden', cursor: editMode ? 'grab' : undefined }}
          >
            {displaySrcs && displaySrcs.length > 1
              ? (() => {
                  const n = displaySrcs.length;
                  const { cols, rows } = n === 5 ? { cols: 2, rows: 2 } : getGridDims(n);
                  const rowArrays: string[][] = [];
                  for (let r = 0; r < rows; r++) rowArrays.push(displaySrcs.slice(r * cols, (r + 1) * cols));
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, width: '100%', height: '100%', justifyContent: 'center' }}>
                      {rowArrays.map((rowImgs, rowIdx) => (
                        <div key={rowIdx} style={{ display: 'flex', flexDirection: 'row', gap: GAP, justifyContent: 'center', alignItems: 'flex-start' }}>
                          {rowImgs.map((src, imgIdx) => renderImg(src, rowIdx * cols + imgIdx))}
                        </div>
                      ))}
                    </div>
                  );
                })()
              : imgSrc ? renderImg(imgSrc, undefined, editMode && onElementDragStart && !(displaySrcs && displaySrcs.length > 1) && selectedEl === 'image' && imgRender ? (() => {
              const bW = imgRender.wrapperStyle.width;
              const bH = imgRender.wrapperStyle.height;
              const EDGE = 4;
              const cropBounds = { width: bW, height: bH };
              const handleCrop = (side: 'left' | 'right' | 'top' | 'bottom', startValue: number) => (e: React.MouseEvent) => {
                e.stopPropagation();
                onCropDragStart?.(side, startValue, e, cropBounds);
              };
              const borderWidth = Math.max(1, bW - cropL - cropR);
              const borderHeight = Math.max(1, bH - cropT - cropB);
              return (
                <>
                  <div style={{ position: 'absolute', left: cropL, top: cropT, width: borderWidth, height: borderHeight, zIndex: 95, pointerEvents: 'none' }}>
                    {onCropDragStart && (
                      <>
                        <div style={{ position: 'absolute', left: 0, top: 0, width: EDGE, height: '100%', borderLeft: '2px dashed #4C6EF5', cursor: 'ew-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('left', cropL)} />
                        <div style={{ position: 'absolute', right: 0, top: 0, width: EDGE, height: '100%', borderRight: '2px dashed #4C6EF5', cursor: 'ew-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('right', cropR)} />
                        <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: EDGE, borderTop: '2px dashed #4C6EF5', cursor: 'ns-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('top', cropT)} />
                        <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: EDGE, borderBottom: '2px dashed #4C6EF5', cursor: 'ns-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('bottom', cropB)} />
                      </>
                    )}
                    {(['tl','tr','bl','br'] as const).map(corner => (
                      <div key={corner} onMouseDown={(e) => handleCornerMouseDown('image', corner, imgScale, e)} style={{ position: 'absolute', left: corner.includes('l') ? -5 : undefined, right: corner.includes('r') ? -5 : undefined, top: corner.includes('t') ? -5 : undefined, bottom: corner.includes('b') ? -5 : undefined, width: 10, height: 10, background: '#fff', border: '2px solid #4C6EF5', borderRadius: 2, zIndex: 91, cursor: corner === 'tl' || corner === 'br' ? 'nw-resize' : 'ne-resize', pointerEvents: 'auto' }} />
                    ))}
                  </div>
                  {onRotateDragStart && (() => {
                    const wrappedRotateDragStart = (startRotation: number, centerX: number, centerY: number, e: React.MouseEvent) => {
                      setRotatingActive(true);
                      const onUp = () => { setRotatingActive(false); window.removeEventListener('mouseup', onUp); };
                      window.addEventListener('mouseup', onUp);
                      onRotateDragStart(startRotation, centerX, centerY, e);
                    };
                    return <RotationDial bL={0} bT={0} bW={bW} bH={bH} rotation={imgRotation} visible={selectedEl === 'image' || rotatingActive} isDragging={rotatingActive} onRotateDragStart={wrappedRotateDragStart} />;
                  })()}
                </>
              );
            })() : undefined) : renderBlankImageDrop()}
            {imgZoneOverlay}
          </div>
          {/* Right 45% — title (top-right; top edge 23% down from card top) + price (bottom-right) */}
          <div style={{ width: '45%', position: 'relative', overflow: 'hidden' }}>
            {hasLabel && (label.title.en || label.title.zh) && (
              <div
                style={{
                  position: 'absolute', top: '10%', left: 0, right: 0,
                  padding: SIDE_PAD,
                  display: 'flex', alignItems: 'flex-end',
                  flexDirection: 'column', justifyContent: 'flex-start',
                  zIndex: 10, wordBreak: 'break-word', textAlign: 'right',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    position: 'relative', display: 'inline-block', alignSelf: 'flex-end',
                    opacity: (activeScaleDrag?.itemId === p.itemId && activeScaleDrag?.type === 'title') ? 0.5 : 1,
                    cursor: editMode ? 'pointer' : undefined,
                    pointerEvents: 'auto',
                    userSelect: editMode ? 'none' : undefined,
                    ...titleNudgeStyle(cardOrientation, titleOffsetX, titleOffsetY, SIDE_PAD),
                  }}
                  onMouseDown={handleTitleMouseDown}
                  onClick={editMode ? (e) => { e.stopPropagation(); onSetSelectedEl?.('title'); onElementSelect?.('title'); } : undefined}
                  onDoubleClick={editMode && onEditTitle ? (e) => { e.stopPropagation(); onEditTitle(); } : undefined}
                >
                  {editMode && onElementDragStart && selectedEl === 'title' && (
                    <>
                      <div style={{ position: 'absolute', inset: -4, border: '2px dashed #4C6EF5', pointerEvents: 'none', zIndex: 90, borderRadius: 2 }} />
                      {FRAME_CORNERS.map(([corner]) => (
                        <div
                          key={corner}
                          onMouseDown={(e) => handleCornerMouseDown('title', corner, titScale, e)}
                          style={{ position: 'absolute', width: 10, height: 10, background: '#fff', border: '2px solid #4C6EF5', borderRadius: 2, zIndex: 91,
                            ...(corner.includes('t') ? { top: -4 } : { bottom: -4 }),
                            ...(corner.includes('l') ? { left: -4 } : { right: -4 }),
                            cursor: corner === 'tl' || corner === 'br' ? 'nw-resize' : 'ne-resize',
                          }}
                        />
                      ))}
                    </>
                  )}
                  <div className="ufm-title-main" style={{ fontSize: titleMainSize, ...titleTextStyle }}>
                    {label.title.en.toUpperCase()}
                  </div>
                  {(label.title.size || label.title.regularPrice) && (
                    <div className="ufm-title-meta" style={{ fontSize: titleMetaSizeActual, marginTop: 2 + titleMetaOffsetY, ...titleBaseStyle }}>
                      {label.title.size}
                      {label.title.regularPrice && <> REG: {label.title.regularPrice}</>}
                    </div>
                  )}
                </div>
              </div>
            )}
            {hasLabel && priceParts && (
              <div
                style={{
                  position: 'absolute',
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
                  zIndex: 10,
                  opacity: (activeScaleDrag?.itemId === p.itemId && activeScaleDrag?.type === 'price') ? 0.5 : 1,
                  cursor: effectiveEditMode && onPricePanStart ? 'ns-resize' : undefined,
                  ...priceNudgeStyle(priceOffsetX, priceOffsetY, SIDE_PAD),
                }}
                onMouseDown={effectiveEditMode && onPricePanStart
                  ? (e) => { e.stopPropagation(); onPricePanStart(priceOffsetY, e); }
                  : undefined}
                onClick={editMode ? (e) => { e.stopPropagation(); onSetSelectedEl?.('price'); onElementSelect?.('price'); } : undefined}
                onDoubleClick={editMode && onEditPrice ? (e) => { e.stopPropagation(); onEditPrice(); } : undefined}
              >
                {editMode && onElementDragStart && selectedEl === 'price' && (
                  <>
                    <div style={{ position: 'absolute', inset: -4, border: '2px dashed #4C6EF5', pointerEvents: 'none', zIndex: 90, borderRadius: 2 }} />
                    {FRAME_CORNERS.map(([corner]) => (
                      <div
                        key={corner}
                        onMouseDown={(e) => handleCornerMouseDown('price', corner, prcScale, e)}
                        style={{ position: 'absolute', width: 10, height: 10, background: '#fff', border: '2px solid #4C6EF5', borderRadius: 2, zIndex: 91,
                          ...(corner.includes('t') ? { top: -4 } : { bottom: -4 }),
                          ...(corner.includes('l') ? { left: -4 } : { right: -4 }),
                          cursor: corner === 'tl' || corner === 'br' ? 'nw-resize' : 'ne-resize',
                        }}
                      />
                    ))}
                  </>
                )}
                <div className="ufm-price" style={{ display: 'flex', alignItems: 'baseline' }}>
                  {priceParts.type === "MULTI" && (
                    <span className="ufm-price-qty" style={{ fontSize: priceQtySize, marginRight: 0, ...priceTextStyle }}>{priceParts.quantity}/</span>
                  )}
                  <span style={{ display: "inline-flex", alignItems: "baseline" }}>
                    {priceShowDollar && (
                      <span style={{ fontSize: dollarSize, paddingRight: 2, lineHeight: 1, position: "relative", top: dollarTop, ...priceTextStyle }}>$</span>
                    )}
                    <span className="ufm-price-main" style={{ fontSize: priceMainSize, ...priceTextStyle }}>{priceParts.integer}</span>
                  </span>
                  {(priceParts.decimal || (priceParts.type === "SINGLE" && priceParts.unit)) && (
                    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', position: 'relative', top: priceDecTop, lineHeight: 1.1 }}>
                      {priceParts.decimal && (
                        <span className="ufm-price-decimal" style={{ fontSize: priceDecSize, ...priceTextStyle }}>{priceParts.decimal}</span>
                      )}
                      {priceParts.type === "SINGLE" && priceParts.unit && (
                        <span className="ufm-price-unit" style={{ fontSize: priceUnitSize, marginTop: priceUnitOffsetY, ...priceTextStyle }}>/{priceParts.unit.toUpperCase()}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>{/* end content clip wrapper */}
        {daysBanner}
        {confidenceBadge}
      </div>
    );
  }

  // ── Top layout: title top-center, image centered, price bottom-right ──
  if (p.orientation === 'top') {
    return (
      <div
        ref={cardRef}
        style={{
          position: "absolute", left: p.x, top: p.y,
          width: p.width, height: p.height, overflow: "visible",
        }}
        onClick={editMode ? (e) => { e.stopPropagation(); onSetSelectedEl?.(null); onElementSelect?.(null); if (selectedSubIdx !== null) onSelectSubIdx?.(null); } : undefined}
      >
        {/* Content wrapper — crop applied only to image div below */}
        <div style={{ position: 'absolute', inset: 0, overflow: editMode && selectedSubIdx !== null ? 'visible' : 'hidden' }}>
        {titleDrag?.active && (
          <>
            <div style={{ position: 'absolute', left: 0, bottom: 0, width: '50%', height: '35%', background: titleDrag.hoveredZone === 'vertical' ? 'rgba(34,197,94,0.40)' : 'rgba(34,197,94,0.08)', border: titleDrag.hoveredZone === 'vertical' ? '2px solid #22c55e' : '1px dashed rgba(34,197,94,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', borderRadius: 4 }}>
              <span style={{ color: '#15803d', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', opacity: titleDrag.hoveredZone === 'vertical' ? 1 : 0.4 }}>↕ VERTICAL</span>
            </div>
            <div style={{ position: 'absolute', right: 0, top: '20%', width: '45%', height: '60%', background: titleDrag.hoveredZone === 'horizontal' ? 'rgba(34,197,94,0.40)' : 'rgba(34,197,94,0.08)', border: titleDrag.hoveredZone === 'horizontal' ? '2px solid #22c55e' : '1px dashed rgba(34,197,94,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', borderRadius: 4 }}>
              <span style={{ color: '#15803d', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', opacity: titleDrag.hoveredZone === 'horizontal' ? 1 : 0.4 }}>↔ HORIZONTAL</span>
            </div>
            <div style={{ position: 'absolute', top: 0, left: '25%', width: '50%', height: '30%', background: titleDrag.hoveredZone === 'top' ? 'rgba(34,197,94,0.40)' : 'rgba(34,197,94,0.08)', border: titleDrag.hoveredZone === 'top' ? '2px solid #22c55e' : '1px dashed rgba(34,197,94,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', borderRadius: 4 }}>
              <span style={{ color: '#15803d', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', opacity: titleDrag.hoveredZone === 'top' ? 1 : 0.4 }}>↑ TOP</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Title: top center */}
          {hasLabel && (label.title.en || label.title.zh) && (
            <div
              style={{
                position: 'relative',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                alignSelf: 'center',
                padding: SIDE_PAD, zIndex: 10, wordBreak: 'break-word', textAlign: 'center',
                opacity: (activeScaleDrag?.itemId === p.itemId && activeScaleDrag?.type === 'title') ? 0.5 : 1,
                cursor: editMode ? 'pointer' : undefined,
                userSelect: editMode ? 'none' : undefined,
                ...titleNudgeStyle(cardOrientation, titleOffsetX, titleOffsetY, SIDE_PAD),
              }}
              onMouseDown={handleTitleMouseDown}
              onClick={editMode ? (e) => { e.stopPropagation(); onSetSelectedEl?.('title'); onElementSelect?.('title'); } : undefined}
              onDoubleClick={editMode && onEditTitle ? (e) => { e.stopPropagation(); onEditTitle(); } : undefined}
            >
              {editMode && onElementDragStart && selectedEl === 'title' && (
                <>
                  <div style={{ position: 'absolute', inset: -4, border: '2px dashed #4C6EF5', pointerEvents: 'none', zIndex: 90, borderRadius: 2 }} />
                  {FRAME_CORNERS.map(([corner]) => (
                    <div
                      key={corner}
                      onMouseDown={(e) => handleCornerMouseDown('title', corner, titScale, e)}
                      style={{ position: 'absolute', width: 10, height: 10, background: '#fff', border: '2px solid #4C6EF5', borderRadius: 2, zIndex: 91,
                        ...(corner.includes('t') ? { top: -4 } : { bottom: -4 }),
                        ...(corner.includes('l') ? { left: -4 } : { right: -4 }),
                        cursor: corner === 'tl' || corner === 'br' ? 'nw-resize' : 'ne-resize',
                      }}
                    />
                  ))}
                </>
              )}
              <div className="ufm-title-main" style={{ fontSize: titleMainSize, ...titleTextStyle }}>
                {label.title.en.toUpperCase()}
              </div>
              {(label.title.size || label.title.regularPrice) && (
                <div className="ufm-title-meta" style={{ fontSize: titleMetaSizeActual, marginTop: 2 + titleMetaOffsetY, ...titleBaseStyle }}>
                  {label.title.size}
                  {label.title.regularPrice && <> REG: {label.title.regularPrice}</>}
                </div>
              )}
            </div>
          )}
          {/* Image: centered in remaining flex space; crop applied in renderImg; handles inside wrapper for alignment */}
          <div
            onMouseDown={editMode && onImagePanStart ? (e) => { e.stopPropagation(); onImagePanStart(imgOffsetX, imgOffsetY, e); } : undefined}
            onClick={editMode ? (e) => { e.stopPropagation(); onSetSelectedEl?.('image'); onElementSelect?.(null); } : undefined}
            style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: editMode && selectedSubIdx !== null ? 'visible' : 'hidden', minHeight: 0, cursor: editMode ? 'grab' : undefined }}
          >
            {displaySrcs && displaySrcs.length > 1
              ? (() => {
                  const n = displaySrcs.length;
                  const { cols, rows } = n === 5 ? { cols: 2, rows: 2 } : getGridDims(n);
                  const rowArrays: string[][] = [];
                  for (let r = 0; r < rows; r++) rowArrays.push(displaySrcs.slice(r * cols, (r + 1) * cols));
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, width: '100%', height: '100%', justifyContent: 'center' }}>
                      {rowArrays.map((rowImgs, rowIdx) => (
                        <div key={rowIdx} style={{ display: 'flex', flexDirection: 'row', gap: GAP, justifyContent: 'center', alignItems: 'flex-start' }}>
                          {rowImgs.map((src, imgIdx) => renderImg(src, rowIdx * cols + imgIdx))}
                        </div>
                      ))}
                    </div>
                  );
                })()
              : imgSrc ? renderImg(imgSrc, undefined, editMode && onElementDragStart && !(displaySrcs && displaySrcs.length > 1) && selectedEl === 'image' && imgRender ? (() => {
              const bW = imgRender.wrapperStyle.width;
              const bH = imgRender.wrapperStyle.height;
              const EDGE = 4;
              const cropBounds = { width: bW, height: bH };
              const handleCrop = (side: 'left' | 'right' | 'top' | 'bottom', startValue: number) => (e: React.MouseEvent) => {
                e.stopPropagation();
                onCropDragStart?.(side, startValue, e, cropBounds);
              };
              const borderWidth = Math.max(1, bW - cropL - cropR);
              const borderHeight = Math.max(1, bH - cropT - cropB);
              return (
                <>
                  <div style={{ position: 'absolute', left: cropL, top: cropT, width: borderWidth, height: borderHeight, zIndex: 95, pointerEvents: 'none' }}>
                    {onCropDragStart && (
                      <>
                        <div style={{ position: 'absolute', left: 0, top: 0, width: EDGE, height: '100%', borderLeft: '2px dashed #4C6EF5', cursor: 'ew-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('left', cropL)} />
                        <div style={{ position: 'absolute', right: 0, top: 0, width: EDGE, height: '100%', borderRight: '2px dashed #4C6EF5', cursor: 'ew-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('right', cropR)} />
                        <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: EDGE, borderTop: '2px dashed #4C6EF5', cursor: 'ns-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('top', cropT)} />
                        <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: EDGE, borderBottom: '2px dashed #4C6EF5', cursor: 'ns-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('bottom', cropB)} />
                      </>
                    )}
                    {(['tl','tr','bl','br'] as const).map(corner => (
                      <div key={corner} onMouseDown={(e) => handleCornerMouseDown('image', corner, imgScale, e)} style={{ position: 'absolute', left: corner.includes('l') ? -5 : undefined, right: corner.includes('r') ? -5 : undefined, top: corner.includes('t') ? -5 : undefined, bottom: corner.includes('b') ? -5 : undefined, width: 10, height: 10, background: '#fff', border: '2px solid #4C6EF5', borderRadius: 2, zIndex: 91, cursor: corner === 'tl' || corner === 'br' ? 'nw-resize' : 'ne-resize', pointerEvents: 'auto' }} />
                    ))}
                  </div>
                  {onRotateDragStart && (() => {
                    const wrappedRotateDragStart = (startRotation: number, centerX: number, centerY: number, e: React.MouseEvent) => {
                      setRotatingActive(true);
                      const onUp = () => { setRotatingActive(false); window.removeEventListener('mouseup', onUp); };
                      window.addEventListener('mouseup', onUp);
                      onRotateDragStart(startRotation, centerX, centerY, e);
                    };
                    return <RotationDial bL={0} bT={0} bW={bW} bH={bH} rotation={imgRotation} visible={selectedEl === 'image' || rotatingActive} isDragging={rotatingActive} onRotateDragStart={wrappedRotateDragStart} />;
                  })()}
                </>
              );
            })() : undefined) : renderBlankImageDrop()}
            {imgZoneOverlay}
          </div>
        </div>
        {/* Price: absolute bottom-right */}
        {hasLabel && priceParts && (
          <div
            style={{
              position: 'absolute',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
              zIndex: 10,
              opacity: (activeScaleDrag?.itemId === p.itemId && activeScaleDrag?.type === 'price') ? 0.5 : 1,
              cursor: effectiveEditMode && onPricePanStart ? 'ns-resize' : undefined,
              ...priceNudgeStyle(priceOffsetX, priceOffsetY, SIDE_PAD),
            }}
            onMouseDown={effectiveEditMode && onPricePanStart
              ? (e) => { e.stopPropagation(); onPricePanStart(priceOffsetY, e); }
              : undefined}
            onClick={editMode ? (e) => { e.stopPropagation(); onSetSelectedEl?.('price'); onElementSelect?.('price'); } : undefined}
            onDoubleClick={editMode && onEditPrice ? (e) => { e.stopPropagation(); onEditPrice(); } : undefined}
          >
            {editMode && onElementDragStart && selectedEl === 'price' && (
              <>
                <div style={{ position: 'absolute', inset: -4, border: '2px dashed #4C6EF5', pointerEvents: 'none', zIndex: 90, borderRadius: 2 }} />
                {FRAME_CORNERS.map(([corner]) => (
                  <div
                    key={corner}
                    onMouseDown={(e) => handleCornerMouseDown('price', corner, prcScale, e)}
                    style={{ position: 'absolute', width: 10, height: 10, background: '#fff', border: '2px solid #4C6EF5', borderRadius: 2, zIndex: 91,
                      ...(corner.includes('t') ? { top: -4 } : { bottom: -4 }),
                      ...(corner.includes('l') ? { left: -4 } : { right: -4 }),
                      cursor: corner === 'tl' || corner === 'br' ? 'nw-resize' : 'ne-resize',
                    }}
                  />
                ))}
              </>
            )}
            <div className="ufm-price" style={{ display: 'flex', alignItems: 'baseline' }}>
              {priceParts.type === "MULTI" && (
                <span className="ufm-price-qty" style={{ fontSize: priceQtySize, marginRight: 0, ...priceTextStyle }}>{priceParts.quantity}/</span>
              )}
              <span style={{ display: "inline-flex", alignItems: "baseline" }}>
                {priceShowDollar && (
                  <span style={{ fontSize: dollarSize, paddingRight: 2, lineHeight: 1, position: "relative", top: dollarTop, ...priceTextStyle }}>$</span>
                )}
                <span className="ufm-price-main" style={{ fontSize: priceMainSize, ...priceTextStyle }}>{priceParts.integer}</span>
              </span>
              {(priceParts.decimal || (priceParts.type === "SINGLE" && priceParts.unit)) && (
                <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', position: 'relative', top: priceDecTop, lineHeight: 1.1 }}>
                  {priceParts.decimal && (
                    <span className="ufm-price-decimal" style={{ fontSize: priceDecSize, ...priceTextStyle }}>{priceParts.decimal}</span>
                  )}
                  {priceParts.type === "SINGLE" && priceParts.unit && (
                    <span className="ufm-price-unit" style={{ fontSize: priceUnitSize, marginTop: priceUnitOffsetY, ...priceTextStyle }}>/{priceParts.unit.toUpperCase()}</span>
                  )}
                </span>
              )}
            </div>
          </div>
        )}
        </div>{/* end content clip wrapper */}
        {daysBanner}
        {confidenceBadge}
      </div>
    );
  }

  // ── Layout: full-width image, title bottom-left, price bottom-right ──
  return (
    <div
      ref={cardRef}
      style={{
        position: "absolute", left: p.x, top: p.y,
        width: p.width, height: p.height, overflow: "visible",
      }}
      onClick={editMode ? (e) => { e.stopPropagation(); onSetSelectedEl?.(null); onElementSelect?.(null); if (selectedSubIdx !== null) onSelectSubIdx?.(null); } : undefined}
      onDragOver={handlePanelDragOver}
      onDrop={handlePanelDrop}
    >
      {/* Content wrapper — crop is applied only to image zone below */}
      <div style={{ position: 'absolute', inset: 0, overflow: editMode && selectedSubIdx !== null ? 'visible' : 'hidden' }}>
      {/* Layout switch drop zones — shown during title drag */}
      {titleDrag?.active && (
        <>
          <div style={{ position: 'absolute', left: 0, bottom: 0, width: '50%', height: '35%', background: titleDrag.hoveredZone === 'vertical' ? 'rgba(34,197,94,0.40)' : 'rgba(34,197,94,0.08)', border: titleDrag.hoveredZone === 'vertical' ? '2px solid #22c55e' : '1px dashed rgba(34,197,94,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', borderRadius: 4 }}>
            <span style={{ color: '#15803d', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', opacity: titleDrag.hoveredZone === 'vertical' ? 1 : 0.4 }}>↕ VERTICAL</span>
          </div>
          <div style={{ position: 'absolute', right: 0, top: '20%', width: '45%', height: '60%', background: titleDrag.hoveredZone === 'horizontal' ? 'rgba(34,197,94,0.40)' : 'rgba(34,197,94,0.08)', border: titleDrag.hoveredZone === 'horizontal' ? '2px solid #22c55e' : '1px dashed rgba(34,197,94,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', borderRadius: 4 }}>
            <span style={{ color: '#15803d', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', opacity: titleDrag.hoveredZone === 'horizontal' ? 1 : 0.4 }}>↔ HORIZONTAL</span>
          </div>
          <div style={{ position: 'absolute', top: 0, left: '25%', width: '50%', height: '30%', background: titleDrag.hoveredZone === 'top' ? 'rgba(34,197,94,0.40)' : 'rgba(34,197,94,0.08)', border: titleDrag.hoveredZone === 'top' ? '2px solid #22c55e' : '1px dashed rgba(34,197,94,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', borderRadius: 4 }}>
            <span style={{ color: '#15803d', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', opacity: titleDrag.hoveredZone === 'top' ? 1 : 0.4 }}>↑ TOP</span>
          </div>
        </>
      )}
      {/* Image zone — crop applied here only (not title/price); flex rows or diagonal layout */}
      <div
        onMouseDown={editMode && !(displaySrcs && displaySrcs.length > 1) && onImagePanStart
          ? (e) => { e.stopPropagation(); onImagePanStart(imgOffsetX, imgOffsetY, e); }
          : undefined}
        onClick={editMode ? (e) => { e.stopPropagation(); onSetSelectedEl?.('image'); onElementSelect?.(null); } : undefined}
        style={{
        position: "absolute",
        top: topPad, left: SIDE_PAD,
        width: availW, height: availH,
        overflow: editMode && selectedSubIdx !== null ? 'visible' : 'hidden',
        zIndex: 1,
        cursor: editMode && !(displaySrcs && displaySrcs.length > 1) ? 'grab' : undefined,
        opacity: (activeScaleDrag?.itemId === p.itemId && activeScaleDrag?.type === 'image') ? 0.5 : 1,
        ...(useDiagonal
          ? { display: "block" }
          : n === 5
          ? { display: "block" }
          : displaySrcs && displaySrcs.length > 1
          ? { display: "flex", flexDirection: "column", gap: GAP }
          : { display: "flex", flexDirection: "row", alignItems: "flex-start", justifyContent: "center" }
        ),
      }}>
        {displaySrcs && displaySrcs.length > 1
          ? (() => {
              if (useDiagonal) {
                const renderW = imgRender ? imgRender.wrapperStyle.width  : cellW;
                const renderH = imgRender ? imgRender.wrapperStyle.height : cellH;
                const stepX = (availW - renderW) / 2;
                const stepY = (availH - renderH) / 2;
                return displaySrcs.map((src, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: "absolute",
                      left: Math.round(idx * stepX),
                      top: Math.round(idx * stepY),
                      zIndex: idx + 1,
                    }}
                  >
                    {renderImg(src, idx)}
                  </div>
                ));
              }
              // n=5: 2×2 corners + overlapping center
              if (n === 5 && !useDiagonal) {
                const cornerIndices = [0, 1, 3, 4];
                const centerIdx = 2;

                const cornerW = imgRender ? imgRender.wrapperStyle.width  : cellW;
                const cornerH = imgRender ? imgRender.wrapperStyle.height : cellH;
                const gridW = cornerW * 2 + GAP;
                const gridH = cornerH * 2 + GAP;
                const gridLeft = Math.round((availW - gridW) / 2);
                const gridTop  = Math.round((availH - gridH) / 2);
                const cornerPositions = [
                  { left: gridLeft,                top: gridTop },
                  { left: gridLeft + cornerW + GAP, top: gridTop },
                  { left: gridLeft,                top: gridTop + cornerH + GAP },
                  { left: gridLeft + cornerW + GAP, top: gridTop + cornerH + GAP },
                ];

                const centerW = n5CenterRender ? n5CenterRender.wrapperStyle.width  : n5CenterCellW;
                const centerH = n5CenterRender ? n5CenterRender.wrapperStyle.height : n5CenterCellH;
                const centerLeft = Math.round((availW - centerW) / 2);
                const centerTop  = Math.round((availH - centerH) / 2);

                return (
                  <>
                    {cornerIndices.map((srcIdx, i) => (
                      <div key={srcIdx} style={{ position: "absolute", left: cornerPositions[i].left, top: cornerPositions[i].top, zIndex: 1 }}>
                        {renderImg(displaySrcs[srcIdx], srcIdx)}
                      </div>
                    ))}
                    <div style={{ position: "absolute", left: centerLeft, top: centerTop, zIndex: 5 }}>
                      {renderImg(displaySrcs[centerIdx], centerIdx)}
                    </div>
                  </>
                );
              }

              // Flex rows: split displaySrcs into rows, each row is a centered flex row.
              const rowArrays: string[][] = [];
              for (let r = 0; r < rows; r++) {
                rowArrays.push(displaySrcs.slice(r * cols, (r + 1) * cols));
              }
              return rowArrays.map((rowImgs, rowIdx) => (
                <div key={rowIdx} style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "row",
                  gap: GAP,
                  justifyContent: "center",
                  alignItems: "flex-start",
                }}>
                  {rowImgs.map((src, imgIdx) => renderImg(src, rowIdx * cols + imgIdx))}
                </div>
              ));
            })()
          : imgSrc ? renderImg(imgSrc, undefined, editMode && onElementDragStart && !(displaySrcs && displaySrcs.length > 1) && selectedEl === 'image' && imgRender ? (() => {
              const bW = imgRender.wrapperStyle.width;
              const bH = imgRender.wrapperStyle.height;
              const EDGE = 4;
              const cropBounds = { width: bW, height: bH };
              const handleCrop = (side: 'left' | 'right' | 'top' | 'bottom', startValue: number) => (e: React.MouseEvent) => {
                e.stopPropagation();
                onCropDragStart?.(side, startValue, e, cropBounds);
              };
              const borderWidth = Math.max(1, bW - cropL - cropR);
              const borderHeight = Math.max(1, bH - cropT - cropB);
              return (
                <>
                  <div style={{ position: 'absolute', left: cropL, top: cropT, width: borderWidth, height: borderHeight, zIndex: 95, pointerEvents: 'none' }}>
                    {onCropDragStart && (
                      <>
                        <div style={{ position: 'absolute', left: 0, top: 0, width: EDGE, height: '100%', borderLeft: '2px dashed #4C6EF5', cursor: 'ew-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('left', cropL)} />
                        <div style={{ position: 'absolute', right: 0, top: 0, width: EDGE, height: '100%', borderRight: '2px dashed #4C6EF5', cursor: 'ew-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('right', cropR)} />
                        <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: EDGE, borderTop: '2px dashed #4C6EF5', cursor: 'ns-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('top', cropT)} />
                        <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: EDGE, borderBottom: '2px dashed #4C6EF5', cursor: 'ns-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('bottom', cropB)} />
                      </>
                    )}
                    {(['tl','tr','bl','br'] as const).map(corner => (
                      <div key={corner} onMouseDown={(e) => handleCornerMouseDown('image', corner, imgScale, e)} style={{ position: 'absolute', left: corner.includes('l') ? -5 : undefined, right: corner.includes('r') ? -5 : undefined, top: corner.includes('t') ? -5 : undefined, bottom: corner.includes('b') ? -5 : undefined, width: 10, height: 10, background: '#fff', border: '2px solid #4C6EF5', borderRadius: 2, zIndex: 91, cursor: corner === 'tl' || corner === 'br' ? 'nw-resize' : 'ne-resize', pointerEvents: 'auto' }} />
                    ))}
                  </div>
                  {onRotateDragStart && (() => {
                    const wrappedRotateDragStart = (startRotation: number, centerX: number, centerY: number, e: React.MouseEvent) => {
                      setRotatingActive(true);
                      const onUp = () => { setRotatingActive(false); window.removeEventListener('mouseup', onUp); };
                      window.addEventListener('mouseup', onUp);
                      onRotateDragStart(startRotation, centerX, centerY, e);
                    };
                    return <RotationDial bL={0} bT={0} bW={bW} bH={bH} rotation={imgRotation} visible={selectedEl === 'image' || rotatingActive} isDragging={rotatingActive} onRotateDragStart={wrappedRotateDragStart} />;
                  })()}
                </>
              );
            })() : undefined) : renderBlankImageDrop()}
        {imgZoneOverlay}
      </div>

      {/* Title — absolute bottom-left, no clipping */}
      {hasLabel && (label.title.en || label.title.zh) && (
        <div ref={titleRef} style={{
          position: "absolute",
          maxWidth: "50%",
          display: "flex", flexDirection: "column",
          justifyContent: "flex-end",
          zIndex: 10,
          wordBreak: "break-word",
          opacity: (activeScaleDrag?.itemId === p.itemId && activeScaleDrag?.type === 'title') ? 0.5 : 1,
          cursor: editMode ? "pointer" : undefined,
          userSelect: editMode ? "none" : undefined,
          ...titleNudgeStyle(cardOrientation, titleOffsetX, titleOffsetY, SIDE_PAD),
        }}
        onMouseDown={handleTitleMouseDown}
        onClick={editMode ? (e) => { e.stopPropagation(); onSetSelectedEl?.('title'); onElementSelect?.('title'); } : undefined}
        onDoubleClick={editMode && onEditTitle ? (e) => { e.stopPropagation(); onEditTitle(); } : undefined}
        >
          {editMode && onElementDragStart && selectedEl === 'title' && (
            <>
              <div style={{ position: 'absolute', inset: -4, border: '2px dashed #4C6EF5', pointerEvents: 'none', zIndex: 90, borderRadius: 2 }} />
              {FRAME_CORNERS.map(([corner]) => (
                <div
                  key={corner}
                  onMouseDown={(e) => handleCornerMouseDown('title', corner, titScale, e)}
                  style={{ position: 'absolute', width: 10, height: 10, background: '#fff', border: '2px solid #4C6EF5', borderRadius: 2, zIndex: 91,
                    ...(corner.includes('t') ? { top: -4 } : { bottom: -4 }),
                    ...(corner.includes('l') ? { left: -4 } : { right: -4 }),
                    cursor: corner === 'tl' || corner === 'br' ? 'nw-resize' : 'ne-resize',
                  }}
                />
              ))}
            </>
          )}
          <div className="ufm-title-main" style={{ fontSize: titleMainSize, ...titleTextStyle }}>
            {label.title.en.toUpperCase()}
          </div>
          {(label.title.size || label.title.regularPrice) && (
            <div className="ufm-title-meta" style={{ fontSize: titleMetaSizeActual, marginTop: 2 + titleMetaOffsetY, ...titleBaseStyle }}>
              {label.title.size}
              {label.title.regularPrice && <> REG: {label.title.regularPrice}</>}
            </div>
          )}
        </div>
      )}

      {/* Price — absolute bottom-right, no clipping; font scaled down if it overlaps title */}
      {hasLabel && priceParts && (
        <div ref={priceRef} style={{
          position: "absolute",
          display: "flex",
          alignItems: "flex-end", justifyContent: "flex-end",
          zIndex: 10,
          opacity: (activeScaleDrag?.itemId === p.itemId && activeScaleDrag?.type === 'price') ? 0.5 : 1,
          cursor: effectiveEditMode && onPricePanStart ? 'ns-resize' : undefined,
          ...priceNudgeStyle(priceOffsetX, priceOffsetY, SIDE_PAD),
        }}
        onMouseDown={effectiveEditMode && onPricePanStart
          ? (e) => { e.stopPropagation(); onPricePanStart(priceOffsetY, e); }
          : undefined}
        onClick={editMode ? (e) => { e.stopPropagation(); onSetSelectedEl?.('price'); onElementSelect?.('price'); } : undefined}
        onDoubleClick={editMode && onEditPrice ? (e) => { e.stopPropagation(); onEditPrice(); } : undefined}
        >
          {editMode && onElementDragStart && selectedEl === 'price' && (
            <>
              <div style={{ position: 'absolute', inset: -4, border: '2px dashed #4C6EF5', pointerEvents: 'none', zIndex: 90, borderRadius: 2 }} />
              {FRAME_CORNERS.map(([corner]) => (
                <div
                  key={corner}
                  onMouseDown={(e) => handleCornerMouseDown('price', corner, prcScale, e)}
                  style={{ position: 'absolute', width: 10, height: 10, background: '#fff', border: '2px solid #4C6EF5', borderRadius: 2, zIndex: 91,
                    ...(corner.includes('t') ? { top: -4 } : { bottom: -4 }),
                    ...(corner.includes('l') ? { left: -4 } : { right: -4 }),
                    cursor: corner === 'tl' || corner === 'br' ? 'nw-resize' : 'ne-resize',
                  }}
                />
              ))}
            </>
          )}
          <div className="ufm-price" style={{ display: "flex", alignItems: "baseline" }}>
            {priceParts.type === "MULTI" && (
              <span className="ufm-price-qty" style={{ fontSize: priceQtySize, marginRight: 0, ...priceTextStyle }}>{priceParts.quantity}/</span>
            )}
            <span style={{ display: "inline-flex", alignItems: "baseline" }}>
              {priceShowDollar && (
                <span style={{ fontSize: dollarSize, paddingRight: 2, lineHeight: 1, position: "relative", top: dollarTop, ...priceTextStyle }}>$</span>
              )}
              <span className="ufm-price-main" style={{ fontSize: priceMainSize, ...priceTextStyle }}>{priceParts.integer}</span>
            </span>
            {(priceParts.decimal || (priceParts.type === "SINGLE" && priceParts.unit)) && (
              <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', position: 'relative', top: priceDecTop, lineHeight: 1.1 }}>
                {priceParts.decimal && (
                  <span className="ufm-price-decimal" style={{ fontSize: priceDecSize, ...priceTextStyle }}>{priceParts.decimal}</span>
                )}
                {priceParts.type === "SINGLE" && priceParts.unit && (
                  <span className="ufm-price-unit" style={{ fontSize: priceUnitSize, marginTop: priceUnitOffsetY, ...priceTextStyle }}>/{priceParts.unit.toUpperCase()}</span>
                )}
              </span>
            )}
          </div>
        </div>
      )}

      </div>{/* end content clip wrapper */}

      {/* Replacement-in-progress overlay — shown while downloadAndIngestFromUrl is running */}
      {/* Days-only promotional badge */}
      {daysBanner}
      {/* Confidence badge (automation slots) */}
      {confidenceBadge}
      {/* Cutout failed badge — card still fully interactive */}
      {item?.status === "cutout_error" && (
        <div style={{ position: "absolute", bottom: 4, right: 4, zIndex: 200, pointerEvents: "none",
                      background: "rgba(245,158,11,0.9)", color: "#fff", fontSize: 9,
                      fontWeight: 700, letterSpacing: "0.05em", padding: "2px 5px",
                      borderRadius: 3, textTransform: "uppercase" }}>
          Cutout failed
        </div>
      )}

    </div>
  );
}

export default function RenderFlyerPlacements({
  items,
  placements,
  discountLabels,
  flyerWeekStart,
  editMode,
  activeScaleDrag,
  onElementDragStart,
  onRotateDragStart,
  onEditTitle,
  onEditPrice,
  onSubImageScaleDragStart,
  onSubImageRotateDragStart,
  onDeleteSubImage,
  onImagePanStart,
  onSubImagePanStart,
  onOrientationChange,
  onCropDragStart,
  onSubImageCropDragStart,
  onBannerPanStart,
  onEditBannerDays,
  onPricePanStart,
  onElementSelect,
  onCardContextMenu,
  replacementJobs,
  onCancelReplacementJob,
  rerunningCutoutMap,
  onPanelImageDrop,
}: {
  items: any[];
  placements: any[];
  discountLabels?: DiscountLabel[];
  flyerWeekStart?: string;
  editMode?: boolean;
  activeScaleDrag?: { itemId: string; type: string } | null;
  onElementDragStart?: (
    cardId: string,
    type: 'image' | 'title' | 'price',
    corner: 'tl' | 'tr' | 'bl' | 'br',
    startScale: number,
    e: React.MouseEvent
  ) => void;
  onRotateDragStart?: (cardId: string, startRotation: number, centerX: number, centerY: number, e: React.MouseEvent) => void;
  onEditTitle?: (itemId: string) => void;
  onEditPrice?: (itemId: string) => void;
  onSubImageScaleDragStart?: (itemId: string, subIdx: number, corner: 'tl' | 'tr' | 'bl' | 'br', startScale: number, e: React.MouseEvent) => void;
  onSubImageRotateDragStart?: (itemId: string, subIdx: number, startRot: number, cx: number, cy: number, e: React.MouseEvent) => void;
  onDeleteSubImage?: (itemId: string, subIdx: number) => void;
  onImagePanStart?: (itemId: string, startOffsetX: number, startOffsetY: number, e: React.MouseEvent) => void;
  onSubImagePanStart?: (itemId: string, subIdx: number, startOffsetX: number, startOffsetY: number, e: React.MouseEvent) => void;
  onOrientationChange?: (itemId: string, orientation: 'vertical' | 'horizontal' | 'top') => void;
  onCropDragStart?: (itemId: string, side: 'left' | 'right' | 'top' | 'bottom', startValue: number, e: React.MouseEvent, bounds?: { width: number; height: number }) => void;
  onSubImageCropDragStart?: (itemId: string, subIdx: number, side: 'left' | 'right' | 'top' | 'bottom', startValue: number, e: React.MouseEvent, bounds: { width: number; height: number }) => void;
  onBannerPanStart?: (itemId: string, startOffsetX: number, startOffsetY: number, e: React.MouseEvent) => void;
  onEditBannerDays?: (itemId: string) => void;
  onPricePanStart?: (itemId: string, startOffsetY: number, e: React.MouseEvent) => void;
  onElementSelect?: (itemId: string, element: 'title' | 'price' | 'banner' | null) => void;
  onCardContextMenu?: (itemId: string) => void;
  replacementJobs?: Array<{ id: string; itemId: string; url: string; status: "processing" | "done" | "error"; errorMessage?: string }>;
  onCancelReplacementJob?: (jobId: string) => void;
  rerunningCutoutMap?: Map<string, string>;
  onPanelImageDrop?: PanelImageDropHandler;
}) {
  // Single unified selection: only one card element or sub-image can be selected at a time
  const [activeSel, setActiveSel] = useState<
    | { itemId: string; kind: 'el'; element: 'image' | 'title' | 'price' }
    | { itemId: string; kind: 'sub'; subIdx: number }
    | null
  >(null);

  if (!Array.isArray(items) || !Array.isArray(placements)) return null;

  const labelMap = new Map(
    (discountLabels || [])
      .filter((l) => l && l.id != null)
      .map((l) => [l.id, l])
  );

  /** Build a label from item.result when no discount label exists (e.g. newly added image). */
  function getLabelForItem(item: any, itemId: string): DiscountLabel | null {
    const fromMap = labelMap.get(itemId);
    if (fromMap) return fromMap;
    const t = item?.result?.title;
    const ai = item?.result?.aiTitle;
    const en = t?.en ?? ai?.en ?? "";
    const zh = t?.zh ?? ai?.zh ?? "";
    const size = t?.size ?? ai?.size ?? "";
    const regularPrice =
      (item?.result?.title as any)?.regularPrice != null
        ? String((item.result.title as any).regularPrice)
        : (item?.result?.llmResult?.items?.[0] as any)?.regular_price != null
          ? String((item.result.llmResult.items[0] as any).regular_price)
          : "";
    // discount.price may be an object { display: "$5.59" } or a plain string
    const rawSaleFromDiscount = (item?.result?.discount as any)?.price ?? (item?.result?.discount as any)?.display;
    const saleFromDiscount =
      rawSaleFromDiscount != null && typeof rawSaleFromDiscount === "object"
        ? (rawSaleFromDiscount as any).display
        : rawSaleFromDiscount;
    const priceDisplay = (() => {
      if (saleFromDiscount != null && String(saleFromDiscount).trim() !== "") {
        const s = String(saleFromDiscount).trim();
        // Multi-buy strings like "2 FOR $5.99" must NOT get a $ prepended —
        // parsePriceDisplay's MULTI regex requires the string to start with a digit.
        // Only add $ when s is a bare number like "5.99" with no existing prefix.
        if (s.startsWith("$") || /FOR/i.test(s) || s.includes("/")) return s;
        return `$${s}`;
      }
      const llmSalePrice = (item?.result?.llmResult?.items?.[0] as any)?.sale_price;
      if (llmSalePrice != null) {
        const qty = Number((item?.result?.llmResult?.items?.[0] as any)?.quantity);
        const rawPrice = parseFloat(String(llmSalePrice)).toFixed(2);
        return qty > 1 ? `${qty} FOR $${rawPrice}` : `$${rawPrice}`;
      }
      return "";
    })();
    return {
      id: itemId,
      title: { en, zh, size, regularPrice },
      price: { display: priceDisplay },
    };
  }

  return (
    <>
      {placements.map((p) => {
        const item = items.find((it: any) => it.id === p.itemId);
        if (!item) return null;
        const label = getLabelForItem(item, p.itemId);
        const handleElementDrag = onElementDragStart
          ? (type: 'image' | 'title' | 'price', corner: 'tl' | 'tr' | 'bl' | 'br', startScale: number, e: React.MouseEvent) =>
              onElementDragStart(p.itemId, type, corner, startScale, e)
          : undefined;
        const handleRotateDrag = onRotateDragStart
          ? (startRotation: number, centerX: number, centerY: number, e: React.MouseEvent) => onRotateDragStart(p.itemId, startRotation, centerX, centerY, e)
          : undefined;
        return (
          <PlacementCard
            key={p.itemId}
            p={p}
            item={item}
            label={label}
            flyerWeekStart={flyerWeekStart}
            editMode={editMode}
            activeScaleDrag={activeScaleDrag}
            onElementDragStart={handleElementDrag}
            onRotateDragStart={handleRotateDrag}
            onEditTitle={onEditTitle ? () => onEditTitle(p.itemId) : undefined}
            onEditPrice={onEditPrice ? () => onEditPrice(p.itemId) : undefined}
            onSubImageScaleDragStart={onSubImageScaleDragStart
              ? (subIdx, corner, startScale, e) => onSubImageScaleDragStart(p.itemId, subIdx, corner, startScale, e)
              : undefined}
            onSubImageRotateDragStart={onSubImageRotateDragStart
              ? (subIdx, startRot, cx, cy, e) => onSubImageRotateDragStart(p.itemId, subIdx, startRot, cx, cy, e)
              : undefined}
            onDeleteSubImage={onDeleteSubImage
              ? (subIdx) => onDeleteSubImage(p.itemId, subIdx)
              : undefined}
            onImagePanStart={onImagePanStart
              ? (startOffsetX, startOffsetY, e) => onImagePanStart(p.itemId, startOffsetX, startOffsetY, e)
              : undefined}
            onSubImagePanStart={onSubImagePanStart
              ? (subIdx, startOffsetX, startOffsetY, e) => onSubImagePanStart(p.itemId, subIdx, startOffsetX, startOffsetY, e)
              : undefined}
            onOrientationChange={onOrientationChange
              ? (orientation) => onOrientationChange(p.itemId, orientation)
              : undefined}
            onCropDragStart={onCropDragStart
              ? (side, startValue, e, bounds?) => onCropDragStart(p.itemId, side, startValue, e, bounds)
              : undefined}
            onSubImageCropDragStart={onSubImageCropDragStart
              ? (subIdx, side, startValue, e, bounds) => onSubImageCropDragStart(p.itemId, subIdx, side, startValue, e, bounds)
              : undefined}
            onBannerPanStart={onBannerPanStart
              ? (startOffsetX, startOffsetY, e) => onBannerPanStart(p.itemId, startOffsetX, startOffsetY, e)
              : undefined}
            onPricePanStart={onPricePanStart
              ? (startOffsetY, e) => onPricePanStart(p.itemId, startOffsetY, e)
              : undefined}
            onEditBanner={onEditBannerDays && p.itemId
              ? () => onEditBannerDays(p.itemId)
              : undefined}
            onElementSelect={onElementSelect && p.itemId
              ? (element) => onElementSelect(p.itemId, element)
              : undefined}
            onContextMenu={onCardContextMenu ? () => onCardContextMenu(p.itemId) : undefined}
            selectedEl={activeSel != null && activeSel.kind === 'el' && activeSel.itemId === p.itemId ? activeSel.element : null}
            onSetSelectedEl={(el) => setActiveSel(el != null ? { itemId: p.itemId, kind: 'el', element: el } : null)}
            selectedSubIdx={activeSel != null && activeSel.kind === 'sub' && activeSel.itemId === p.itemId ? activeSel.subIdx : null}
            onSelectSubIdx={(idx) => setActiveSel(idx != null ? { itemId: p.itemId, kind: 'sub', subIdx: idx } : null)}
            rerunningCutoutPath={rerunningCutoutMap?.get(p.itemId) ?? null}
            activeReplacementJobs={(replacementJobs ?? []).filter(j => j.itemId === p.itemId && j.status === "processing")}
            onCancelReplacementJob={onCancelReplacementJob}
            onPanelImageDrop={onPanelImageDrop}
          />
        );
      })}
    </>
  );
}
