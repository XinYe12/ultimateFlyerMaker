import React, { useState } from "react";
import type { GridLayoutDef } from "./loadFlyerTemplateConfig";

const numInput: React.CSSProperties = {
  padding: "3px 5px",
  borderRadius: 4,
  border: "1px solid #475569",
  background: "#0f172a",
  color: "#f8fafc",
  fontSize: 12,
  width: 52,
  boxSizing: "border-box",
  textAlign: "right",
  flexShrink: 0,
};

function sliderTrack(value: number, min: number, max: number): React.CSSProperties {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return {
    background: `linear-gradient(to right, #3b82f6 ${pct}%, #334155 ${pct}%)`,
  };
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, min, max, onChange }: SliderRowProps) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "#64748b" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="range"
          className="ufm-slider"
          min={min}
          max={max}
          value={value}
          style={sliderTrack(value, min, max)}
          onChange={e => onChange(clamp(parseInt(e.target.value)))}
        />
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          style={numInput}
          onChange={e => onChange(clamp(parseInt(e.target.value) || min))}
        />
      </div>
    </div>
  );
}

interface Props {
  gridLayout: GridLayoutDef;
  onChange: (patch: Partial<GridLayoutDef>) => void;
}

export default function GridSpacingControls({ gridLayout, onChange }: Props) {
  const [advanced, setAdvanced] = useState(false);

  // Default padding mirrors cellGap so the slider reflects the actual effective value
  const defaultPad = gridLayout.cellGap != null ? Math.max(0, gridLayout.cellGap) : 6;
  const uniformPad = gridLayout.insetTop ?? gridLayout.insetLeft ?? gridLayout.insetRight ?? gridLayout.insetBottom ?? defaultPad;

  const setUniformPadding = (value: number) => {
    const v = Math.max(0, Math.round(value));
    onChange({ insetTop: v, insetLeft: v, insetRight: v, insetBottom: v });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
        Grid spacing
      </div>

      <SliderRow
        label="Cell gap (px)"
        value={gridLayout.cellGap ?? 0}
        min={0}
        max={40}
        onChange={v => onChange({ cellGap: v })}
      />

      {!advanced ? (
        <SliderRow
          label="Padding (all sides, px)"
          value={uniformPad}
          min={0}
          max={200}
          onChange={setUniformPadding}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {(["insetTop", "insetLeft", "insetRight", "insetBottom"] as const).map((key, i) => (
            <SliderRow
              key={key}
              label={["Top (px)", "Left (px)", "Right (px)", "Bottom (px)"][i]}
              value={gridLayout[key] ?? 0}
              min={0}
              max={200}
              onChange={v => onChange({ [key]: v })}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setAdvanced(v => !v)}
        style={{
          padding: "4px 0",
          background: "none",
          border: "none",
          color: "#93c5fd",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {advanced ? "Use uniform padding" : "Per-side padding…"}
      </button>
      <p style={{ fontSize: 10, color: "#64748b", margin: 0, lineHeight: 1.45 }}>
        Dashed outline on the canvas shows the padded grid area inside the department region.
      </p>
    </div>
  );
}
