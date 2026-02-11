// FILE: apps/desktop/src/renderer/editor/SlotOverlays.tsx
// ROLE: Interactive overlays for adding/replacing product images in slots

import React, { useState } from "react";

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

type SlotOverlaysProps = {
  slots: Slot[];
  placements: Placement[];
  onAddImage: (slotIndex: number) => void;
  onReplaceImage: (itemId: string) => void;
  onRemoveItem?: (id: string) => void;
  onChooseDatabaseResults?: (itemId: string) => void;
  onGoogleSearch?: (itemId: string) => void;
  onEditTitle?: (itemId: string) => void;
};

export default function SlotOverlays({
  slots,
  placements,
  onAddImage,
  onReplaceImage,
  onRemoveItem,
  onChooseDatabaseResults,
  onGoogleSearch,
  onEditTitle,
}: SlotOverlaysProps) {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [showReplaceMenu, setShowReplaceMenu] = useState<number | null>(null);
  const [replacingItemId, setReplacingItemId] = useState<string | null>(null);
  const [confirmDeleteSlot, setConfirmDeleteSlot] = useState<number | null>(null);
  const [hoveredFullSlot, setHoveredFullSlot] = useState<number | null>(null);

  // Find which placement occupies each slot (if any)
  const getPlacementForSlot = (slotIndex: number): Placement | null => {
    const slot = slots[slotIndex];
    // Check if any placement overlaps with this slot (center point check)
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
          // Empty slot: centered overlay with "Add Image" button
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
                backgroundColor: "rgba(200, 200, 200, 0.1)",
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
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "#fff",
                  backgroundColor: "#4CAF50",
                  border: "none",
                  borderRadius: "12px",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
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
                <div style={{ fontSize: "25px", fontWeight: "700" }}>Add Image</div>
              </button>
            </div>
          );
        }

        // Filled slot: full-bounds outer for X button, center 70% for Replace/Edit
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
            }}
            onMouseEnter={() => setHoveredFullSlot(index)}
            onMouseLeave={() => {
              setHoveredFullSlot(null);
              if (confirmDeleteSlot === index) setConfirmDeleteSlot(null);
            }}
          >
            {/* Delete X button — top-right corner, visible on full-slot hover */}
            {hoveredFullSlot === index && confirmDeleteSlot !== index && onRemoveItem && (
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
                  backgroundColor: "#E53935",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 16,
                  fontWeight: 700,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 20,
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
            {confirmDeleteSlot === index && onRemoveItem && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  zIndex: 30,
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
                    padding: "10px 28px",
                    backgroundColor: "#E53935",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 18,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDeleteSlot(null)}
                  style={{
                    padding: "8px 24px",
                    backgroundColor: "rgba(255,255,255,0.9)",
                    color: "#333",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 16,
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Center 70% zone for Replace/Edit hover (unchanged behavior) */}
            <div
              style={{
                position: "absolute",
                left: slot.width * 0.15,
                top: slot.height * 0.15,
                width: slot.width * 0.7,
                height: slot.height * 0.7,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onMouseEnter={() => setHoveredSlot(index)}
              onMouseLeave={() => setHoveredSlot(null)}
            >
            {isHovered && showReplaceMenu !== index && confirmDeleteSlot !== index && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <button
                  onClick={() => {
                    setShowReplaceMenu(index);
                    setReplacingItemId(placement.itemId);
                  }}
                  style={{
                    width: "160px",
                    height: "160px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "#fff",
                  backgroundColor: "#FF9800",
                  border: "none",
                  borderRadius: "12px",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  pointerEvents: "auto",
                  zIndex: 10,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.08)";
                  e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
                }}
              >
                  <div style={{ fontSize: "40px", marginBottom: "8px", lineHeight: 1 }}>🔄</div>
                  <div style={{ fontSize: "25px", fontWeight: "700" }}>Replace</div>
                </button>
                {onEditTitle && (
                  <button
                    onClick={() => {
                      onEditTitle(placement.itemId);
                    }}
                    style={{
                      padding: "20px 36px",
                      backgroundColor: "#5C6BC0",
                      color: "#fff",
                      border: "none",
                      borderRadius: 12,
                      cursor: "pointer",
                      fontWeight: "700",
                      fontSize: "22px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                      transition: "transform 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "scale(1.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <span style={{ fontSize: "28px" }}>✏️</span>
                    Add discount details
                  </button>
                )}
              </div>
            )}

            {/* Replace Source Menu — same gradient as job queue view */}
            {showReplaceMenu === index && (
              <div
                style={{
                  position: "absolute",
                  display: "flex",
                  flexDirection: "column",
                  gap: "32px",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  padding: "48px 56px",
                  borderRadius: "16px",
                  boxShadow: "0 12px 48px rgba(0,0,0,0.35)",
                  zIndex: 100,
                  minWidth: "680px",
                  color: "white",
                }}
                onMouseLeave={() => {
                  setShowReplaceMenu(null);
                  setReplacingItemId(null);
                }}
              >
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "600",
                    marginBottom: "12px",
                    textAlign: "center",
                    opacity: 0.95,
                  }}
                >
                  Choose Image Source
                </div>

                {/* Option 0: Edit product title */}
                {onEditTitle && replacingItemId && (
                  <button
                    onClick={() => {
                      onEditTitle(replacingItemId);
                      setShowReplaceMenu(null);
                      setReplacingItemId(null);
                    }}
                    style={{
                      padding: "28px 40px",
                      background: "rgba(255,255,255,0.2)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.4)",
                      borderRadius: "14px",
                      cursor: "pointer",
                      fontWeight: "600",
                      fontSize: "24px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "16px",
                      transition: "background 0.2s, transform 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.3)";
                      e.currentTarget.style.transform = "scale(1.02)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.2)";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <span style={{ fontSize: "28px" }}>✏️</span>
                    Add discount details
                  </button>
                )}

                {/* Option 1: Google Search */}
                <button
                  onClick={() => {
                    if (replacingItemId && onGoogleSearch) {
                      onGoogleSearch(replacingItemId);
                    } else {
                      alert("Google Search is not available for this slot.");
                    }
                    setShowReplaceMenu(null);
                  }}
                  style={{
                    padding: "28px 40px",
                    background: "rgba(255,255,255,0.2)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.4)",
                    borderRadius: "14px",
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "16px",
                    transition: "background 0.2s, transform 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.3)";
                    e.currentTarget.style.transform = "scale(1.02)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.2)";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <span style={{ fontSize: "28px" }}>🔍</span>
                  Google Search
                </button>

                {/* Option 2: Database Results */}
                <button
                  onClick={() => {
                    if (replacingItemId && onChooseDatabaseResults) {
                      onChooseDatabaseResults(replacingItemId);
                    }
                    setShowReplaceMenu(null);
                    setReplacingItemId(null);
                  }}
                  disabled={!onChooseDatabaseResults}
                  style={{
                    padding: "28px 40px",
                    background: "rgba(255,255,255,0.2)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.4)",
                    borderRadius: "14px",
                    cursor: onChooseDatabaseResults ? "pointer" : "not-allowed",
                    fontWeight: "600",
                    fontSize: "24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "16px",
                    opacity: onChooseDatabaseResults ? 1 : 0.7,
                    transition: "background 0.2s, transform 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (onChooseDatabaseResults) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.3)";
                      e.currentTarget.style.transform = "scale(1.02)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.2)";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <span style={{ fontSize: "28px" }}>💾</span>
                  Database Results
                </button>

                {/* Option 3: Upload from Local */}
                <button
                  onClick={() => {
                    if (replacingItemId) {
                      onReplaceImage(replacingItemId);
                    }
                    setShowReplaceMenu(null);
                    setReplacingItemId(null);
                  }}
                  style={{
                    padding: "28px 40px",
                    background: "rgba(255,255,255,0.2)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.4)",
                    borderRadius: "14px",
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "16px",
                    transition: "background 0.2s, transform 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.3)";
                    e.currentTarget.style.transform = "scale(1.02)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.2)";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <span style={{ fontSize: "28px" }}>📁</span>
                  Upload from Local
                </button>

                {/* Cancel */}
                <button
                  onClick={() => {
                    setShowReplaceMenu(null);
                    setReplacingItemId(null);
                  }}
                  style={{
                    padding: "22px 40px",
                    background: "rgba(255,255,255,0.15)",
                    color: "rgba(255,255,255,0.95)",
                    border: "1px solid rgba(255,255,255,0.35)",
                    borderRadius: "14px",
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "20px",
                    marginTop: "8px",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.25)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            </div>
          </div>
        );
      })}
    </>
  );
}
