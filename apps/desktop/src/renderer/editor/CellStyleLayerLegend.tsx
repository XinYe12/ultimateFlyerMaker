import React from "react";

const LAYERS = [
  { id: "flyer", label: "Flyer photo", active: false },
  { id: "department", label: "Department area", active: false },
  { id: "cells", label: "Product cells", active: true },
  { id: "fields", label: "Text fields", hint: "next step", active: false },
] as const;

export default function CellStyleLayerLegend() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 999,
        background: "rgba(15,23,42,0.92)",
        border: "1px solid #334155",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        backdropFilter: "blur(6px)",
      }}
    >
      {LAYERS.map((layer, i) => (
        <React.Fragment key={layer.id}>
          {i > 0 && <span style={{ color: "#475569", fontSize: 10 }}>·</span>}
          <span
            style={{
              fontSize: 11,
              fontWeight: layer.active ? 700 : 500,
              color: layer.active ? "#93c5fd" : "#64748b",
            }}
          >
            {layer.label}
            {"hint" in layer && layer.hint ? (
              <span style={{ fontWeight: 500, color: "#475569" }}> ({layer.hint})</span>
            ) : null}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
