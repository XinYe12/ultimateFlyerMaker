// Dynamic Island style pill toast — supports success and error variants

import React, { useEffect, useState, useRef } from "react";

const EXIT_MS = 320;

type Props = {
  visible: boolean;
  onHide?: () => void;
  message?: string;
  variant?: "success" | "error";
  duration?: number;
  canUndo?: boolean;
  onUndo?: () => void;
};

export default function DraftSavedToast({
  visible,
  onHide,
  message = "Draft saved",
  variant = "success",
  duration = 12500,
  canUndo,
  onUndo,
}: Props) {
  const [isExiting, setIsExiting] = useState(false);
  const wasVisible = useRef(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      wasVisible.current = true;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        onHide?.();
      }, duration);
    } else if (wasVisible.current) {
      setIsExiting(true);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      exitTimer.current = setTimeout(() => {
        setIsExiting(false);
        wasVisible.current = false;
        exitTimer.current = null;
      }, EXIT_MS);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, [visible, onHide, duration]);

  if (!visible && !isExiting) return null;

  const iconBg =
    variant === "error"
      ? "rgba(201, 42, 42, 0.9)"
      : "rgba(52, 199, 89, 0.9)";
  const icon = variant === "error" ? "!" : "\u2713";

  return (
    <div
      className="draft-saved-toast"
      data-exiting={isExiting || undefined}
      aria-live="polite"
      role="status"
    >
      <div className="draft-saved-toast-pill">
        <span
          className="draft-saved-toast-icon"
          aria-hidden
          style={{ background: iconBg }}
        >
          {icon}
        </span>
        <span className="draft-saved-toast-text">{message}</span>
        {canUndo && onUndo && (
          <button
            className="draft-saved-toast-undo"
            onClick={(e) => {
              e.stopPropagation();
              onUndo();
            }}
          >
            ↩ Undo
          </button>
        )}
      </div>
      <style>{`
        .draft-saved-toast {
          position: fixed;
          top: 0;
          left: 50%;
          transform: translateX(-50%) translateY(-100%);
          z-index: 9999;
          padding: 12px 0 24px;
          pointer-events: none;
          opacity: 0;
          transition:
            transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
            opacity 0.35s ease-out;
        }
        .draft-saved-toast[data-exiting] {
          transform: translateX(-50%) translateY(-100%);
          opacity: 0;
          transition:
            transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
            opacity 0.25s ease-in;
        }
        .draft-saved-toast:not([data-exiting]) {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
        .draft-saved-toast-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px 10px 14px;
          background: rgba(28, 28, 30, 0.92);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-radius: 22px;
          box-shadow:
            0 4px 24px rgba(0, 0, 0, 0.25),
            0 0 1px rgba(255, 255, 255, 0.08) inset;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.95);
          letter-spacing: 0.01em;
        }
        .draft-saved-toast-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          color: #fff;
          border-radius: 50%;
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
        }
        .draft-saved-toast-text {
          white-space: nowrap;
        }
        .draft-saved-toast-undo {
          margin-left: 4px;
          padding: 3px 10px;
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 12px;
          color: rgba(255, 255, 255, 0.95);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          pointer-events: auto;
          white-space: nowrap;
          transition: background 0.15s;
        }
        .draft-saved-toast-undo:hover {
          background: rgba(255, 255, 255, 0.28);
        }
      `}</style>
    </div>
  );
}
