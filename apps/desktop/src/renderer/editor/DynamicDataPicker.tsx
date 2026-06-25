import React, { useMemo, useRef } from "react";
import {
  DYNAMIC_DATA_CATEGORY_LABELS,
  DYNAMIC_DATA_OPTIONS,
  DYNAMIC_TEMPLATE_PRESETS,
  DynamicDataCategory,
  DynamicDataContext,
  DynamicDataOption,
  DynamicTemplatePreset,
  insertDynamicToken,
  previewDynamicContext,
  resolveDynamicContent,
  tokenResolvedSample,
} from "./dynamicData";
import TokenPreviewTooltip from "./TokenPreviewTooltip";

type Props = {
  content: string;
  onChange: (value: string) => void;
  resolvedPreview?: string;
  previewContext?: DynamicDataContext;
  theme?: "light" | "dark";
};

function groupOptionsByCategory(options: DynamicDataOption[]) {
  const groups: Record<DynamicDataCategory, DynamicDataOption[]> = {
    valid_cycle: [],
    discount_days: [],
  };
  for (const opt of options) {
    groups[opt.category].push(opt);
  }
  return groups;
}

function tokenButtonStyle(isDark: boolean): React.CSSProperties {
  return {
    padding: "5px 10px",
    borderRadius: 999,
    border: `1px solid ${isDark ? "#475569" : "#cbd5e1"}`,
    background: isDark ? "#0f172a" : "#f8fafc",
    color: isDark ? "#e2e8f0" : "#334155",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  };
}

export default function DynamicDataPicker({
  content,
  onChange,
  resolvedPreview,
  previewContext,
  theme = "dark",
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDark = theme === "dark";
  const ctx = previewContext ?? previewDynamicContext();
  const grouped = useMemo(() => groupOptionsByCategory(DYNAMIC_DATA_OPTIONS), []);

  const insertToken = (token: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? start;
    const { value, cursor } = insertDynamicToken(content, token, start, end);
    onChange(value);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  };

  const applyPreset = (preset: DynamicTemplatePreset) => {
    onChange(preset.template);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const renderTokenButton = (opt: DynamicDataOption) => (
    <TokenPreviewTooltip
      key={opt.id}
      token={opt.token}
      resolvedSample={tokenResolvedSample(opt, ctx)}
      description={opt.description}
      theme={theme}
    >
      <button
        type="button"
        onClick={() => insertToken(opt.token)}
        style={tokenButtonStyle(isDark)}
      >
        + {opt.label}
      </button>
    </TokenPreviewTooltip>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#94a3b8" : "#64748b", textTransform: "uppercase" }}>
        Dynamic data
      </div>
      <p style={{ fontSize: 10, color: isDark ? "#64748b" : "#6b7280", margin: 0, lineHeight: 1.45 }}>
        Insert tokens that update from the flyer week and discount days. Hover any token to preview its sample output.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: isDark ? "#64748b" : "#6b7280" }}>Style presets</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {DYNAMIC_TEMPLATE_PRESETS.map(preset => (
            <TokenPreviewTooltip
              key={preset.id}
              token={preset.template}
              resolvedSample={resolveDynamicContent(preset.template, ctx)}
              description={preset.description}
              theme={theme}
            >
              <button
                type="button"
                onClick={() => applyPreset(preset)}
                style={{
                  ...tokenButtonStyle(isDark),
                  borderColor: content === preset.template
                    ? (isDark ? "#3b82f6" : "#2563eb")
                    : tokenButtonStyle(isDark).border as string,
                  background: content === preset.template
                    ? (isDark ? "#1e3a5f" : "#eff6ff")
                    : tokenButtonStyle(isDark).background as string,
                }}
              >
                {preset.label}
              </button>
            </TokenPreviewTooltip>
          ))}
        </div>
      </div>

      {(Object.keys(grouped) as DynamicDataCategory[]).map(category => {
        const options = grouped[category];
        if (options.length === 0) return null;
        return (
          <div key={category} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: isDark ? "#64748b" : "#6b7280", textTransform: "uppercase" }}>
              {DYNAMIC_DATA_CATEGORY_LABELS[category]}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {options.map(renderTokenButton)}
            </div>
          </div>
        );
      })}

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: isDark ? "#64748b" : "#6b7280" }}>Template text</span>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => onChange(e.target.value)}
          rows={4}
          placeholder={"Example:\n{{valid_start_long}} to {{valid_end_long}}.\n{{days_count}}\n{{dates}}"}
          style={{
            padding: "6px 8px",
            borderRadius: 4,
            border: `1px solid ${isDark ? "#475569" : "#cbd5e1"}`,
            background: isDark ? "#0f172a" : "#fff",
            color: isDark ? "#f8fafc" : "#111827",
            fontSize: 13,
            resize: "vertical",
            lineHeight: 1.35,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        />
      </label>

      {resolvedPreview != null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: isDark ? "#64748b" : "#6b7280" }}>Live preview (sample job data)</span>
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
              background: isDark ? "#020617" : "#f8fafc",
              color: isDark ? "#e2e8f0" : "#111827",
              fontSize: 12,
              whiteSpace: "pre-wrap",
              lineHeight: 1.35,
              minHeight: 40,
            }}
          >
            {resolvedPreview || "—"}
          </div>
        </div>
      )}
    </div>
  );
}
