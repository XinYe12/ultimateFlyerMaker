// FILE: apps/desktop/src/renderer/editor/EditorCanvas.tsx
// ROLE: render ONLY based on template config (authoritative)

import React, { useEffect, useState, useMemo } from "react";
import {
  loadFlyerTemplateConfig,
  findPageForDepartment,
} from "./loadFlyerTemplateConfig";
import RenderFlyerPlacements from "./RenderFlyerPlacements";
import SlotOverlays from "./SlotOverlays";
import AddImageModal from "./AddImageModal";
import { layoutFlyer, layoutFlyerSlots } from "../../../../shared/flyer/layout/layoutFlyer";
import { isSlottedDepartment } from "./loadFlyerTemplateConfig";
import { saveDepartmentDraft } from "./draftStorage";
import { IngestItem } from "../types";

const PREVIEW_SCALE = 0.5;

export default function EditorCanvas({
  editorQueue,
  templateId,
  department,
  discountLabels,
  onEnqueue,
  onRemove,
  onReplaceImage,
  onRemoveItem,
  onChooseDatabaseResults,
  onGoogleSearch,
  onEditTitle,
  onAddItem,
}: {
  editorQueue: any[];
  templateId: string;
  department: string;
  discountLabels?: { id?: string; titleImagePath?: string; priceImagePath?: string }[];
  onEnqueue?: (paths: string[], options?: { slotIndex?: number }) => Promise<void>;
  onRemove?: (id: string) => void;
  onReplaceImage?: (itemId: string) => Promise<void>;
  onRemoveItem?: (id: string) => void;
  onChooseDatabaseResults?: (itemId: string) => void;
  onGoogleSearch?: (itemId: string) => void;
  onEditTitle?: (itemId: string) => void;
  onAddItem?: (item: IngestItem) => void;
}) {
  const [config, setConfig] = useState<any | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [addImageModalSlot, setAddImageModalSlot] = useState<number | null>(null);

  // load template config
  useEffect(() => {
    loadFlyerTemplateConfig(templateId).then(setConfig);
  }, [templateId]);

  // editorQueue is already glued content
  const items = editorQueue;

  // persist draft
  useEffect(() => {
    if (items.length > 0) {
      saveDepartmentDraft(templateId, department, items);
    }
  }, [items, templateId, department]);

  const page = config ? findPageForDepartment(config, department) : null;
  const region = page?.departments?.[department] ?? null;
  const imagePath = page?.imagePath ?? "";

  // layout (pure)
  const placements = useMemo(() => {
    if (!page || !region || items.length === 0) return [];

    if (isSlottedDepartment(region)) {
      return layoutFlyerSlots({
        items,
        pageId: page.pageId,
        regionId: department,
        slots: region.slots,
      });
    }

    return layoutFlyer({
      items,
      pageId: page.pageId,
      region: {
        id: department,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
      },
    });
  }, [page, region, items, department]);

  if (!config || !page) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  if (!region) {
    return (
      <div style={{ padding: 24, color: "red" }}>
        No region defined for department: {department}
      </div>
    );
  }
  console.log("EditorCanvas items:", items);
  console.log("EditorCanvas placements:", placements);
  console.log("EditorCanvas discountLabels:", discountLabels);

  // ---------- HANDLERS: Add/Replace Images ----------
  const handleAddImage = (slotIndex: number) => {
    setAddImageModalSlot(slotIndex);
  };

  const handleModalLocalFile = async (slotIndex: number, filePath: string) => {
    if (!onEnqueue) return;
    try {
      await onEnqueue([filePath], { slotIndex });
    } catch (err) {
      console.error("Failed to enqueue image:", err);
    }
  };

  const handleModalItemReady = (item: IngestItem) => {
    onAddItem?.(item);
  };

  const handleReplaceImage = async (itemId: string) => {
    // Use the new in-place replacement if provided
    if (onReplaceImage) {
      await onReplaceImage(itemId);
      return;
    }

    // Fallback to old behavior (remove + enqueue) if no replacement handler provided
    if (!onEnqueue || !onRemove) return;

    try {
      const filePath = await window.ufm.openImageDialog();
      if (!filePath) return; // User canceled

      // Find the slot index of the item being replaced
      const itemToReplace = items.find((item: any) => item.id === itemId);
      const slotIndex = itemToReplace?.slotIndex;

      // Remove old item and add new one with same slot assignment
      onRemove(itemId);
      await onEnqueue([filePath], slotIndex !== undefined ? { slotIndex } : undefined);
    } catch (err) {
      console.error("Failed to replace image:", err);
    }
  };

  return (
    <>
    {addImageModalSlot !== null && (
      <AddImageModal
        slotIndex={addImageModalSlot}
        onLocalFile={handleModalLocalFile}
        onItemReady={handleModalItemReady}
        onClose={() => setAddImageModalSlot(null)}
      />
    )}
    <div
      key={page.pageId} // hard reset per page
      style={{ marginTop: 24, display: "flex", justifyContent: "center" }}
    >
      <div
        style={{
          transform: `scale(${PREVIEW_SCALE})`,
          transformOrigin: "top center",
          overflow: "visible",
        }}
      >
        <div
          style={{
            position: "relative",
            width: imageSize?.width ?? 1600,
            height: imageSize?.height ?? 2400,
            background: "#fff",
            overflow: "visible",
          }}
        >
          {/* template image */}
          <img
            src={imagePath}
            onLoad={e =>
              setImageSize({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
            style={{
              width: "100%",
              height: "100%",
              display: "block",
            }}
          />

          {/* department region / slot outlines */}
          {imageSize && isSlottedDepartment(region) && region.slots.map((slot, i) => (
            <div
              key={`slot-${i}`}
              style={{
                position: "absolute",
                left: slot.x,
                top: slot.y,
                width: slot.width,
                height: slot.height,
                border: "2px dashed rgba(255,0,0,0.4)",
                background: "rgba(255,0,0,0.03)",
                pointerEvents: "none",
              }}
            />
          ))}
          {imageSize && !isSlottedDepartment(region) && (
            <div
              style={{
                position: "absolute",
                left: region.x,
                top: region.y,
                width: region.width,
                height: region.height,
                border: "2px dashed red",
                background: "rgba(255,0,0,0.05)",
                pointerEvents: "none",
              }}
            />
          )}

{/* items + labels rendered together per card */}
{placements.length > 0 && (
  <RenderFlyerPlacements
    items={items}
    placements={placements}
    discountLabels={discountLabels as any}
  />
)}

{/* interactive slot overlays (add/replace buttons) */}
{imageSize && isSlottedDepartment(region) && onEnqueue && onRemove && (
  <SlotOverlays
    slots={region.slots}
    placements={placements}
    onAddImage={handleAddImage}
    onReplaceImage={handleReplaceImage}
    onRemoveItem={onRemoveItem}
    onChooseDatabaseResults={onChooseDatabaseResults}
    onGoogleSearch={onGoogleSearch}
    onEditTitle={onEditTitle}
  />
)}
        </div>
      </div>
    </div>
    </>
  );
}
