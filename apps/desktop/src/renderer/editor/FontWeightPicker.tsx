import React from "react";
import { BOX_FONT_WEIGHT_OPTIONS, BoxFontWeight } from "./boxFontWeight";

type Props = {
  value: BoxFontWeight | undefined;
  onChange: (value: BoxFontWeight) => void;
  theme?: "light" | "dark";
};

export default function FontWeightPicker({ value, onChange, theme = "dark" }: Props) {
  const isDark = theme === "dark";
  const active = value ?? "normal";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: isDark ? "#64748b" : "#6b7280" }}>Weight</span>
      <div
        style={{
          display: "flex",
          gap: 0,
          borderRadius: 4,
          overflow: "hidden",
          border: `1px solid ${isDark ? "#475569" : "#cbd5e1"}`,
        }}
      >
        {BOX_FONT_WEIGHT_OPTIONS.map(opt => {
          const isActive = active === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                flex: 1,
                padding: "6px 0",
                fontSize: 12,
                fontWeight: opt.css,
                background: isActive ? (isDark ? "#3b82f6" : "#2563eb") : (isDark ? "#0f172a" : "#fff"),
                color: isActive ? "#fff" : (isDark ? "#94a3b8" : "#475569"),
                border: "none",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
