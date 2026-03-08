// PATH: apps/desktop/src/renderer/editor/RenderFlyerPlacements.tsx
//
// PURE TEXT RENDERING - NO PNG LABELS
// Titles use Maven Pro, Prices use Trade Winds

import React, { useState, useCallback, useRef, useLayoutEffect } from "react";

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
  };
};

const FRAME_CORNERS: Array<['tl' | 'tr' | 'bl' | 'br', React.CSSProperties]> = [
  ['tl', { top: 2, left: 2, cursor: 'nw-resize' }],
  ['tr', { top: 2, right: 2, cursor: 'ne-resize' }],
  ['bl', { bottom: 2, left: 2, cursor: 'sw-resize' }],
  ['br', { bottom: 2, right: 2, cursor: 'se-resize' }],
];

// Apple-style rotation dial — frosted glass circle, progress arc, system blue knob.
// visible=true springs in; visible=false fades/shrinks out.
function RotationDial({
  bL, bT, bW, bH, rotation, visible, isDragging, onRotateDragStart,
}: {
  bL: number; bT: number; bW: number; bH: number;
  rotation: number;
  visible: boolean;
  isDragging?: boolean;
  onRotateDragStart: (startRotation: number, centerX: number, centerY: number, e: React.MouseEvent) => void;
}) {
  const R = 52;           // dial radius
  const TRACK = R - 14;   // arc / track radius
  const TIP_R = 10;       // knob radius
  const PAD = TIP_R + 4;  // space around dial so knob isn't clipped
  const SIZE = (R + PAD) * 2;
  const O = SIZE / 2;     // SVG / container center

  // 0° = 12 o'clock; clockwise positive — matches CSS rotate()
  const rad = (rotation - 90) * Math.PI / 180;
  const tx = TRACK * Math.cos(rad);
  const ty = TRACK * Math.sin(rad);

  // Progress arc: sweep from 12 o'clock to current angle
  const norm = ((rotation % 360) + 360) % 360;
  const arcEndX = TRACK * Math.cos((norm - 90) * Math.PI / 180);
  const arcEndY = TRACK * Math.sin((norm - 90) * Math.PI / 180);
  const largeArc = norm > 180 ? 1 : 0;
  const showArc = norm > 0.5 && norm < 359.5;
  const showFullCircle = norm >= 359.5;

  // Image center in card-local coordinates
  const cx = bL + bW / 2;
  const cy = bT + bH / 2;
  const angleDisplay = Math.round(norm);

  return (
    <div style={{
      position: 'absolute',
      left: cx - O,
      top: cy - O,
      width: SIZE,
      height: SIZE,
      zIndex: 100,
      pointerEvents: 'none',
      opacity: visible ? 1 : 0,
      transform: visible ? 'scale(1)' : 'scale(0.75)',
      transformOrigin: 'center center',
      // Spring curve on enter, plain ease on exit
      transition: visible
        ? 'opacity 0.18s ease, transform 0.26s cubic-bezier(0.34, 1.56, 0.64, 1)'
        : 'opacity 0.16s ease, transform 0.16s ease',
    }}>
      {/* Frosted glass background — must be HTML div for backdrop-filter to work */}
      <div style={{
        position: 'absolute',
        left: PAD, top: PAD,
        width: R * 2, height: R * 2,
        borderRadius: '50%',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        background: 'rgba(255,255,255,0.78)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.13), 0 1px 3px rgba(0,0,0,0.08), inset 0 0.5px 0 rgba(255,255,255,0.95)',
        border: '0.5px solid rgba(200,200,200,0.35)',
      }} />
      {/* SVG: track ring, progress arc, pivot, knob, label */}
      <svg width={SIZE} height={SIZE} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {/* Subtle track ring */}
        <circle cx={O} cy={O} r={TRACK}
          fill="none" stroke="rgba(0,0,0,0.09)" strokeWidth="2"
          style={{ pointerEvents: 'none' }}
        />
        {/* North marker — always visible as 0° reference */}
        <line x1={O} y1={O - TRACK - 5} x2={O} y2={O - TRACK + 5}
          stroke="rgba(0,0,0,0.15)" strokeWidth="1.5" strokeLinecap="round"
          style={{ pointerEvents: 'none' }}
        />
        {/* Progress arc — Apple blue sweep */}
        {showFullCircle && (
          <circle cx={O} cy={O} r={TRACK}
            fill="none" stroke="#007AFF" strokeWidth="2.5"
            style={{ pointerEvents: 'none' }}
          />
        )}
        {showArc && (
          <path
            d={`M ${O} ${O - TRACK} A ${TRACK} ${TRACK} 0 ${largeArc} 1 ${O + arcEndX} ${O + arcEndY}`}
            fill="none" stroke="#007AFF" strokeWidth="2.5" strokeLinecap="round"
            style={{ pointerEvents: 'none' }}
          />
        )}
        {/* Center pivot dot */}
        <circle cx={O} cy={O} r={2.5}
          fill="rgba(0,0,0,0.18)" style={{ pointerEvents: 'none' }}
        />
        {/* Draggable knob — THE only interactive element */}
        <circle
          cx={O + tx} cy={O + ty} r={TIP_R}
          fill="#007AFF"
          style={{
            pointerEvents: visible ? 'all' : 'none',
            cursor: isDragging ? 'grabbing' : 'grab',
            filter: 'drop-shadow(0 2px 6px rgba(0,122,255,0.5))',
          }}
          onMouseDown={(e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const svgEl = (e.currentTarget as SVGElement).closest('svg')!;
            const rect = svgEl.getBoundingClientRect();
            onRotateDragStart(rotation, rect.left + rect.width / 2, rect.top + rect.height / 2, e);
          }}
        />
        {/* White center dot on knob */}
        <circle cx={O + tx} cy={O + ty} r={3.5}
          fill="white" style={{ pointerEvents: 'none' }}
        />
        {/* Angle readout — SF Pro style, centered in dial */}
        <text
          x={O} y={O}
          textAnchor="middle" dominantBaseline="middle"
          fontSize="13" fontWeight="500"
          fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
          fill="rgba(0,0,0,0.5)"
          style={{ userSelect: 'none', pointerEvents: 'none' } as React.CSSProperties}
        >
          {angleDisplay}°
        </text>
      </svg>
    </div>
  );
}

function PlacementCard({
  p, item, label, editMode, activeScaleDrag, onElementDragStart, onRotateDragStart, onEditTitle, onEditPrice,
  onSubImageScaleDragStart, onSubImageRotateDragStart, onDeleteSubImage,
  onImagePanStart, onSubImagePanStart, onOrientationChange, onCropDragStart,
}: {
  p: any;
  item: any;
  label: DiscountLabel | null;
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
}) {
  const [imgInfo, setImgInfo] = useState<{
    natW: number; natH: number;
    bboxX: number; bboxY: number; bboxW: number; bboxH: number;
  } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [rotatingActive, setRotatingActive] = useState(false);
  // Suppresses spurious click-to-edit after a corner-handle drag ends inside the text div.
  const suppressClickRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [titleDrag, setTitleDrag] = useState<{
    active: boolean;
    hoveredZone: 'vertical' | 'horizontal' | 'top' | null;
  } | null>(null);

  // Which sub-image is selected in edit mode (for per-image controls)
  const [selectedSubIdx, setSelectedSubIdx] = useState<number | null>(null);

  // For n=3 multi-image: randomly choose diagonal vs 2+1 grid (decided once per mount)
  const diagonalRef = useRef<boolean>(Math.random() < 0.5);

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
                   bboxX: 0, bboxY: 0, bboxW: el.naturalWidth, bboxH: el.naturalHeight });
      return;
    }

    let top = -1, bottom = -1, left = SCAN, right = -1;
    for (let y = 0; y < SCAN; y++) {
      for (let x = 0; x < SCAN; x++) {
        if (data[(y * SCAN + x) * 4 + 3] > 0) {
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
            if (topData[(y * SCAN + x) * 4 + 3] > 1) { bboxY = y; found = true; break; }
          }
          if (found) break;
        }
      } catch { /* keep rough estimate */ }
    }

    const bboxX = top === -1 ? 0 : Math.round(left / SCAN * nw);
    const botNat = top === -1 ? nh : Math.round(bottom / SCAN * nh);
    const bboxW = top === -1 ? nw : Math.round((right - left + 1) / SCAN * nw);
    const bboxH = top === -1 ? nh : botNat - bboxY + 1;
    setImgInfo({ natW: nw, natH: nh, bboxX, bboxY, bboxW, bboxH });
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
    if (!editMode || !onOrientationChange) return;
    e.stopPropagation();
    e.preventDefault();
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

  // ── source resolution ──
  const isPendingFlavors = item?.result?.pendingFlavorSelection === true;
  const rawPaths = item?.result?.cutoutPaths;
  // When pending, show all flavors dimmed. After selection, show only chosen ones.
  const hasMultiImages = !isPendingFlavors && Array.isArray(rawPaths) && rawPaths.length > 1;
  const rawSrc =
    item?.image?.src ??
    item?.cutoutPath ??
    item?.result?.cutoutPath ??
    (Array.isArray(rawPaths) && rawPaths.length > 0 ? rawPaths[0] : null) ??
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
  const cropL = (p.cropLeft  ?? 0) as number;
  const cropR = (p.cropRight ?? 0) as number;
  const cropT = (p.cropTop   ?? 0) as number;
  const cropB = (p.cropBottom ?? 0) as number;
  const hasCrop = cropL > 0 || cropR > 0 || cropT > 0 || cropB > 0;

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
  const priceDecSize  = Math.round(priceMainSize * 0.50);
  const priceDecTop   = -Math.round(priceMainSize * 0.20);
  const priceQtySize  = Math.round(priceMainSize * 0.55);
  const priceUnitSize = Math.round(priceMainSize * 0.12);

  const availW = p.width - SIDE_PAD * 2;
  const availH = p.height - topPad - LABEL_ZONE_H;
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
    : imgInfo && imgInfo.bboxH > 0
      ? Math.min(cellH * imgInfo.bboxW / imgInfo.bboxH, maxCellW)
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

  const renderImg = (src: string, idx?: number) => {
    const isFirst = idx === undefined || idx === 0;
    const isMulti = idx !== undefined;
    const subOverride = isMulti ? (item?.result?.subImageOverrides?.[idx] ?? {}) : {};
    const subScale = subOverride.scale ?? 1;
    const subRotation = subOverride.rotation ?? 0;
    const subOffsetX = isMulti ? (subOverride.x ?? 0) : imgOffsetX;
    const subOffsetY = isMulti ? (subOverride.y ?? 0) : imgOffsetY;
    const totalRotation = imgRotation + subRotation;
    const transform = `translate(${subOffsetX}px, ${subOffsetY}px) rotate(${totalRotation}deg) scale(${subScale})`;

    // Selection UI lives INSIDE the transformed wrapper so it tracks the image exactly
    const isSelected = isMulti && editMode && selectedSubIdx === idx;
    const handleMouseDown = isMulti && editMode
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          if (selectedSubIdx === idx) {
            onSubImagePanStart?.(idx, subOverride.x ?? 0, subOverride.y ?? 0, e);
          } else {
            setSelectedSubIdx(idx);
          }
        }
      : undefined;
    const handleClick = isMulti && editMode ? (e: React.MouseEvent) => e.stopPropagation() : undefined;

    const selectionUI = isSelected ? (
      <>
        <div style={{ position: 'absolute', inset: -2, border: '2px dashed #F59E0B', borderRadius: 2, pointerEvents: 'none' }} />
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
          }}
        >
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', clipPath: !isMulti && hasCrop ? `inset(${cropT}px ${cropR}px ${cropB}px ${cropL}px)` : undefined }}>
            <img style={imgRender.imgAbsStyle} src={src} alt="" />
          </div>
          {selectionUI}
        </div>
      );
    }
    return (
      <div
        key={idx}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={{ position: 'relative', display: 'inline-block', transform, transformOrigin: 'center center', cursor: isMulti && editMode ? (isSelected ? 'grab' : 'pointer') : undefined }}
      >
        <img style={fallbackImgStyle} src={src} alt="" onLoad={isFirst ? onFirstImgLoad : undefined} />
        {selectionUI}
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
                  <div className="ufm-title-main" style={{ fontSize: titleMainSize }}>{label!.title.en.toUpperCase()}</div>
                )}
                {pp && (
                  <div className="ufm-price" style={{ alignItems: "baseline", paddingRight: 4 }}>
                    {pp.type === "MULTI" && <span className="ufm-price-qty" style={{ fontSize: priceQtySize }}>{pp.quantity}/</span>}
                    <span className="ufm-price-main" style={{ fontSize: priceMainSize }}>{pp.integer}</span>
                    {pp.decimal && <span className="ufm-price-decimal" style={{ fontSize: priceDecSize, top: priceDecTop }}>{pp.decimal}</span>}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // Nothing to render at all
  if (!imgSrc && !imgSrcs?.length && !hasLabel) return null;

  // ── Low-confidence detection ──
  const matchSource = item?.result?.matchSource as string | undefined;
  const lowConf     = item?.result?.lowConfidence === true;
  const badgeColor  = matchSource === "none" ? "#e53e3e"
    : matchSource === "serper" ? "#3182ce"
    : "#d97706"; // amber = weak DB match
  const badgeLabel  = matchSource === "none" ? "NO MATCH"
    : matchSource === "serper" ? "GOOGLE"
    : "CHECK";
  const outlineColor = matchSource === "none" ? "#e53e3e"
    : matchSource === "serper" ? "#3182ce"
    : "#d97706";

  // ── Horizontal layout ──
  if (p.orientation === 'horizontal') {
    return (
      <div
        ref={cardRef}
        style={{
          position: "absolute", left: p.x, top: p.y,
          width: p.width, height: p.height, overflow: "visible",
          outline: lowConf ? `2px solid ${outlineColor}` : "none",
          outlineOffset: "-2px",
        }}
        onMouseEnter={editMode ? () => setHovered(true) : undefined}
        onMouseLeave={editMode ? () => setHovered(false) : undefined}
        onClick={editMode && selectedSubIdx !== null ? () => setSelectedSubIdx(null) : undefined}
      >
        {/* Content wrapper — crop applied only to image div below */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {lowConf && (
          <div style={{ position: "absolute", top: 4, right: 4, background: badgeColor, color: "white", borderRadius: 4, padding: "2px 6px", fontSize: 10, fontWeight: 700, zIndex: 20, pointerEvents: "none", letterSpacing: "0.05em" }}>
            {badgeLabel}
          </div>
        )}
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
          {/* Left 55% — image; crop applied here only */}
          <div style={{ width: '55%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {imgSrc ? renderImg(imgSrc) : null}
          </div>
          {/* Right 45% — title + price */}
          <div style={{ width: '45%', position: 'relative', overflow: 'hidden' }}>
            {hasLabel && (label.title.en || label.title.zh) && (
              <div
                style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'flex-end', padding: SIDE_PAD,
                  flexDirection: 'column', justifyContent: 'center',
                  zIndex: 10, wordBreak: 'break-word', textAlign: 'right',
                  opacity: (activeScaleDrag?.itemId === p.itemId && activeScaleDrag?.type === 'title') ? 0.5 : 1,
                  cursor: editMode ? 'pointer' : undefined,
                }}
                onMouseDown={handleTitleMouseDown}
                onClick={editMode ? (e) => { if (suppressClickRef.current) return; onEditTitle?.(); } : undefined}
              >
                {editMode && onElementDragStart && hovered && (
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
                <div className="ufm-title-main" style={{ fontSize: titleMainSize }}>
                  {label.title.en.toUpperCase()}
                </div>
                {(label.title.size || label.title.regularPrice) && (
                  <div className="ufm-title-meta" style={{ fontSize: titleMetaSize }}>
                    {label.title.size}
                    {label.title.regularPrice && <> REG: {label.title.regularPrice}</>}
                  </div>
                )}
              </div>
            )}
            {hasLabel && priceParts && (
              <div
                style={{
                  position: 'absolute', bottom: SIDE_PAD, right: SIDE_PAD,
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
                  zIndex: 10,
                  opacity: (activeScaleDrag?.itemId === p.itemId && activeScaleDrag?.type === 'price') ? 0.5 : 1,
                  cursor: editMode ? 'pointer' : undefined,
                }}
                onClick={editMode ? (e) => { if (suppressClickRef.current) return; onEditPrice?.(); } : undefined}
              >
                {editMode && onElementDragStart && hovered && (
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
                    <span className="ufm-price-qty" style={{ fontSize: priceQtySize }}>{priceParts.quantity}/</span>
                  )}
                  <span className="ufm-price-main" style={{ fontSize: priceMainSize }}>{priceParts.integer}</span>
                  {priceParts.decimal && (
                    <span className="ufm-price-decimal" style={{ fontSize: priceDecSize, top: priceDecTop }}>{priceParts.decimal}</span>
                  )}
                  {priceParts.type === "SINGLE" && priceParts.unit && (
                    <span className="ufm-price-unit" style={{ fontSize: priceUnitSize }}>/{priceParts.unit.toUpperCase()}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>{/* end content clip wrapper */}
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
          outline: lowConf ? `2px solid ${outlineColor}` : "none",
          outlineOffset: "-2px",
        }}
        onMouseEnter={editMode ? () => setHovered(true) : undefined}
        onMouseLeave={editMode ? () => setHovered(false) : undefined}
        onClick={editMode && selectedSubIdx !== null ? () => setSelectedSubIdx(null) : undefined}
      >
        {/* Content wrapper — crop applied only to image div below */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {lowConf && (
          <div style={{ position: "absolute", top: 4, right: 4, background: badgeColor, color: "white", borderRadius: 4, padding: "2px 6px", fontSize: 10, fontWeight: 700, zIndex: 20, pointerEvents: "none", letterSpacing: "0.05em" }}>
            {badgeLabel}
          </div>
        )}
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
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: SIDE_PAD, zIndex: 10, wordBreak: 'break-word', textAlign: 'center',
                opacity: (activeScaleDrag?.itemId === p.itemId && activeScaleDrag?.type === 'title') ? 0.5 : 1,
                cursor: editMode ? 'pointer' : undefined,
              }}
              onMouseDown={handleTitleMouseDown}
              onClick={editMode ? (e) => { if (suppressClickRef.current) return; onEditTitle?.(); } : undefined}
            >
              {editMode && onElementDragStart && hovered && (
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
              <div className="ufm-title-main" style={{ fontSize: titleMainSize }}>
                {label.title.en.toUpperCase()}
              </div>
              {(label.title.size || label.title.regularPrice) && (
                <div className="ufm-title-meta" style={{ fontSize: titleMetaSize }}>
                  {label.title.size}
                  {label.title.regularPrice && <> REG: {label.title.regularPrice}</>}
                </div>
              )}
            </div>
          )}
          {/* Image: centered in remaining flex space; crop applied here only */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: 0 }}>
            {imgSrc ? renderImg(imgSrc) : null}
          </div>
        </div>
        {/* Price: absolute bottom-right */}
        {hasLabel && priceParts && (
          <div
            style={{
              position: 'absolute', bottom: SIDE_PAD, right: SIDE_PAD,
              display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
              zIndex: 10,
              opacity: (activeScaleDrag?.itemId === p.itemId && activeScaleDrag?.type === 'price') ? 0.5 : 1,
              cursor: editMode ? 'pointer' : undefined,
            }}
            onClick={editMode ? (e) => { if (suppressClickRef.current) return; onEditPrice?.(); } : undefined}
          >
            {editMode && onElementDragStart && hovered && (
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
                <span className="ufm-price-qty" style={{ fontSize: priceQtySize }}>{priceParts.quantity}/</span>
              )}
              <span className="ufm-price-main" style={{ fontSize: priceMainSize }}>{priceParts.integer}</span>
              {priceParts.decimal && (
                <span className="ufm-price-decimal" style={{ fontSize: priceDecSize, top: priceDecTop }}>{priceParts.decimal}</span>
              )}
              {priceParts.type === "SINGLE" && priceParts.unit && (
                <span className="ufm-price-unit" style={{ fontSize: priceUnitSize }}>/{priceParts.unit.toUpperCase()}</span>
              )}
            </div>
          </div>
        )}
        </div>{/* end content clip wrapper */}
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
        outline: lowConf ? `2px solid ${outlineColor}` : "none",
        outlineOffset: "-2px",
      }}
      onMouseEnter={editMode ? () => setHovered(true) : undefined}
      onMouseLeave={editMode ? () => setHovered(false) : undefined}
      onClick={editMode && selectedSubIdx !== null ? () => setSelectedSubIdx(null) : undefined}
    >
      {/* Content wrapper — crop is applied only to image zone below */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* Low-confidence badge */}
      {lowConf && (
        <div style={{
          position: "absolute", top: 4, right: 4,
          background: badgeColor, color: "white",
          borderRadius: 4, padding: "2px 6px",
          fontSize: 10, fontWeight: 700, zIndex: 20,
          pointerEvents: "none", letterSpacing: "0.05em",
        }}>
          {badgeLabel}
        </div>
      )}
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
        style={{
        position: "absolute",
        top: topPad, left: SIDE_PAD,
        width: availW, height: availH,
        overflow: "hidden",
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
          : imgSrc ? renderImg(imgSrc) : null}
      </div>

      {/* Title — absolute bottom-left, no clipping */}
      {hasLabel && (label.title.en || label.title.zh) && (
        <div ref={titleRef} style={{
          position: "absolute",
          bottom: SIDE_PAD, left: SIDE_PAD,
          maxWidth: "50%",
          display: "flex", flexDirection: "column",
          justifyContent: "flex-end",
          zIndex: 10,
          wordBreak: "break-word",
          opacity: (activeScaleDrag?.itemId === p.itemId && activeScaleDrag?.type === 'title') ? 0.5 : 1,
          cursor: editMode ? "pointer" : undefined,
        }}
        onMouseDown={handleTitleMouseDown}
        onClick={editMode ? (e) => { if (suppressClickRef.current) return; onEditTitle?.(); } : undefined}
        >
          {editMode && onElementDragStart && hovered && (
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
          <div className="ufm-title-main" style={{ fontSize: titleMainSize }}>
            {label.title.en.toUpperCase()}
          </div>
          {(label.title.size || label.title.regularPrice) && (
            <div className="ufm-title-meta" style={{ fontSize: titleMetaSize }}>
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
          bottom: SIDE_PAD, right: SIDE_PAD,
          display: "flex",
          alignItems: "flex-end", justifyContent: "flex-end",
          zIndex: 10,
          opacity: (activeScaleDrag?.itemId === p.itemId && activeScaleDrag?.type === 'price') ? 0.5 : 1,
          cursor: editMode ? "pointer" : undefined,
        }}
        onClick={editMode ? (e) => { if (suppressClickRef.current) return; onEditPrice?.(); } : undefined}
        >
          {editMode && onElementDragStart && hovered && (
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
              <span className="ufm-price-qty" style={{ fontSize: priceQtySize }}>{priceParts.quantity}/</span>
            )}
            <span className="ufm-price-main" style={{ fontSize: priceMainSize }}>{priceParts.integer}</span>
            {priceParts.decimal && (
              <span className="ufm-price-decimal" style={{ fontSize: priceDecSize, top: priceDecTop }}>{priceParts.decimal}</span>
            )}
            {priceParts.type === "SINGLE" && priceParts.unit && (
              <span className="ufm-price-unit" style={{ fontSize: priceUnitSize }}>/{priceParts.unit.toUpperCase()}</span>
            )}
          </div>
        </div>
      )}

      </div>{/* end content clip wrapper */}

      {/* Image element handles — single dashed border at image frame; crop in image-local coords, border shrinks as user drags */}
      {editMode && onElementDragStart && !(displaySrcs && displaySrcs.length > 1) && hovered && (() => {
        const useSingleBounds = imgRender != null && !hasMultiImages;
        const bW = useSingleBounds ? imgRender!.wrapperStyle.width  : availW;
        const bH = useSingleBounds ? imgRender!.wrapperStyle.height : availH;
        const bL = (useSingleBounds ? SIDE_PAD + Math.round((availW - (bW as number)) / 2) : SIDE_PAD) + imgOffsetX;
        const bT = topPad + imgOffsetY;
        const EDGE = 4;
        const cropBounds = { width: bW as number, height: bH as number };
        const handleCrop = (side: 'left' | 'right' | 'top' | 'bottom', startValue: number) => (e: React.MouseEvent) => {
          e.stopPropagation();
          onCropDragStart?.(side, startValue, e, cropBounds);
        };
        const borderLeft = bL + cropL;
        const borderTop = bT + cropT;
        const borderWidth = Math.max(1, (bW as number) - cropL - cropR);
        const borderHeight = Math.max(1, (bH as number) - cropT - cropB);
        return (
          <div
            style={{
              position: 'absolute', left: borderLeft, top: borderTop, width: borderWidth, height: borderHeight,
              zIndex: 95,
              transform: imgRotation !== 0 ? `rotate(${imgRotation}deg)` : undefined,
              transformOrigin: 'center center',
              pointerEvents: 'none',
            }}
          >
            {/* 4 edges of dashed border — same border shrinks as user drags, no extra component */}
            {onCropDragStart && (
              <>
                <div style={{ position: 'absolute', left: 0, top: 0, width: EDGE, height: '100%', borderLeft: '2px dashed #4C6EF5', cursor: 'ew-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('left', cropL)} />
                <div style={{ position: 'absolute', right: 0, top: 0, width: EDGE, height: '100%', borderRight: '2px dashed #4C6EF5', cursor: 'ew-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('right', cropR)} />
                <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: EDGE, borderTop: '2px dashed #4C6EF5', cursor: 'ns-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('top', cropT)} />
                <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: EDGE, borderBottom: '2px dashed #4C6EF5', cursor: 'ns-resize', zIndex: 90, pointerEvents: 'auto', boxSizing: 'border-box' }} onMouseDown={handleCrop('bottom', cropB)} />
              </>
            )}
            {(['tl','tr','bl','br'] as const).map(corner => (
              <div
                key={corner}
                onMouseDown={(e) => handleCornerMouseDown('image', corner, imgScale, e)}
                style={{
                  position: 'absolute',
                  left: corner.includes('l') ? -5 : undefined,
                  right: corner.includes('r') ? -5 : undefined,
                  top: corner.includes('t') ? -5 : undefined,
                  bottom: corner.includes('b') ? -5 : undefined,
                  width: 10, height: 10,
                  background: '#fff', border: '2px solid #4C6EF5', borderRadius: 2, zIndex: 91,
                  cursor: corner === 'tl' || corner === 'br' ? 'nw-resize' : 'ne-resize',
                  pointerEvents: 'auto',
                }}
              />
            ))}
          </div>
        );
      })()}

      {/* Rotation dial — outside clip wrapper so it can extend past card bounds in edit mode */}
      {editMode && onRotateDragStart && !hasMultiImages && (() => {
        const useSingleBounds = imgRender != null && !hasMultiImages;
        const bW = (useSingleBounds ? imgRender!.wrapperStyle.width  : availW) as number;
        const bH = (useSingleBounds ? imgRender!.wrapperStyle.height : availH) as number;
        const bL = (useSingleBounds ? SIDE_PAD + Math.round((availW - bW) / 2) : SIDE_PAD) + imgOffsetX;
        const bT = topPad + imgOffsetY;
        const wrappedRotateDragStart = (startRotation: number, centerX: number, centerY: number, e: React.MouseEvent) => {
          setRotatingActive(true);
          const onUp = () => { setRotatingActive(false); window.removeEventListener('mouseup', onUp); };
          window.addEventListener('mouseup', onUp);
          onRotateDragStart(startRotation, centerX, centerY, e);
        };
        return (
          <RotationDial
            bL={bL} bT={bT} bW={bW} bH={bH}
            rotation={imgRotation}
            visible={hovered || rotatingActive}
            isDragging={rotatingActive}
            onRotateDragStart={wrappedRotateDragStart}
          />
        );
      })()}

    </div>
  );
}

export default function RenderFlyerPlacements({
  items,
  placements,
  discountLabels,
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
}: {
  items: any[];
  placements: any[];
  discountLabels?: DiscountLabel[];
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
}) {
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
    const saleFromDiscount = (item?.result?.discount as any)?.price ?? (item?.result?.discount as any)?.display;
    const priceDisplay =
      saleFromDiscount != null && String(saleFromDiscount).trim() !== ""
        ? String(saleFromDiscount).trim().startsWith("$")
          ? String(saleFromDiscount).trim()
          : `$${String(saleFromDiscount).trim()}`
        : (item?.result?.llmResult?.items?.[0] as any)?.sale_price != null
          ? `$${String((item.result.llmResult?.items?.[0] as any)?.sale_price ?? "")}`
          : "";
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
          />
        );
      })}
    </>
  );
}
