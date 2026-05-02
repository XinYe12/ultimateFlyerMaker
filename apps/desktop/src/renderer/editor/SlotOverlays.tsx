// FILE: apps/desktop/src/renderer/editor/SlotOverlays.tsx
// ROLE: Interactive overlays for adding/replacing product images in slots or cards

import React, { useState, useEffect } from "react";
import { CardDef, CardLayout } from "../types";

type Slot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Placement = {
  itemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type CardRect = {
  cardId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  itemId?: string;
};

type SlotOverlaysProps = {
  slots: Slot[];
  items?: any[];
  placements: Placement[];
  onAddImage: (slotIndex: number) => void;
  onReplaceImage: (itemId: string) => void;
  onRemoveItem?: (id: string) => void;
  onChooseDatabaseResults?: (itemId: string) => void;
  onGoogleSearch?: (itemId: string) => void;
  onEditTitle?: (itemId: string) => void;
  onPickSeriesFlavors?: (itemId: string) => void;
  // Card mode props
  cardMode?: boolean;
  cardRects?: CardRect[];
  cardLayout?: CardLayout;
  isLocked?: boolean;
  editMode?: boolean;
};

export default function SlotOverlays({
  slots,
  items,
  placements,
  onAddImage,
  onReplaceImage,
  onRemoveItem,
  onChooseDatabaseResults,
  onGoogleSearch,
  onEditTitle,
  onPickSeriesFlavors,
  cardMode,
  cardRects,
  cardLayout,
  isLocked = false,
  editMode = false,
}: SlotOverlaysProps) {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [confirmDeleteSlot, setConfirmDeleteSlot] = useState<number | null>(null);
  const [hoveredFullSlot, setHoveredFullSlot] = useState<number | null>(null);

  // Close delete confirm on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDeleteSlot !== null) {
          setConfirmDeleteSlot(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDeleteSlot]);

  // Find which placement occupies each slot (if any)
  const getPlacementForSlot = (slotIndex: number): Placement | null => {
    // Card mode: match by cardRect's itemId
    if (cardMode && cardRects && cardRects[slotIndex]) {
      const cardRect = cardRects[slotIndex];
      if (cardRect.itemId) {
        const p = placements.find(pl => pl.itemId === cardRect.itemId);
        if (p) return p;
      }
      return null;
    }

    // Slot mode: first try item assigned to this slot index
    if (items) {
      const item = items.find((it: any) => it.slotIndex === slotIndex);
      if (item) {
        const p = placements.find(pl => pl.itemId === item.id);
        if (p) return p;
      }
    }
    // Fallback: center-point overlap check
    const slot = slots[slotIndex];
    const centerX = slot.x + slot.width / 2;
    const centerY = slot.y + slot.height / 2;

    return (
      placements.find(
        (p) =>
          centerX >= p.x &&
          centerX <= p.x + p.width &&
          centerY >= p.y &&
          centerY <= p.y + p.height
      ) || null
    );
  };

  return (
    <>
      {slots.map((slot, index) => {
        const placement = getPlacementForSlot(index);
        const isEmpty = !placement;
        const isHovered = hoveredSlot === index;

        if (isEmpty) {
          if (isLocked || editMode) return null;
          // Empty slot/card: centered overlay with "Add Image" button
          return (
            <div
              key={`slot-overlay-${index}`}
              style={{
                position: "absolute",
                left: slot.x,
                top: slot.y,
                width: slot.width,
                height: slot.height,
                pointerEvents: "auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: cardMode ? "transparent" : "rgba(200, 200, 200, 0.1)",
                zIndex: 9000,
              }}
            >
              <button
                onClick={() => onAddImage(index)}
                style={{
                  width: "160px",
                  height: "160px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--text-lg)",
                  fontWeight: "var(--font-bold)",
                  color: "#fff",
                  backgroundColor: "var(--color-success)",
                  border: "none",
                  borderRadius: "var(--radius-lg)",
                  cursor: "pointer",
                  boxShadow: "var(--shadow-md)",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.08)";
                  e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
                }}
              >
                <div style={{ fontSize: "40px", marginBottom: "8px", lineHeight: 1 }}>+</div>
                <div style={{ fontSize: "25px", fontWeight: "700" }}>Add Product</div>
              </button>
            </div>
          );
        }

        // Filled slot/card: positioned at the slot rect
        const overlayRect = slot;

        // Detect if this item has pending flavor selection
        const itemForSlot = items?.find((it: any) => it.id === placement?.itemId);
        const isPendingFlavors = itemForSlot?.result?.pendingFlavorSelection === true;
        // Use allFlavorPaths so count is accurate even after user narrows to 1
        const flavorCount = itemForSlot?.result?.allFlavorPaths?.length ?? 0;

        return (
          <div
            key={`slot-overlay-${index}`}
            style={{
              position: "absolute",
              left: overlayRect.x,
              top: overlayRect.y,
              width: overlayRect.width,
              height: overlayRect.height,
              pointerEvents: (isLocked || editMode) ? "none" : "auto",
              zIndex: confirmDeleteSlot === index ? 9500 : 9000,
            }}
            onMouseEnter={() => !isLocked && setHoveredFullSlot(index)}
            onMouseLeave={() => {
              setHoveredFullSlot(null);
            }}
          >
            {/* ── Pending flavors: always-visible amber badge at bottom ── */}
            {!editMode && isPendingFlavors && onPickSeriesFlavors && confirmDeleteSlot !== index && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPickSeriesFlavors(placement.itemId);
                }}
                style={{
                  position: "absolute",
                  bottom: 10,
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 9001,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 22px",
                  background: "linear-gradient(135deg, #f59e0b, #d97706)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 50,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 18,
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 16px rgba(245,158,11,0.5)",
                  pointerEvents: "auto",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateX(-50%) scale(1.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateX(-50%) scale(1)";
                }}
              >
                <span style={{ fontSize: 20 }}>🍦</span>
                {flavorCount} Flavors Staged — Select
              </button>
            )}

            {/* Delete X button — top-right corner, visible on full-slot hover */}
            {!editMode && hoveredFullSlot === index && confirmDeleteSlot !== index && onRemoveItem && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteSlot(index);
                }}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  backgroundColor: "var(--color-error)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 16,
                  fontWeight: 700,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 9001,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                  transition: "transform 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
                title="Delete product"
              >
                ✕
              </button>
            )}

            {/* Delete confirmation overlay */}
            {!editMode && confirmDeleteSlot === index && onRemoveItem && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 36,
                  zIndex: 9999,
                  borderRadius: 4,
                }}
              >
                <button
                  onClick={() => {
                    onRemoveItem(placement.itemId);
                    setConfirmDeleteSlot(null);
                    setHoveredFullSlot(null);
                  }}
                  style={{
                    padding: "30px 84px",
                    backgroundColor: "var(--color-error)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 16,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 54,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                  }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDeleteSlot(null)}
                  style={{
                    padding: "24px 72px",
                    backgroundColor: "rgba(255,255,255,0.9)",
                    color: "var(--color-text)",
                    border: "none",
                    borderRadius: 16,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 48,
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Center hover zone for Pick Flavors — non-editMode only */}
            {!editMode && (
              <div
                style={{
                  position: "absolute",
                  left: overlayRect.width * 0.15,
                  top: overlayRect.height * 0.15,
                  width: overlayRect.width * 0.7,
                  height: overlayRect.height * 0.7,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={() => setHoveredSlot(index)}
                onMouseLeave={() => setHoveredSlot(null)}
              >
                {isHovered && confirmDeleteSlot !== index && isPendingFlavors && onPickSeriesFlavors && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPickSeriesFlavors(placement.itemId);
                    }}
                    style={{
                      width: "200px",
                      height: "80px",
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      fontSize: "18px",
                      fontWeight: "700",
                      color: "#fff",
                      background: "linear-gradient(135deg, #f59e0b, #d97706)",
                      border: "none",
                      borderRadius: "12px",
                      cursor: "pointer",
                      boxShadow: "0 4px 16px rgba(245,158,11,0.45)",
                      transition: "transform 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                  >
                    <span style={{ fontSize: "26px" }}>🍦</span>
                    Pick Flavors ({flavorCount})
                  </button>
                )}
              </div>
            )}

          </div>
        );
      })}
    </>
  );
}
