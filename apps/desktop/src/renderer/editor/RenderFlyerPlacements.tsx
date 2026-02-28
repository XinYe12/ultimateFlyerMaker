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

function GripDot({
  currentScale,
  style,
  onDragStart,
}: {
  currentScale: number;
  style: React.CSSProperties;
  onDragStart: (e: React.MouseEvent) => void;
}) {
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setActive(true);
    onDragStart(e);
    const handleUp = () => {
      setActive(false);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mouseup', handleUp);
  };

  const fill = Math.min(1, Math.max(0, (currentScale - 0.2) / 2.8));
  const PURPLE = 'rgba(138, 43, 226, ';

  if (active) {
    const BAR_W = 22, BAR_H = 90, RADIUS = 11;
    return (
      <div
        style={{
          position: 'absolute',
          ...style,
          width: BAR_W,
          height: BAR_H,
          borderRadius: RADIUS,
          background: `${PURPLE}0.18)`,
          overflow: 'hidden',
          cursor: 'ns-resize',
          zIndex: 200,
          boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: `${fill * 100}%`,
          background: `${PURPLE}0.85)`,
          borderRadius: RADIUS,
          transition: 'height 0.05s linear',
        }} />
      </div>
    );
  }

  const SIZE = hover ? 14 : 12;
  return (
    <div
      style={{
        position: 'absolute',
        ...style,
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        background: hover ? `${PURPLE}1)` : `${PURPLE}0.8)`,
        cursor: 'ns-resize',
        zIndex: 100,
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        transition: 'width 0.1s, height 0.1s, background 0.1s',
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    />
  );
}

function PlacementCard({
  p, item, label, onElementDragStart,
}: {
  p: any;
  item: any;
  label: DiscountLabel | null;
  onElementDragStart?: (type: 'image' | 'title' | 'price', startScale: number, e: React.MouseEvent) => void;
}) {
  const [imgInfo, setImgInfo] = useState<{
    natW: number; natH: number;
    bboxX: number; bboxY: number; bboxW: number; bboxH: number;
  } | null>(null);

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

  // ── image sizing ──
  const SIDE_PAD = 8;
  const scale = (p.contentScale ?? 1) as number;
  const imgScale  = (p.imageScale  ?? 1) as number;
  const titScale  = (p.titleScale  ?? 1) as number;
  const prcScale  = (p.priceScale  ?? 1) as number;
  const topPad = Math.round(p.height * 0.05 * scale);
  const LABEL_ZONE_H = hasLabel ? Math.round(p.height * 0.25 * scale) : 0;

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
  const { cols, rows } = useDiagonal ? { cols: 1, rows: 1 } : getGridDims(n);
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

  const fallbackImgStyle: React.CSSProperties = {
    width: "100%", maxWidth: cellW, maxHeight: cellH,
    height: "auto", objectFit: "contain" as const, display: "block",
  };

  const renderImg = (src: string, idx?: number) => {
    const isFirst = idx === undefined || idx === 0;
    if (imgRender) {
      return (
        <div key={idx} style={imgRender.wrapperStyle}>
          <img style={imgRender.imgAbsStyle} src={src} alt="" />
        </div>
      );
    }
    return (
      <img
        key={idx}
        style={fallbackImgStyle}
        src={src}
        alt=""
        onLoad={isFirst ? onFirstImgLoad : undefined}
      />
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
              <img key={idx} src={src} alt="" style={{ width: "100%", height: "auto", objectFit: "contain" }} />
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

  // ── Layout: full-width image, title bottom-left, price bottom-right ──
  return (
    <div style={{
      position: "absolute", left: p.x, top: p.y,
      width: p.width, height: p.height, overflow: "hidden",
    }}>
      {/* Image zone — flex rows or diagonal layout */}
      <div style={{
        position: "absolute",
        top: topPad, left: SIDE_PAD,
        width: availW, height: availH,
        overflow: "hidden",
        ...(useDiagonal
          ? { display: "block" }
          : displaySrcs && displaySrcs.length > 1
          ? { display: "flex", flexDirection: "column", gap: GAP }
          : { display: "flex", flexDirection: "row", alignItems: "flex-start", justifyContent: "center" }
        ),
      }}>
        {displaySrcs && displaySrcs.length > 1
          ? (() => {
              if (useDiagonal) {
                const stepX = (availW - cellW) / 2;
                const stepY = (availH - cellH) / 2;
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
              // Flex rows: split displaySrcs into rows, each row is a centered flex row.
              // Orphan images (last row with fewer than cols items) auto-center via justifyContent.
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
        {/* Image resize grip */}
        {onElementDragStart && (
          <GripDot
            currentScale={imgScale}
            style={{ bottom: SIDE_PAD + 2, left: "50%", transform: "translateX(-50%)" }}
            onDragStart={(e) => onElementDragStart('image', imgScale, e)}
          />
        )}
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
        }}>
          <div className="ufm-title-main" style={{ fontSize: titleMainSize }}>
            {label.title.en.toUpperCase()}
          </div>
          {(label.title.size || label.title.regularPrice) && (
            <div className="ufm-title-meta" style={{ fontSize: titleMetaSize }}>
              {label.title.size}
              {label.title.regularPrice && <> REG: {label.title.regularPrice}</>}
            </div>
          )}
          {/* Title resize grip */}
          {onElementDragStart && (
            <GripDot
              currentScale={titScale}
              style={{ right: -20, top: "50%", transform: "translateY(-50%)" }}
              onDragStart={(e) => onElementDragStart('title', titScale, e)}
            />
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
        }}>
          {/* Price resize grip */}
          {onElementDragStart && (
            <GripDot
              currentScale={prcScale}
              style={{ left: -20, top: "50%", transform: "translateY(-50%)" }}
              onDragStart={(e) => onElementDragStart('price', prcScale, e)}
            />
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

    </div>
  );
}

export default function RenderFlyerPlacements({
  items,
  placements,
  discountLabels,
  onElementDragStart,
}: {
  items: any[];
  placements: any[];
  discountLabels?: DiscountLabel[];
  onElementDragStart?: (
    cardId: string,
    type: 'image' | 'title' | 'price',
    startScale: number,
    e: React.MouseEvent
  ) => void;
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
          ? (type: 'image' | 'title' | 'price', startScale: number, e: React.MouseEvent) =>
              onElementDragStart(p.itemId, type, startScale, e)
          : undefined;
        return (
          <PlacementCard
            key={p.itemId}
            p={p}
            item={item}
            label={label}
            onElementDragStart={handleElementDrag}
          />
        );
      })}
    </>
  );
}
