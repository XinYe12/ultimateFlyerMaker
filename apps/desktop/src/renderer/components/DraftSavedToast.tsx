// Draft-saved notification — Dynamic Island style pill with smooth enter/exit

import React, { useEffect, useState, useRef } from "react";

const DURATION_MS = 2500;
const EXIT_MS = 320;

type Props = {
  visible: boolean;
  onHide?: () => void;
};

export default function DraftSavedToast({ visible, onHide }: Props) {
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
      }, DURATION_MS);
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
  }, [visible, onHide]);

  if (!visible && !isExiting) return null;

  return (
    <div
      className="draft-saved-toast"
      data-exiting={isExiting || undefined}
      aria-live="polite"
      role="status"
    >
      <div className="draft-saved-toast-pill">
        <span className="draft-saved-toast-icon" aria-hidden>
          ✓
        </span>
        <span className="draft-saved-toast-text">Draft saved</span>
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
          background: rgba(52, 199, 89, 0.9);
          color: #fff;
          border-radius: 50%;
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
        }
        .draft-saved-toast-text {
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
