import React from "react";
const TARGET_CELL_SIZE_MIN = 1;
const TARGET_CELL_SIZE_MAX = 800;

const inputStyle: React.CSSProperties = {
  padding: "4px 6px",
  borderRadius: 4,
  border: "1px solid #475569",
  background: "#0f172a",
  color: "#f8fafc",
  fontSize: 12,
  width: "100%",
  boxSizing: "border-box",
};

const presetBtn: React.CSSProperties = {
  flex: 1,
  padding: "6px 4px",
  borderRadius: 6,
  border: "1px solid #475569",
  background: "#1e293b",
  color: "#e2e8f0",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

interface Props {
  targetWidth: number;
  targetHeight: number;
  computedWidth?: number | null;
  computedHeight?: number | null;
  gridRows: number;
  gridCols: number;
  onChange: (width: number, height: number) => void;
}

function clampDim(v: number) {
  return Math.max(TARGET_CELL_SIZE_MIN, Math.min(TARGET_CELL_SIZE_MAX, Math.round(v)));
}

export default function CellSizeControls({
  targetWidth,
  targetHeight,
  computedWidth,
  computedHeight,
  gridRows,
  gridCols,
  onChange,
}: Props) {
  const applyScale = (factor: number) => {
    onChange(clampDim(targetWidth * factor), clampDim(targetHeight * factor));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
        Cell size
      </div>
      <p style={{ fontSize: 10, color: "#64748b", margin: 0, lineHeight: 1.45 }}>
        Smaller targets fit more rows and columns in the department. The centered sample cell on the canvas updates as you adjust.
      </p>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" style={presetBtn} onClick={() => applyScale(0.8)} title="More, smaller cells">
          Smaller
        </button>
        <button type="button" style={presetBtn} onClick={() => applyScale(1.25)} title="Fewer, larger cells">
          Larger
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 11, color: "#64748b" }}>Target width (px)</span>
          <input
            type="number"
            min={TARGET_CELL_SIZE_MIN}
            max={TARGET_CELL_SIZE_MAX}
            value={targetWidth}
            onChange={e => onChange(clampDim(parseInt(e.target.value) || TARGET_CELL_SIZE_MIN), targetHeight)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 11, color: "#64748b" }}>Target height (px)</span>
          <input
            type="number"
            min={TARGET_CELL_SIZE_MIN}
            max={TARGET_CELL_SIZE_MAX}
            value={targetHeight}
            onChange={e => onChange(targetWidth, clampDim(parseInt(e.target.value) || TARGET_CELL_SIZE_MIN))}
            style={inputStyle}
          />
        </label>
      </div>
      <p style={{ fontSize: 10, color: "#94a3b8", margin: 0, lineHeight: 1.45 }}>
        Grid: <strong style={{ color: "#cbd5e1" }}>{gridRows} rows × {gridCols} cols</strong>
        {computedWidth != null && computedHeight != null && (
          <> · rendered cells ~{computedWidth}×{computedHeight} px</>
        )}
      </p>
    </div>
  );
}
