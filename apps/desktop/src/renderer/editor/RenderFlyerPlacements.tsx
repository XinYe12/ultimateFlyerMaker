// PATH: apps/desktop/src/renderer/editor/RenderFlyerPlacements.tsx
//
// PURE TEXT RENDERING - NO PNG LABELS
// Titles use Maven Pro, Prices use Trade Winds

const HORIZONTAL_ASPECT = 1.5;

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

        const rawSrc =
          item?.image?.src ??
          item?.cutoutPath ??
          item?.result?.cutoutPath ??
          null;
        if (!rawSrc) return null;

        const imgSrc =
          rawSrc.startsWith("http") || rawSrc.startsWith("file://")
            ? rawSrc
            : `file://${rawSrc}`;

        const label = getLabelForItem(item, p.itemId);
        const hasLabel = label != null;

        // ── no labels → original full-card image ──
        if (!hasLabel) {
          return (
            <div
              key={p.itemId}
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
              {/* top 20%: spacing */}
              <div style={{ flex: 1, minHeight: 0 }} />

              {/* remaining 80%: product image */}
              <div style={{ flex: 4, minHeight: 0, padding: "0 10px 10px 10px" }}>
                <img
                  src={imgSrc}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
            </div>
          );
        }

        const isHorizontal = p.width / p.height > HORIZONTAL_ASPECT;
        const priceParts = label.price.display ? parsePriceDisplay(label.price.display) : null;

        // ── HORIZONTAL: top space (20%), then [image left 75% | labels right 25%] (80%) ──
        if (isHorizontal) {
          return (
            <div
              key={p.itemId}
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                width: p.width,
                height: p.height,
                display: "flex",
                flexDirection: "column",
                overflow: "visible",
              }}
            >
              {/* top 20%: spacing */}
              <div style={{ flex: 1, minHeight: 0 }} />

              {/* bottom 80%: product left, labels right */}
              <div style={{ flex: 4, minHeight: 0, display: "flex", flexDirection: "row", overflow: "visible" }}>
                {/* left 75%: product image */}
                <div style={{ flex: 75, minWidth: 0, padding: "0 6px 10px 10px" }}>
                  <img
                    src={imgSrc}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>

                {/* right 25%: title and price stacked */}
                <div
                  style={{
                    flex: 25,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    padding: "0 6px 6px 0",
                    gap: 4,
                  }}
                >
                  {/* Title */}
                  {(label.title.en || label.title.zh) && (
                    <div className="ufm-title" style={{ flex: "0 0 auto" }}>
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

                  {/* Price */}
                  {priceParts && (
                    <div className="ufm-price" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
              </div>
            </div>
          );
        }

        // ── VERTICAL: top space (20%), product image (60%), labels (20%) ──
        return (
          <div
            key={p.itemId}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              width: p.width,
              height: p.height,
              display: "flex",
              flexDirection: "column",
              overflow: "visible",
            }}
          >
            {/* top 20%: spacing */}
            <div style={{ flex: 1, minHeight: 0 }} />

            {/* middle 60%: product image */}
            <div style={{ flex: 3, minHeight: 0, padding: "0 10px" }}>
              <img
                src={imgSrc}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>

            {/* bottom 20%: title + price in a row; price centered in remaining space */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-end",
                padding: "4px",
                gap: 6,
              }}
            >
              {/* Title - fixed width so price can sit more toward center */}
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

              {/* Price - fills rest, centered so price sits more toward card center */}
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
          </div>
        );
      })}
    </>
  );
}
