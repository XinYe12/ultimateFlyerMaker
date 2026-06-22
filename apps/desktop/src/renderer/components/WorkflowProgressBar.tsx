import React from "react";

const STEPS = [
  { label: "Choose Template" },
  { label: "Upload Discounts" },
  { label: "All Verified" },
  { label: "Export PDF" },
];

const COLOR_DONE    = "#22c55e"; // green
const COLOR_ACTIVE  = "#f59e0b"; // yellow/amber
const COLOR_FUTURE  = "transparent";
const BORDER_FUTURE = "#d1d5db";

type Props = {
  currentStep: number;
  onNavigate: (step: number) => void;
  onExportClick?: () => void;
};

export default function WorkflowProgressBar({ currentStep, onNavigate, onExportClick }: Props) {
  const handleClick = (index: number) => {
    // Enforce linear progression: only allow navigating to completed or current steps
    if (index > currentStep) return;
    if (index === 3) {
      onExportClick?.();
      return;
    }
    onNavigate(index);
  };

  return (
    <div style={{
      borderBottom: "1px solid #e5e7eb",
      padding: "7px 32px 8px",
      marginBottom: 6,
    }}>
      <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        {/* Grey track (full width) */}
        <div style={{
          position: "absolute",
          top: 13,
          left: 13,
          right: 13,
          height: 2,
          background: "#e5e7eb",
          zIndex: 0,
        }} />

        {/* Green fill: covers all completed segments */}
        {currentStep > 0 && (
          <div style={{
            position: "absolute",
            top: 13,
            left: 13,
            width: `calc(${(currentStep / (STEPS.length - 1)) * 100}% - ${(currentStep / (STEPS.length - 1)) * 26}px)`,
            height: 2,
            background: COLOR_DONE,
            zIndex: 1,
          }} />
        )}

        {STEPS.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive    = index === currentStep;
          const isFuture    = index > currentStep;
          const isClickable = index <= currentStep;

          const dotBg     = isCompleted ? COLOR_DONE : isActive ? COLOR_ACTIVE : COLOR_FUTURE;
          const dotBorder = isFuture ? `2px solid ${BORDER_FUTURE}` : "none";
          const dotColor  = isFuture ? "#9ca3af" : "#fff";
          const dotShadow = isActive ? `0 0 0 4px ${COLOR_ACTIVE}33` : "none";

          return (
            <div
              key={index}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                cursor: isClickable ? "pointer" : "default",
                zIndex: 2,
                userSelect: "none",
                opacity: isFuture ? 0.6 : 1,
              }}
              onClick={() => handleClick(index)}
              role="button"
              tabIndex={isClickable ? 0 : -1}
              aria-disabled={!isClickable}
              onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && isClickable) { e.preventDefault(); handleClick(index); } }}
              title={isFuture ? `Complete previous steps to unlock "${step.label}"` : step.label}
            >
              {/* Dot */}
              <div style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: isCompleted ? 12 : 11,
                background: dotBg,
                border: dotBorder,
                color: dotColor,
                boxShadow: dotShadow,
                transition: "all 200ms ease",
              }}>
                {isCompleted ? "✓" : `0${index + 1}`}
              </div>

              {/* Label */}
              <span style={{
                fontSize: 10,
                fontWeight: isActive ? 600 : 400,
                color: isCompleted ? COLOR_DONE : isActive ? "#92400e" : "#9ca3af",
                textAlign: "center",
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
