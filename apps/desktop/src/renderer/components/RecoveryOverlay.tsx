// Full-screen overlay shown when the app is resuming after an unexpected shutdown.
// Displays a progress bar to indicate the system is rebooting; no "Start Fresh" — auto-resume only.

import React from "react";

type Props = {
  visible: boolean;
};

export default function RecoveryOverlay({ visible }: Props) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20000,
        background: "rgba(255, 255, 255, 0.97)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
      }}
      aria-live="polite"
      role="status"
      aria-label="Resuming your work"
    >
      <div
        style={{
          width: "min(360px, 90vw)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 15,
            color: "#495057",
            marginBottom: 24,
            fontWeight: 600,
          }}
        >
          Resuming your work…
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "#E9ECEF",
            overflow: "hidden",
          }}
        >
          <div
            className="recovery-progress-bar"
            style={{
              height: "100%",
              width: "40%",
              background: "linear-gradient(90deg, #4C6EF5, #748FFC)",
              borderRadius: 4,
              animation: "recovery-progress 1.4s ease-in-out infinite",
            }}
          />
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            color: "#868E96",
          }}
        >
          Restoring your drafts and session
        </div>
      </div>
      <style>{`
        @keyframes recovery-progress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}
