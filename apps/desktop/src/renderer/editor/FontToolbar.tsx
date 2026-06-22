// FILE: apps/desktop/src/renderer/editor/FontToolbar.tsx
// Contextual font-editing toolbar shown above the canvas when user clicks a title/price text.

import React, { useState, useRef, useEffect } from "react";

// value: "" means "use the CSS class default font" (Maven Pro for title, Trade Winds for price)
const FONT_OPTIONS = [
  { label: "Default", value: "" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Bebas", value: '"Bebas Neue", Impact, sans-serif' },
  { label: "Oswald", value: "Oswald, sans-serif" },
  { label: "Anton", value: "Anton, Impact, sans-serif" },
  { label: "Impact", value: "Impact, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Barlow", value: '"Barlow Condensed", sans-serif' },
  { label: "Teko", value: "Teko, sans-serif" },
  { label: "Fjalla", value: '"Fjalla One", sans-serif' },
  { label: "Raleway", value: '"Raleway", sans-serif' },
  { label: "Nunito", value: '"Nunito", sans-serif' },
];

type TextEffect = 'stroke' | 'glow' | 'shadow';

const EFFECT_OPTIONS: { value: TextEffect | ''; label: string }[] = [
  { value: '', label: 'No Effect' },
  { value: 'stroke', label: 'Stroke' },
  { value: 'glow', label: 'Glow' },
  { value: 'shadow', label: 'Drop Shadow' },
];

const EFFECT_DEFAULT_COLOR: Record<TextEffect, string> = {
  stroke: '#000000',
  glow: '#ffffff',
  shadow: '#000000',
};

interface FontToolbarProps {
  target: { itemId: string; element: "title" | "price" };
  currentFont?: string;
  currentColor?: string;
  currentItalic?: boolean;
  currentShowDollar?: boolean;
  currentBg?: string;
  currentBgPad?: number;
  currentEffect?: TextEffect;
  onFontChange: (family: string) => void;
  onColorChange: (color: string) => void;
  onItalicToggle: () => void;
  onShowDollarToggle?: () => void;
  onBgChange: (color: string | undefined) => void;
  onBgPadChange: (pad: number) => void;
  onEffectChange: (effect: TextEffect | undefined) => void;
  onClose: () => void;
}

export default function FontToolbar({
  target,
  currentFont,
  currentColor = "#000000",
  currentItalic,
  currentShowDollar,
  currentBg,
  currentBgPad = 2,
  currentEffect,
  onFontChange,
  onColorChange,
  onItalicToggle,
  onShowDollarToggle,
  onBgChange,
  onBgPadChange,
  onEffectChange,
  onClose,
}: FontToolbarProps) {
  const label = target.element === "title" ? "Title Font:" : "Price Font:";
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeOption = FONT_OPTIONS.find((o) =>
    o.value === "" ? !currentFont : currentFont === o.value
  ) ?? FONT_OPTIONS[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "#fff",
        border: "1px solid #d1d5db",
        borderRadius: 8,
        boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
        padding: "6px 10px",
        flexWrap: "nowrap",
        userSelect: "none",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Label */}
      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>
        {label}
      </span>

      {/* Font dropdown */}
      <div ref={dropdownRef} style={{ position: "relative" }}>
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: 28,
            padding: "0 10px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: "#f9fafb",
            color: "#374151",
            fontSize: 13,
            fontFamily: activeOption.value || undefined,
            cursor: "pointer",
            whiteSpace: "nowrap",
            minWidth: 100,
          }}
        >
          <span style={{ flex: 1, textAlign: "left" }}>{activeOption.label}</span>
          <span style={{ fontSize: 10, color: "#9ca3af" }}>▾</span>
        </button>

        {dropdownOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              background: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
              zIndex: 9999,
              minWidth: 140,
              overflow: "hidden",
            }}
          >
            {FONT_OPTIONS.map((opt) => {
              const isActive = opt.value === "" ? !currentFont : currentFont === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => { onFontChange(opt.value); setDropdownOpen(false); }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "7px 12px",
                    textAlign: "left",
                    border: "none",
                    borderBottom: "1px solid #f3f4f6",
                    background: isActive ? "#eff6ff" : "#fff",
                    color: isActive ? "#1d4ed8" : "#374151",
                    fontFamily: opt.value || undefined,
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 400,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#f9fafb"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "#fff"; }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Italic toggle (title only) */}
      {target.element === "title" && (
        <>
          <div style={{ width: 1, height: 20, background: "#e5e7eb", margin: "0 2px", flexShrink: 0 }} />
          <button
          onClick={onItalicToggle}
          title="Italic"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: currentItalic ? "2px solid #2563eb" : "1px solid #d1d5db",
            background: currentItalic ? "#eff6ff" : "#f9fafb",
            color: currentItalic ? "#1d4ed8" : "#374151",
            cursor: "pointer",
            fontStyle: "italic",
            fontSize: 14,
            fontFamily: "Georgia, serif",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
            I
          </button>
        </>
      )}

      {/* Dollar sign toggle (price only) */}
      {target.element === "price" && (
        <>
          <div style={{ width: 1, height: 20, background: "#e5e7eb", margin: "0 2px", flexShrink: 0 }} />
          <button
            onClick={onShowDollarToggle}
            title="Show dollar sign"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: currentShowDollar ? "2px solid #2563eb" : "1px solid #d1d5db",
              background: currentShowDollar ? "#eff6ff" : "#f9fafb",
              color: currentShowDollar ? "#1d4ed8" : "#374151",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            $
          </button>
        </>
      )}

      {/* Color picker */}
      <label
        title="Text color"
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: "1px solid #d1d5db",
          background: currentColor,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <input
          type="color"
          value={currentColor}
          onChange={(e) => onColorChange(e.target.value)}
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0,
            width: "100%",
            height: "100%",
            cursor: "pointer",
            padding: 0,
            border: "none",
          }}
        />
      </label>

      {/* Text effect */}
      <div style={{ width: 1, height: 20, background: "#e5e7eb", margin: "0 2px", flexShrink: 0 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", whiteSpace: "nowrap" }}>Effect:</span>
        <select
          value={currentEffect ?? ''}
          onChange={(e) => {
            const val = e.target.value as TextEffect | '';
            onEffectChange(val || undefined);
            if (val && !currentBg) onBgChange(EFFECT_DEFAULT_COLOR[val as TextEffect]);
          }}
          style={{
            height: 28, padding: "0 6px",
            border: "1px solid #d1d5db", borderRadius: 6,
            background: currentEffect ? "#eff6ff" : "#f9fafb",
            color: currentEffect ? "#1d4ed8" : "#374151",
            fontSize: 12, cursor: "pointer",
          }}
        >
          {EFFECT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {currentEffect && (
        <>
          <div style={{ width: 1, height: 20, background: "#e5e7eb", flexShrink: 0 }} />
          <label
            title="Effect color"
            style={{
              width: 28, height: 28, borderRadius: 6,
              border: "1px solid #d1d5db", background: currentBg ?? '#000000',
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", overflow: "hidden", position: "relative",
            }}
          >
            <input
              type="color"
              value={currentBg ?? '#000000'}
              onChange={(e) => onBgChange(e.target.value)}
              style={{
                position: "absolute", inset: 0, opacity: 0,
                width: "100%", height: "100%", cursor: "pointer", padding: 0, border: "none",
              }}
            />
          </label>
          <input
            type="number"
            min={1} max={20} step={1}
            value={currentBgPad}
            onChange={(e) => onBgPadChange(Math.max(1, Number(e.target.value)))}
            title="Effect size (px)"
            style={{ width: 44, height: 28, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, textAlign: "center", padding: "0 4px" }}
          />
          <button
            onClick={() => onEffectChange(undefined)}
            title="Remove effect"
            style={{
              height: 28, padding: "0 7px", borderRadius: 6,
              border: "1px solid #fca5a5", background: "#fff1f2",
              color: "#ef4444", fontSize: 13, lineHeight: 1,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ✕
          </button>
        </>
      )}

      {/* Close */}
      <button
        onClick={onClose}
        title="Close"
        style={{
          marginLeft: "auto",
          width: 24,
          height: 24,
          borderRadius: 6,
          border: "1px solid #d1d5db",
          background: "#f9fafb",
          color: "#6b7280",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
