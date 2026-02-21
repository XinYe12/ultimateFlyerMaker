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
      return "linear-gradient(43deg, rgb(245, 245, 248) 0%, rgb(252, 252, 254) 50%, rgb(250, 250, 252) 100%)";
    case "uploading":
      return "linear-gradient(43deg, rgb(245, 245, 248) 0%, rgb(252, 252, 254) 50%, rgb(250, 250, 252) 100%)";
    case "in progress":
      return "linear-gradient(43deg, rgb(255, 230, 130) 0%, rgb(255, 242, 180) 50%, rgb(255, 248, 200) 100%)";
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
  onClick: () => void;
};

const TRACKERS = Array.from({ length: 25 }, (_, i) => `tr-${i + 1}`);

export default function DepartmentCard({
  department,
  label,
  progressText,
  statusLabel,
  status,
  onClick,
}: Props) {
  const gradient = getGradientForStatus(status);
  const hoverPrompt = getHoverPrompt(status);

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
