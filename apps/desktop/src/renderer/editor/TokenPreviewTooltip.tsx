import React, { useId, useRef, useState } from "react";

type Props = {
  token: string;
  resolvedSample: string;
  description?: string;
  theme?: "light" | "dark";
  children: React.ReactElement;
};

const SHOW_DELAY_MS = 200;
const HIDE_DELAY_MS = 80;

export default function TokenPreviewTooltip({
  token,
  resolvedSample,
  description,
  theme = "dark",
  children,
}: Props) {
  const tooltipId = useId();
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const isDark = theme === "dark";

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
  };

  const handleEnter = () => {
    clearTimers();
    showTimer.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
  };

  const handleLeave = () => {
    clearTimers();
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  };

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {children}
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 0,
            transform: "none",
            zIndex: 9999,
            minWidth: 180,
            maxWidth: 280,
            padding: "8px 10px",
            borderRadius: 8,
            border: `1px solid ${isDark ? "#334155" : "#cbd5e1"}`,
            background: isDark ? "#0f172a" : "#ffffff",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.18)",
            pointerEvents: "none",
            whiteSpace: "normal",
          }}
        >
          <span
            style={{
              display: "block",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 10,
              color: isDark ? "#94a3b8" : "#64748b",
              lineHeight: 1.35,
              marginBottom: 4,
            }}
          >
            {token}
          </span>
          <span
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: isDark ? "#f8fafc" : "#0f172a",
              lineHeight: 1.35,
              whiteSpace: "pre-wrap",
            }}
          >
            → {resolvedSample || "—"}
          </span>
          {description && (
            <span
              style={{
                display: "block",
                marginTop: 4,
                fontSize: 10,
                color: isDark ? "#64748b" : "#6b7280",
                lineHeight: 1.35,
              }}
            >
              {description}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
