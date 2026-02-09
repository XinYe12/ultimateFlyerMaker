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
  onChooseDatabaseResults?: (itemId: string) => void;
  onEditTitle?: (itemId: string) => void;
};

export default function SlotOverlays({
  slots,
  placements,
  onAddImage,
  onReplaceImage,
  onChooseDatabaseResults,
  onEditTitle,
}: SlotOverlaysProps) {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [showReplaceMenu, setShowReplaceMenu] = useState<number | null>(null);
  const [replacingItemId, setReplacingItemId] = useState<string | null>(null);

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

        // Filled slot: centered Replace button (on hover of center area)
        return (
          <div
            key={`slot-overlay-${index}`}
            style={{
              position: "absolute",
              left: slot.x + slot.width * 0.15,  // Centered horizontally (70% width)
              top: slot.y + slot.height * 0.15,   // Centered vertically (70% height)
              width: slot.width * 0.7,
              height: slot.height * 0.7,
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={() => setHoveredSlot(index)}
            onMouseLeave={() => setHoveredSlot(null)}
          >
            {isHovered && showReplaceMenu !== index && (
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

            {/* Replace Source Menu */}
            {showReplaceMenu === index && (
              <div
                style={{
                  position: "absolute",
                  display: "flex",
                  flexDirection: "column",
                  gap: "36px",
                  backgroundColor: "rgba(255, 255, 255, 0.98)",
                  padding: "48px",
                  borderRadius: "24px",
                  boxShadow: "0 12px 48px rgba(0,0,0,0.35)",
                  zIndex: 100,
                  minWidth: "660px",
                }}
                onMouseLeave={() => {
                  setShowReplaceMenu(null);
                  setReplacingItemId(null);
                }}
              >
                <div
                  style={{
                    fontSize: "42px",
                    fontWeight: "700",
                    color: "#333",
                    marginBottom: "12px",
                    textAlign: "center",
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
                      padding: "24px 48px",
                      backgroundColor: "#5C6BC0",
                      color: "#fff",
                      border: "none",
                      borderRadius: "24px",
                      cursor: "pointer",
                      fontWeight: "700",
                      fontSize: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "24px",
                      transition: "transform 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "scale(1.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <span style={{ fontSize: "40px" }}>✏️</span>
                    Add discount details
                  </button>
                )}

                {/* Option 1: Google Searches */}
                <button
                  onClick={() => {
                    alert("Google Search integration coming soon!");
                    setShowReplaceMenu(null);
                  }}
                  style={{
                    padding: "36px 48px",
                    backgroundColor: "#4285F4",
                    color: "#fff",
                    border: "none",
                    borderRadius: "24px",
                    cursor: "pointer",
                    fontWeight: "700",
                    fontSize: "42px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "24px",
                    transition: "transform 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <span style={{ fontSize: "54px" }}>🔍</span>
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
                    padding: "36px 48px",
                    backgroundColor: "#9C27B0",
                    color: "#fff",
                    border: "none",
                    borderRadius: "24px",
                    cursor: "pointer",
                    fontWeight: "700",
                    fontSize: "42px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "24px",
                    transition: "transform 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <span style={{ fontSize: "54px" }}>💾</span>
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
                    padding: "36px 48px",
                    backgroundColor: "#4CAF50",
                    color: "#fff",
                    border: "none",
                    borderRadius: "24px",
                    cursor: "pointer",
                    fontWeight: "700",
                    fontSize: "42px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "24px",
                    transition: "transform 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <span style={{ fontSize: "54px" }}>📁</span>
                  Upload from Local
                </button>

                {/* Cancel */}
                <button
                  onClick={() => {
                    setShowReplaceMenu(null);
                    setReplacingItemId(null);
                  }}
                  style={{
                    padding: "24px 48px",
                    backgroundColor: "#f5f5f5",
                    color: "#666",
                    border: "3px solid #ddd",
                    borderRadius: "24px",
                    cursor: "pointer",
                    fontWeight: "700",
                    fontSize: "39px",
                    marginTop: "12px",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
