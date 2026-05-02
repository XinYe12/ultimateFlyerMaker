// 3D hover-tracking department card (based on Uiverse.io by kennyotsu)

import React from "react";
import "./DepartmentCard.css";

type DepartmentStatus =
  | "not started"
  | "uploading"
  | "in progress"
  | "done"
  | "done, edited";

function getGradientForStatus(status: DepartmentStatus): string {
  switch (status) {
    case "not started":
      return "linear-gradient(43deg, rgb(70, 72, 82) 0%, rgb(82, 85, 96) 50%, rgb(90, 93, 105) 100%)";
    case "uploading":
      return "linear-gradient(43deg, rgb(70, 72, 82) 0%, rgb(82, 85, 96) 50%, rgb(90, 93, 105) 100%)";
    case "in progress":
      return "linear-gradient(43deg, rgb(234, 179, 8) 0%, rgb(250, 200, 30) 50%, rgb(253, 212, 50) 100%)";
    case "done":
    case "done, edited":
      return "linear-gradient(43deg, rgb(140, 220, 150) 0%, rgb(180, 240, 190) 50%, rgb(200, 250, 210) 100%)";
  }
}

function getHoverPrompt(status: DepartmentStatus): string {
  switch (status) {
    case "not started":
      return "Click to start";
    case "uploading":
    case "in progress":
    case "done":
    case "done, edited":
      return "Click to edit";
  }
}

type Props = {
  department: string;
  label: string;
  progressText: string;
  statusLabel: string;
  status: DepartmentStatus;
  isLocked?: boolean;
  onClick: () => void;
};

const TRACKERS = Array.from({ length: 25 }, (_, i) => `tr-${i + 1}`);

export default function DepartmentCard({
  department,
  label,
  progressText,
  statusLabel,
  status,
  isLocked = false,
  onClick,
}: Props) {
  const gradient = isLocked
    ? "linear-gradient(43deg, rgb(34, 139, 80) 0%, rgb(46, 160, 96) 50%, rgb(56, 176, 108) 100%)"
    : getGradientForStatus(status);
  const hoverPrompt = isLocked ? "Verification Passed" : getHoverPrompt(status);

  return (
    <div
      className="dept-card-container noselect"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="dept-card-canvas">
        {TRACKERS.map((id) => (
          <div key={id} className={`dept-card-tracker ${id}`} />
        ))}
        <div
          className={`dept-card dept-card--${status.replace(/\s/g, "-").replace(/,/g, "")}`}
          style={
            {
              "--dept-card-gradient": gradient,
              background: gradient,
            } as React.CSSProperties
          }
        >
          {/* Always visible: department name, status (and progress only when batch upload performed) */}
          <div className="dept-card-title">{label}</div>
          <div
            className="dept-card-subtitle"
            data-status={status.replace(/\s/g, "-").replace(/,/g, "")}
          >
            {isLocked ? "✓ " : ""}
            {progressText
              ? `${progressText} • ${statusLabel}`
              : statusLabel}
          </div>
          {/* Shown on hover: action prompt */}
          <p className="dept-card-prompt">{hoverPrompt}</p>
        </div>
      </div>
    </div>
  );
}
