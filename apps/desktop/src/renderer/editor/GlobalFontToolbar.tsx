// FILE: apps/desktop/src/renderer/editor/GlobalFontToolbar.tsx
// Persistent global toolbar for setting title/price fonts, colors, and dollar-sign toggle
// across all discount items at once.

import React, { useState, useRef, useEffect } from "react";
import { FONT_OPTIONS } from "./fontOptions";

interface FontDropdownProps {
  value?: string;
  onChange: (v: string) => void;
  label: string;
}

function FontDropdown({ value, onChange, label }: FontDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = FONT_OPTIONS.find(o => o.value === "" ? !value : value === o.value) ?? FONT_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", whiteSpace: "nowrap" }}>{label}</span>
      <div ref={ref} style={{ position: "relative" }}>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setOpen(o => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            height: 28, padding: "0 8px",
            border: "1px solid #d1d5db", borderRadius: 6,
            background: "#f9fafb", color: "#374151",
            fontSize: 12, fontFamily: active.value || undefined,
            cursor: "pointer", whiteSpace: "nowrap", minWidth: 90,
          }}
        >
          <span style={{ flex: 1, textAlign: "left" }}>{active.label}</span>
          <span style={{ fontSize: 9, color: "#9ca3af" }}>▾</span>
        </button>
        {open && (
          <div
            style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0,
              background: "#fff", border: "1px solid #d1d5db",
              borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
              zIndex: 9999, minWidth: 140, overflow: "hidden",
            }}
          >
            {FONT_OPTIONS.map(opt => {
              const isActive = opt.value === "" ? !value : value === opt.value;
              return (
                <button
                  key={opt.value}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  style={{
                    display: "block", width: "100%", padding: "7px 12px",
                    textAlign: "left", border: "none",
                    borderBottom: "1px solid #f3f4f6",
                    background: isActive ? "#eff6ff" : "#fff",
                    color: isActive ? "#1d4ed8" : "#374151",
                    fontFamily: opt.value || undefined,
                    fontSize: 13, fontWeight: isActive ? 700 : 400, cursor: "pointer",
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f9fafb"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "#fff"; }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type TextEffect = 'stroke' | 'glow' | 'shadow';

interface GlobalFontToolbarProps {
  activeSection: 'title' | 'price' | 'banner';
  titleFont?: string;
  titleColor?: string;
  titleItalic?: boolean;
  titleBg?: string;
  titleBgPad?: number;
  titleEffect?: TextEffect;
  priceFont?: string;
  priceColor?: string;
  priceShowDollar?: boolean;
  priceBg?: string;
  priceBgPad?: number;
  priceEffect?: TextEffect;
  onTitleFontChange: (v: string) => void;
  onTitleColorChange: (v: string) => void;
  onTitleItalicToggle: () => void;
  onTitleBgChange: (v: string | undefined) => void;
  onTitleBgPadChange: (v: number) => void;
  onTitleEffectChange: (v: TextEffect | undefined) => void;
  onPriceFontChange: (v: string) => void;
  onPriceColorChange: (v: string) => void;
  onShowDollarToggle: () => void;
  onPriceBgChange: (v: string | undefined) => void;
  onPriceBgPadChange: (v: number) => void;
  onPriceEffectChange: (v: TextEffect | undefined) => void;
  onClose: () => void;
}

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

export default function GlobalFontToolbar({
  activeSection,
  titleFont,
  titleColor = "#000000",
  titleItalic,
  titleBg,
  titleBgPad = 2,
  titleEffect,
  priceFont,
  priceColor = "#000000",
  priceShowDollar,
  priceBg,
  priceBgPad = 2,
  priceEffect,
  onTitleFontChange,
  onTitleColorChange,
  onTitleItalicToggle,
  onTitleBgChange,
  onTitleBgPadChange,
  onTitleEffectChange,
  onPriceFontChange,
  onPriceColorChange,
  onShowDollarToggle,
  onPriceBgChange,
  onPriceBgPadChange,
  onPriceEffectChange,
  onClose,
}: GlobalFontToolbarProps) {
  const sectionLabel = activeSection === 'title' ? 'TITLE' : activeSection === 'price' ? 'PRICE' : 'BANNER';

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#fff",
        border: "1px solid #d1d5db",
        borderRadius: 10,
        boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
        padding: "7px 14px",
        flexWrap: "wrap",
        userSelect: "none",
        marginBottom: 10,
      }}
    >
      {/* Section label */}
      <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", whiteSpace: "nowrap", letterSpacing: "0.04em" }}>
        {sectionLabel}
      </span>

      {/* ── Title controls ── */}
      {activeSection === 'title' && (
        <>
          <FontDropdown label="Font:" value={titleFont} onChange={onTitleFontChange} />

          <label
            title="Title color"
            style={{
              width: 26, height: 26, borderRadius: 6,
              border: "1px solid #d1d5db", background: titleColor,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", overflow: "hidden", position: "relative",
            }}
          >
            <input
              type="color"
              value={titleColor}
              onChange={(e) => onTitleColorChange(e.target.value)}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", padding: 0, border: "none" }}
            />
          </label>

          <button
            onClick={onTitleItalicToggle}
            title="Italic"
            style={{
              width: 26, height: 26, borderRadius: 6,
              border: titleItalic ? "2px solid #2563eb" : "1px solid #d1d5db",
              background: titleItalic ? "#eff6ff" : "#f9fafb",
              color: titleItalic ? "#1d4ed8" : "#374151",
              cursor: "pointer", fontStyle: "italic",
              fontSize: 13, fontFamily: "Georgia, serif", fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            I
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", whiteSpace: "nowrap" }}>Effect:</span>
            <select
              value={titleEffect ?? ''}
              onChange={(e) => {
                const val = e.target.value as TextEffect | '';
                onTitleEffectChange(val || undefined);
                if (val && !titleBg) onTitleBgChange(EFFECT_DEFAULT_COLOR[val as TextEffect]);
              }}
              style={{
                height: 26, padding: "0 6px",
                border: "1px solid #d1d5db", borderRadius: 6,
                background: titleEffect ? "#eff6ff" : "#f9fafb",
                color: titleEffect ? "#1d4ed8" : "#374151",
                fontSize: 12, cursor: "pointer",
              }}
            >
              {EFFECT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {titleEffect && (
            <>
              <div style={{ width: 1, height: 20, background: "#e5e7eb", flexShrink: 0 }} />
              <label
                title="Effect color"
                style={{
                  width: 26, height: 26, borderRadius: 6,
                  border: "1px solid #d1d5db", background: titleBg ?? '#000000',
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", overflow: "hidden", position: "relative",
                }}
              >
                <input
                  type="color"
                  value={titleBg ?? '#000000'}
                  onChange={(e) => onTitleBgChange(e.target.value)}
                  style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", padding: 0, border: "none" }}
                />
              </label>
              <input
                type="number"
                min={1} max={20} step={1}
                value={titleBgPad}
                onChange={(e) => onTitleBgPadChange(Math.max(1, Number(e.target.value)))}
                title="Effect size (px)"
                style={{ width: 44, height: 26, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, textAlign: "center", padding: "0 4px" }}
              />
              <button
                onClick={() => onTitleEffectChange(undefined)}
                title="Remove effect"
                style={{
                  height: 26, padding: "0 7px", borderRadius: 6,
                  border: "1px solid #fca5a5", background: "#fff1f2",
                  color: "#ef4444", fontSize: 13, lineHeight: 1,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ✕
              </button>
            </>
          )}
        </>
      )}

      {/* ── Price controls ── */}
      {activeSection === 'price' && (
        <>
          <FontDropdown label="Font:" value={priceFont} onChange={onPriceFontChange} />

          <label
            title="Price color"
            style={{
              width: 26, height: 26, borderRadius: 6,
              border: "1px solid #d1d5db", background: priceColor,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", overflow: "hidden", position: "relative",
            }}
          >
            <input
              type="color"
              value={priceColor}
              onChange={(e) => onPriceColorChange(e.target.value)}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", padding: 0, border: "none" }}
            />
          </label>

          <button
            onClick={onShowDollarToggle}
            title="Show $ sign on all prices"
            style={{
              width: 26, height: 26, borderRadius: 6,
              border: priceShowDollar ? "2px solid #2563eb" : "1px solid #d1d5db",
              background: priceShowDollar ? "#eff6ff" : "#f9fafb",
              color: priceShowDollar ? "#1d4ed8" : "#374151",
              cursor: "pointer", fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            $
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", whiteSpace: "nowrap" }}>Effect:</span>
            <select
              value={priceEffect ?? ''}
              onChange={(e) => {
                const val = e.target.value as TextEffect | '';
                onPriceEffectChange(val || undefined);
                if (val && !priceBg) onPriceBgChange(EFFECT_DEFAULT_COLOR[val as TextEffect]);
              }}
              style={{
                height: 26, padding: "0 6px",
                border: "1px solid #d1d5db", borderRadius: 6,
                background: priceEffect ? "#eff6ff" : "#f9fafb",
                color: priceEffect ? "#1d4ed8" : "#374151",
                fontSize: 12, cursor: "pointer",
              }}
            >
              {EFFECT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {priceEffect && (
            <>
              <div style={{ width: 1, height: 20, background: "#e5e7eb", flexShrink: 0 }} />
              <label
                title="Effect color"
                style={{
                  width: 26, height: 26, borderRadius: 6,
                  border: "1px solid #d1d5db", background: priceBg ?? '#000000',
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", overflow: "hidden", position: "relative",
                }}
              >
                <input
                  type="color"
                  value={priceBg ?? '#000000'}
                  onChange={(e) => onPriceBgChange(e.target.value)}
                  style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", padding: 0, border: "none" }}
                />
              </label>
              <input
                type="number"
                min={1} max={20} step={1}
                value={priceBgPad}
                onChange={(e) => onPriceBgPadChange(Math.max(1, Number(e.target.value)))}
                title="Effect size (px)"
                style={{ width: 44, height: 26, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, textAlign: "center", padding: "0 4px" }}
              />
              <button
                onClick={() => onPriceEffectChange(undefined)}
                title="Remove effect"
                style={{
                  height: 26, padding: "0 7px", borderRadius: 6,
                  border: "1px solid #fca5a5", background: "#fff1f2",
                  color: "#ef4444", fontSize: 13, lineHeight: 1,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ✕
              </button>
            </>
          )}
        </>
      )}

      {/* ── Banner: no extra controls — use click on banner to edit days ── */}
      {activeSection === 'banner' && (
        <span style={{ fontSize: 11, color: "#6b7280" }}>Click the badge to edit days</span>
      )}

      {/* Close */}
      <button
        onClick={onClose}
        title="Close"
        style={{
          marginLeft: "auto",
          width: 24, height: 24, borderRadius: 6,
          border: "1px solid #d1d5db", background: "#f9fafb",
          color: "#6b7280", cursor: "pointer", fontSize: 16, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
