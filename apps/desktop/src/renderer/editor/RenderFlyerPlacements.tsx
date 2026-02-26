// PATH: apps/desktop/src/renderer/editor/RenderFlyerPlacements.tsx
//
// PURE TEXT RENDERING - NO PNG LABELS
// Titles use Maven Pro, Prices use Trade Winds

import React, { useState, useCallback } from "react";

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

function PlacementCard({ p, item, label }: { p: any; item: any; label: DiscountLabel | null }) {
  const [imgInfo, setImgInfo] = useState<{
    natW: number; natH: number;
    bboxX: number; bboxY: number; bboxW: number; bboxH: number;
  } | null>(null);

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
  // Image zone: 5% top padding from card top, bottom limit = bottom 25% (label zone).
  // No-label cards use no label zone, so image fills 5% → 100%.
  const SIDE_PAD = 8;
  const topPad = Math.round(p.height * 0.05);
  const LABEL_ZONE_H = hasLabel ? Math.round(p.height * 0.25) : 0;
  const availW = p.width - SIDE_PAD * 2;
  const availH = p.height - topPad - LABEL_ZONE_H;
  const n = displaySrcs ? displaySrcs.length : 1;
  const GAP = 4;
  const cellW = n > 1 ? (availW - (n - 1) * GAP) / n : availW;
  const cellH = availH;

  // Derived render info — null until image loads and bbox is scanned.
  const imgRender = imgInfo ? (() => {
    const { natW, natH, bboxX, bboxY, bboxW, bboxH } = imgInfo;
    const { width: dispW, height: dispH } = fitContain(bboxW, bboxH, cellW, cellH);
    const scale = dispW / bboxW;
    return {
      wrapperStyle: {
        position: "relative" as const,
        width: dispW, height: dispH,
        overflow: "hidden" as const,
        flexShrink: 0,
      },
      imgAbsStyle: {
        position: "absolute" as const,
        width: Math.round(natW * scale),
        height: Math.round(natH * scale),
        left: Math.round(-bboxX * scale),
        top: Math.round(-bboxY * scale),
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
              <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", padding: "4px", gap: 6, width: "100%" }}>
                {(label!.title.en || label!.title.zh) && (
                  <div className="ufm-title" style={{ flex: "0 0 32%", minWidth: 0 }}>
                    <div className="ufm-title-main">{label!.title.en.toUpperCase()}</div>
                  </div>
                )}
                {pp && (
                  <div className="ufm-price" style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "baseline", justifyContent: "center" }}>
                    {pp.type === "MULTI" && <span className="ufm-price-qty">{pp.quantity}/</span>}
                    <span className="ufm-price-main">{pp.integer}</span>
                    {pp.decimal && <span className="ufm-price-decimal">{pp.decimal}</span>}
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

  // ── Unified layout: image top-centered, labels pinned to bottom ──
  return (
    <div
      style={{
        position: "absolute",
        left: p.x,
        top: p.y,
        width: p.width,
        height: p.height,
        overflow: "hidden",
      }}
    >
      {/* Image zone: starts at 5% from top, fills down to label zone boundary */}
      <div
        style={{
          position: "absolute",
          top: topPad,
          left: SIDE_PAD,
          width: availW,
          height: availH,
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: GAP,
          overflow: "hidden",
        }}
      >
        {displaySrcs && displaySrcs.length > 1
          ? displaySrcs.map((src, idx) => renderImg(src, idx))
          : imgSrc ? renderImg(imgSrc) : null}
      </div>

      {/* Label zone: pinned to bottom, always on top */}
      {hasLabel && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: LABEL_ZONE_H,
            zIndex: 10,
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-end",
            padding: "4px",
            gap: 6,
          }}
        >
          {(label.title.en || label.title.zh) && (
            <div className="ufm-title" style={{ flex: "0 0 32%", minWidth: 0 }}>
              <div className="ufm-title-main">
                {label.title.en.toUpperCase()}
              </div>
              {(label.title.size || label.title.regularPrice) && (
                <div className="ufm-title-meta">
                  {label.title.size}
                  {label.title.regularPrice && (
                    <> REG: {label.title.regularPrice}</>
                  )}
                </div>
              )}
            </div>
          )}
          {priceParts && (
            <div className="ufm-price" style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "baseline", justifyContent: "center" }}>
              {priceParts.type === "MULTI" && (
                <span className="ufm-price-qty">{priceParts.quantity}/</span>
              )}
              <span className="ufm-price-main">{priceParts.integer}</span>
              {priceParts.decimal && (
                <span className="ufm-price-decimal">{priceParts.decimal}</span>
              )}
              {priceParts.type === "SINGLE" && priceParts.unit && (
                <span className="ufm-price-unit">/{priceParts.unit.toUpperCase()}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RenderFlyerPlacements({
  items,
  placements,
  discountLabels,
}: {
  items: any[];
  placements: any[];
  discountLabels?: DiscountLabel[];
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
        return <PlacementCard key={p.itemId} p={p} item={item} label={label} />;
      })}
    </>
  );
}
