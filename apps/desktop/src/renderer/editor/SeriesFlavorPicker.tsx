// FILE: apps/desktop/src/renderer/editor/SeriesFlavorPicker.tsx
// Modal for selecting which flavor images to include in a series product card

import React, { useState } from "react";

type SeriesFlavorPickerProps = {
  item: any; // IngestItem with result.cutoutPaths[]
  onConfirm: (itemId: string, selectedPaths: string[]) => void;
  onClose: () => void;
};

function toSrc(path: string): string {
  return path.startsWith("http") || path.startsWith("file://") ? path : `file://${path}`;
}

export default function SeriesFlavorPicker({ item, onConfirm, onClose }: SeriesFlavorPickerProps) {
  // allFlavorPaths = full staged set (never shrinks); cutoutPaths = current active selection
  const allPaths: string[] = item?.result?.allFlavorPaths ?? item?.result?.cutoutPaths ?? [];
  const productName = item?.result?.discount?.en ?? item?.result?.title?.en ?? "Series Product";
  const productZh  = item?.result?.discount?.zh ?? item?.result?.title?.zh ?? "";

  // Pre-check currently active paths (cutoutPaths when multi, cutoutPath when single)
  const activePaths: string[] = item?.result?.cutoutPaths
    ?? (item?.result?.cutoutPath ? [item.result.cutoutPath] : allPaths);
  const [selected, setSelected] = useState<Set<string>>(new Set(activePaths));

  const toggle = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const selectAll  = () => setSelected(new Set(allPaths));
  const clearAll   = () => setSelected(new Set());

  const handleConfirm = () => {
    // Preserve original order
    const ordered = allPaths.filter(p => selected.has(p));
    if (ordered.length === 0) return;
    onConfirm(item.id, ordered);
  };

  const cols = Math.min(4, allPaths.length);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 12000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          padding: "40px 48px 36px",
          width: "min(860px, 92vw)",
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#111" }}>
              Select Flavors
            </h2>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 22, color: "#888", lineHeight: 1, padding: "2px 6px",
              }}
              title="Cancel"
            >
              ✕
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 16 }}>
            <strong style={{ color: "#222" }}>{productName}</strong>
            {productZh && <span style={{ marginLeft: 10, color: "#888" }}>{productZh}</span>}
          </div>
          <p style={{ margin: "8px 0 0", color: "#666", fontSize: 14 }}>
            {allPaths.length} flavor image{allPaths.length !== 1 ? "s" : ""} found. Choose which to show in the product card.
          </p>
        </div>

        {/* ── Select-all / clear toolbar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <button
            onClick={selectAll}
            disabled={selected.size === allPaths.length}
            style={{
              padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: "1.5px solid #4C6EF5", background: "#fff", color: "#4C6EF5",
              cursor: selected.size === allPaths.length ? "default" : "pointer",
              opacity: selected.size === allPaths.length ? 0.5 : 1,
            }}
          >
            Select All
          </button>
          <button
            onClick={clearAll}
            disabled={selected.size === 0}
            style={{
              padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: "1.5px solid #bbb", background: "#fff", color: "#555",
              cursor: selected.size === 0 ? "default" : "pointer",
              opacity: selected.size === 0 ? 0.4 : 1,
            }}
          >
            Clear
          </button>
          <span style={{ marginLeft: "auto", fontSize: 14, color: "#666" }}>
            <strong style={{ color: "#333" }}>{selected.size}</strong> / {allPaths.length} selected
          </span>
        </div>

        {/* ── Flavor grid ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 14,
            marginBottom: 32,
          }}
        >
          {allPaths.map((path, idx) => {
            const isSelected = selected.has(path);
            return (
              <div
                key={idx}
                onClick={() => toggle(path)}
                style={{
                  position: "relative",
                  border: `3px solid ${isSelected ? "#4C6EF5" : "#e0e0e0"}`,
                  borderRadius: 12,
                  background: isSelected ? "#f0f3ff" : "#fafafa",
                  cursor: "pointer",
                  aspectRatio: "1 / 1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "border-color 0.12s, background 0.12s",
                  overflow: "hidden",
                }}
              >
                <img
                  src={toSrc(path)}
                  alt={`Flavor ${idx + 1}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    padding: 10,
                    opacity: isSelected ? 1 : 0.45,
                    transition: "opacity 0.12s",
                  }}
                />
                {/* Checkmark */}
                {isSelected && (
                  <div
                    style={{
                      position: "absolute", top: 8, right: 8,
                      width: 22, height: 22, borderRadius: "50%",
                      background: "#4C6EF5",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 13, fontWeight: 700,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                    }}
                  >
                    ✓
                  </div>
                )}
                <div
                  style={{
                    position: "absolute", bottom: 4, left: 0, right: 0,
                    textAlign: "center", fontSize: 12,
                    color: isSelected ? "#4C6EF5" : "#999",
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  #{idx + 1}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Action buttons ── */}
        <div style={{ display: "flex", gap: 14, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "13px 30px", borderRadius: 10,
              border: "1.5px solid #ddd", background: "#fff",
              color: "#555", fontWeight: 600, fontSize: 15, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            style={{
              padding: "13px 36px", borderRadius: 10, border: "none",
              background: selected.size === 0 ? "#ccc" : "#4C6EF5",
              color: "#fff", fontWeight: 700, fontSize: 15,
              cursor: selected.size === 0 ? "not-allowed" : "pointer",
              boxShadow: selected.size === 0 ? "none" : "0 4px 14px rgba(76,110,245,0.35)",
              transition: "background 0.15s",
            }}
          >
            Use {selected.size} Flavor{selected.size !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
