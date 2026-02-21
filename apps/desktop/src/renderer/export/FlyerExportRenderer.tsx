// apps/desktop/src/renderer/export/FlyerExportRenderer.tsx
// Renders complete multi-page flyer for export

import { useEffect, useState } from "react";
import { FlyerJob, IngestItem } from "../types";
import { FlyerTemplateConfig } from "../editor/loadFlyerTemplateConfig";
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

  // Track image loading
  const handleImageLoad = (pageId: string) => {
    setImageLoadStates((prev) => ({ ...prev, [pageId]: true }));
  };

  // Notify when all images are loaded
  useEffect(() => {
    const allLoaded = templateConfig.pages.every(
      (page) => imageLoadStates[page.pageId]
    );
    if (allLoaded && onRenderComplete) {
      // Small delay to ensure rendering is complete
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
              background: "#fff",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              width: "1650px", // Fixed width matching template
              marginBottom: pageIndex < templateConfig.pages.length - 1 ? "20px" : "0",
            }}
          >
            {/* Background template image */}
            <img
              src={page.imagePath}
              alt={`Page ${pageIndex + 1}`}
              onLoad={() => handleImageLoad(page.pageId)}
              style={{
                display: "block",
                width: "1650px", // Use fixed width instead of percentage
                height: "auto",
              }}
            />

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

                const placements = layoutCardRows({
                  cards: cardLayout,
                  region: cardRegion,
                  pageId: page.pageId,
                  regionId: deptId,
                });

                const cardRects = computeCardRects({
                  cards: cardLayout,
                  region: cardRegion,
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
