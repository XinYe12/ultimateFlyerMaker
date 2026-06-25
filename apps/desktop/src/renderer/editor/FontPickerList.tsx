import React from "react";
import { FontOption } from "./fontOptions";

type Props = {
  options: FontOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  label: string;
  theme?: "light" | "dark";
};

export default function FontPickerList({ options, value, onChange, label, theme = "dark" }: Props) {
  const isDark = theme === "dark";
  const activeValue = value ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: isDark ? "#64748b" : "#6b7280" }}>{label}</span>
      <div
        style={{
          maxHeight: 160,
          overflowY: "auto",
          borderRadius: 6,
          border: `1px solid ${isDark ? "#475569" : "#e5e7eb"}`,
          background: isDark ? "#0f172a" : "#fff",
        }}
      >
        {options.map(opt => {
          const isActive = opt.value === "" ? !activeValue : activeValue === opt.value;
          return (
            <button
              key={opt.value || "__default__"}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                display: "block",
                width: "100%",
                padding: "7px 10px",
                textAlign: "left",
                border: "none",
                borderBottom: `1px solid ${isDark ? "#1e293b" : "#f3f4f6"}`,
                background: isActive ? (isDark ? "rgba(59,130,246,0.2)" : "#eff6ff") : "transparent",
                color: isActive ? (isDark ? "#93c5fd" : "#1d4ed8") : (isDark ? "#e2e8f0" : "#374151"),
                fontFamily: opt.value || undefined,
                fontSize: 13,
                fontWeight: isActive ? 700 : 400,
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
