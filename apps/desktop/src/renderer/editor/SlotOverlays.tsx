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
  onEnterResizingMode?: () => void;
  resizingMode?: boolean;
  // Card mode props
  cardMode?: boolean;
  cardRects?: CardRect[];
  cardLayout?: CardLayout;
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
  onEnterResizingMode,
  resizingMode = false,
  cardMode,
  cardRects,
  cardLayout,
}: SlotOverlaysProps) {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [showReplaceMenu, setShowReplaceMenu] = useState<number | null>(null);
  const [replacingItemId, setReplacingItemId] = useState<string | null>(null);
  const [confirmDeleteSlot, setConfirmDeleteSlot] = useState<number | null>(null);
  const [hoveredFullSlot, setHoveredFullSlot] = useState<number | null>(null);

  // Close menus on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showReplaceMenu !== null) {
          setShowReplaceMenu(null);
          setReplacingItemId(null);
        }
        if (confirmDeleteSlot !== null) {
          setConfirmDeleteSlot(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showReplaceMenu, confirmDeleteSlot]);

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
                <div style={{ fontSize: "25px", fontWeight: "700" }}>Add Image</div>
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
              pointerEvents: resizingMode ? "none" : "auto",
              zIndex: 9000,
            }}
            onMouseEnter={() => !resizingMode && setHoveredFullSlot(index)}
            onMouseLeave={() => {
              setHoveredFullSlot(null);
            }}
          >
            {/* ── Pending flavors: always-visible amber badge at bottom ── */}
            {isPendingFlavors && onPickSeriesFlavors && confirmDeleteSlot !== index && (
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

            {/* Center 70% zone for Edit hover */}
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
            {isHovered && showReplaceMenu !== index && confirmDeleteSlot !== index && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                {/* Pending flavors: prominent "Pick Flavors" button in hover menu */}
                {isPendingFlavors && onPickSeriesFlavors && (
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
                {/* Single Edit button — opens the edit menu */}
                {(() => {
                  const isLowConf = itemForSlot?.result?.lowConfidence === true;
                  const ms = itemForSlot?.result?.matchSource as string | undefined;
                  const editBg = ms === "none" ? "#e53e3e"
                    : ms === "serper" ? "#3182ce"
                    : isLowConf ? "#d97706"
                    : "var(--color-warning)";
                  return (
                    <button
                      onClick={() => {
                        setShowReplaceMenu(index);
                        setReplacingItemId(placement.itemId);
                      }}
                      style={{
                        width: isLowConf ? "110px" : "80px",
                        height: "80px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: "700",
                        color: "#fff",
                        backgroundColor: editBg,
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                        boxShadow: isLowConf ? `0 4px 16px ${editBg}99` : "0 4px 12px rgba(0,0,0,0.3)",
                        transition: "transform 0.2s, box-shadow 0.2s",
                        pointerEvents: "auto",
                        zIndex: 9001,
                        animation: isLowConf ? "ufm-pulse 1.8s ease-in-out infinite" : undefined,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "scale(1.08)";
                        e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.4)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "scale(1)";
                        e.currentTarget.style.boxShadow = isLowConf ? `0 4px 16px ${editBg}99` : "0 4px 12px rgba(0,0,0,0.3)";
                      }}
                    >
                      <div style={{ fontSize: "20px", marginBottom: "4px", lineHeight: 1 }}>
                        {isLowConf ? "⚠️" : "✏️"}
                      </div>
                      <div style={{ fontSize: "11px", fontWeight: "700" }}>
                        {ms === "none" ? "Replace!" : ms === "serper" ? "Check" : isLowConf ? "Check" : "Edit"}
                      </div>
                    </button>
                  );
                })()}
              </div>
            )}

            {/* Edit Menu */}
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
                  zIndex: 9999,
                  minWidth: "680px",
                  color: "white",
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
                  Edit
                </div>

                {/* Option: Resize content — enter resizing mode (card-based only) */}
                {cardMode && onEnterResizingMode && (
                  <button
                    onClick={() => {
                      onEnterResizingMode();
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
                    <span style={{ fontSize: "28px" }}>↔︎</span>
                    Resize content
                  </button>
                )}

                {/* Series flavor toggle — shown when item has multiple staged flavor images */}
                {(() => {
                  const replacingItem = items?.find((it: any) => it.id === replacingItemId);
                  // Use allFlavorPaths (preserved full set) so button stays after selecting 1 flavor
                  const isSeries = (replacingItem?.result?.allFlavorPaths?.length ?? 0) > 1;
                  if (!isSeries || !onPickSeriesFlavors || !replacingItemId) return null;
                  const isPending = replacingItem?.result?.pendingFlavorSelection === true;
                  const count = replacingItem?.result?.allFlavorPaths?.length ?? 0;
                  return (
                    <button
                      onClick={() => {
                        onPickSeriesFlavors(replacingItemId);
                        setShowReplaceMenu(null);
                        setReplacingItemId(null);
                      }}
                      style={{
                        padding: "28px 40px",
                        background: isPending
                          ? "linear-gradient(135deg, rgba(245,158,11,0.5), rgba(217,119,6,0.5))"
                          : "rgba(255,255,255,0.2)",
                        color: "#fff",
                        border: isPending
                          ? "1px solid rgba(245,158,11,0.8)"
                          : "1px solid rgba(255,255,255,0.4)",
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
                        e.currentTarget.style.background = isPending
                          ? "linear-gradient(135deg, rgba(245,158,11,0.7), rgba(217,119,6,0.7))"
                          : "rgba(255,255,255,0.3)";
                        e.currentTarget.style.transform = "scale(1.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isPending
                          ? "linear-gradient(135deg, rgba(245,158,11,0.5), rgba(217,119,6,0.5))"
                          : "rgba(255,255,255,0.2)";
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                    >
                      <span style={{ fontSize: "28px" }}>🍦</span>
                      {isPending ? `Select Flavors (${count} staged)` : `Change Flavors (${count} selected)`}
                    </button>
                  );
                })()}

                {/* Option: Add discount details */}
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

                {/* Option: Google Search */}
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

                {/* Option: Database Results */}
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

                {/* Option: Upload from Local */}
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
