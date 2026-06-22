// apps/desktop/src/renderer/export/FlyerExportRenderer.tsx
// Renders complete multi-page flyer for export

import { useEffect, useState } from "react";
import { FlyerJob, IngestItem } from "../types";
import { FlyerTemplateConfig, CustomBoxDef } from "../editor/loadFlyerTemplateConfig";
import RenderFlyerPlacements from "../editor/RenderFlyerPlacements";
import { layoutFlyer, layoutFlyerSlots } from "../../../../shared/flyer/layout/layoutFlyer";
import { isSlottedDepartment, isCardDepartment } from "../editor/loadFlyerTemplateConfig";
import { layoutCardRows, computeCardRects, CARD_BG } from "../../../../shared/flyer/layout/layoutCardRows";

type Props = {
  templateConfig: FlyerTemplateConfig;
  jobs: FlyerJob[];
  onRenderComplete?: () => void;
};

const PREVIEW_SCALE = 0.5; // Scale for preview (export will use full resolution)

export default function FlyerExportRenderer({
  templateConfig,
  jobs,
  onRenderComplete,
}: Props) {
  const [imageLoadStates, setImageLoadStates] = useState<Record<string, boolean>>({});

  // Mark custom pages without background image as loaded immediately
  useEffect(() => {
    setImageLoadStates((prev) => {
      const next = { ...prev };
      templateConfig.pages.forEach((page) => {
        if ((page as any).boxes && !page.imagePath) {
          next[page.pageId] = true;
        }
      });
      return next;
    });
  }, [templateConfig.pages]);

  const handleImageLoad = (pageId: string) => {
    setImageLoadStates((prev) => ({ ...prev, [pageId]: true }));
  };

  // Notify when all images are loaded (custom pages without imagePath count as loaded)
  useEffect(() => {
    const allLoaded = templateConfig.pages.every((page) => {
      if ((page as any).boxes && !(page as any).imagePath) return true; // custom page, no bg image
      return imageLoadStates[page.pageId];
    });
    if (allLoaded && onRenderComplete) {
      setTimeout(onRenderComplete, 500);
    }
  }, [imageLoadStates, templateConfig.pages, onRenderComplete]);

  return (
    <div
      id="flyer-export-container"
      style={{
        background: "#f5f5f5",
        padding: 0, // Remove padding to preserve exact dimensions
        display: "flex",
        flexDirection: "column",
        gap: 0,
        alignItems: "flex-start",
      }}
    >
      {templateConfig.pages.map((page, pageIndex) => {
        // Render each page with its departments
        return (
          <div
            key={page.pageId}
            className="flyer-page"
            data-page-id={page.pageId}
            style={{
              position: "relative",
              background: (page as any).backgroundColor ?? "#fff",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              width: "1650px",
              marginBottom: pageIndex < templateConfig.pages.length - 1 ? "20px" : "0",
            }}
          >
            {/* Background: template image or custom background image */}
            {page.imagePath ? (
              <img
                src={page.imagePath}
                alt={`Page ${pageIndex + 1}`}
                onLoad={() => handleImageLoad(page.pageId)}
                style={{ display: "block", width: "1650px", height: "auto" }}
              />
            ) : (page as any).boxes ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: (page as any).backgroundImage ? `url(${(page as any).backgroundImage}) center/cover` : "transparent",
                }}
              />
            ) : null}

            {/* Custom overlay boxes */}
            {(page as any).boxes?.length > 0 && (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {((page as any).boxes as CustomBoxDef[])
                  .map((box: CustomBoxDef) => {
                    const clipPath = (box.cropLeft ?? 0) || (box.cropRight ?? 0) || (box.cropTop ?? 0) || (box.cropBottom ?? 0)
                      ? `inset(${box.cropTop ?? 0}px ${box.cropRight ?? 0}px ${box.cropBottom ?? 0}px ${box.cropLeft ?? 0}px)`
                      : undefined;
                    const textContent = box.content?.trim()
                      ? box.content
                      : (box.boxType === "product" || !box.boxType) && box.label?.trim()
                      ? box.label
                      : null;
                    return (
                      <div
                        key={box.id}
                        style={{
                          position: "absolute",
                          left: box.x,
                          top: box.y,
                          width: box.width,
                          height: box.height,
                          background: box.color,
                          boxSizing: "border-box",
                          borderRadius: box.borderRadius ?? 0,
                          border: box.borderWidth ? `${box.borderWidth}px solid ${box.borderColor ?? "#000"}` : undefined,
                          overflow: "hidden",
                          clipPath,
                        }}
                      >
                        {/* Image layer */}
                        {box.imagePath && (
                          <div style={{
                            position: "absolute", inset: 0,
                            background: `url(${box.imagePath}) center/contain no-repeat`,
                          }} />
                        )}
                        {/* Text layer */}
                        {textContent && (
                          <div
                            style={box.textOffsetX != null || box.textOffsetY != null ? {
                              position: "absolute",
                              left: box.textOffsetX ?? 0,
                              top: box.textOffsetY ?? 0,
                              color: box.textColor,
                              fontWeight: 700,
                              fontSize: box.fontSize ?? 24,
                              fontFamily: box.fontFamily || undefined,
                              lineHeight: 1,
                              padding: "6px 10px",
                            } : {
                              position: "absolute", inset: 0,
                              padding: "6px 10px",
                              display: "flex",
                              alignItems: box.textVertical === "middle" ? "center" : box.textVertical === "bottom" ? "flex-end" : "flex-start",
                              justifyContent: box.textAlign === "center" ? "center" : box.textAlign === "right" ? "flex-end" : "flex-start",
                              color: box.textColor,
                              fontWeight: 700,
                              fontSize: box.fontSize ?? 24,
                              fontFamily: box.fontFamily || undefined,
                              lineHeight: 1,
                              overflow: "hidden",
                            }}
                          >
                            {(() => {
                              const hr = box.highlightRange;
                              if (hr && hr.start < hr.end && box.highlightColor) {
                                const before = textContent.slice(0, hr.start);
                                const highlight = textContent.slice(hr.start, hr.end);
                                const after = textContent.slice(hr.end);
                                return (
                                  <span>
                                    {before}
                                    <span style={{ backgroundColor: box.highlightColor }}>{highlight}</span>
                                    {after}
                                  </span>
                                );
                              }
                              return textContent;
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Render each department on this page */}
            {Object.entries(page.departments).map(([deptId, deptDef]) => {
              // Find job for this department (completed or drafting)
              const job = jobs.find(
                (j) => j.department === deptId && (j.status === "completed" || j.status === "drafting")
              );

              if (!job?.result?.processedImages) {
                return (
                  <div
                    key={deptId}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                    }}
                  />
                );
              }

              // Convert job images to IngestItems
              const ingestItems: IngestItem[] = job.result.processedImages
                .filter((img) => img.status === "done" && img.result)
                .map((img) => ({
                  id: img.id,
                  path: img.path,
                  status: "done" as const,
                  result: img.result,
                  slotIndex: img.slotIndex,
                }));

              // Get discount labels
              const discountLabels = job.result.discountLabels || [];

              // ── CARD-BASED DEPARTMENT ──
              if (isCardDepartment(deptDef)) {
                const cardLayout = job.cardLayouts?.[deptId];
                if (!cardLayout || cardLayout.length === 0) return null;

                const cardRegion = deptDef.region;
                const deptArea = (page as any).departmentAreas?.find(
                  (a: { departmentKey: string }) => a.departmentKey === deptId
                );
                const layoutRows = deptArea?.rows ?? deptDef.rows;

                const placements = layoutCardRows({
                  cards: cardLayout,
                  region: cardRegion,
                  rows: layoutRows,
                  pageId: page.pageId,
                  regionId: deptId,
                });

                const cardRects = computeCardRects({
                  cards: cardLayout,
                  region: cardRegion,
                  rows: layoutRows,
                });

                return (
                  <div
                    key={deptId}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                    }}
                  >
                    {/* Grey card backgrounds */}
                    {cardRects.map((rect) => (
                      <div
                        key={`card-bg-${rect.cardId}`}
                        style={{
                          position: "absolute",
                          left: rect.x,
                          top: rect.y,
                          width: rect.width,
                          height: rect.height,
                          background: CARD_BG,
                        }}
                      />
                    ))}

                    {/* Product content */}
                    <RenderFlyerPlacements
                      items={ingestItems}
                      placements={placements}
                      discountLabels={discountLabels}
                    />
                  </div>
                );
              }

              // ── SLOT-BASED DEPARTMENT ──
              if (isSlottedDepartment(deptDef)) {
                // Apply slot overrides from the job (WYSIWYG export)
                const effectiveSlots = deptDef.slots.map((slot: any, i: number) => {
                  const override = job.slotOverrides?.[i];
                  return override ? { ...slot, ...override } : slot;
                });

                // Layout items into slots using effective (overridden) slots
                const placements = layoutFlyerSlots({
                  items: ingestItems.map((item) => ({
                    id: item.id,
                    slotIndex: item.slotIndex,
                  })),
                  pageId: page.pageId,
                  regionId: deptId,
                  slots: effectiveSlots,
                });

                return (
                  <div
                    key={deptId}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                    }}
                  >
                    <RenderFlyerPlacements
                      items={ingestItems}
                      placements={placements}
                      discountLabels={discountLabels}
                    />
                  </div>
                );
              }

              // Non-slotted, non-card department — skip
              return null;
            })}
          </div>
        );
      })}
    </div>
  );
}
