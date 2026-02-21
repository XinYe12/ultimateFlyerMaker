// apps/desktop/src/renderer/editor/EditorSidebar.tsx
// A single dropdown-button for switching departments in the editor toolbar.

import React, { useEffect, useRef } from "react";

const DEPARTMENT_LABELS: Record<string, string> = {
  grocery: "Grocery",
  frozen: "Frozen",
  hot_food: "Hot Food",
  sushi: "Sushi",
  meat: "Meat",
  seafood: "Seafood",
  fruit: "Fruit",
  vegetable: "Vegetable",
  hot_sale: "Hot Sale",
  produce: "Produce",
};

type Props = {
  isOpen: boolean;
  onToggle: () => void;
  departments: string[];
  activeDepartment: string;
  onDepartmentChange: (dept: string) => void;
  itemCount?: number;
  onClear?: () => void;
};

export default function EditorSidebar({
  isOpen,
  onToggle,
  departments,
  activeDepartment,
  onDepartmentChange,
  itemCount,
  onClear,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close panel on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onToggle();
      }
    };
    // Use capture so we catch clicks before React's synthetic event system swallows them
    window.addEventListener("mousedown", handleClick, true);
    return () => window.removeEventListener("mousedown", handleClick, true);
  }, [isOpen, onToggle]);

  const activeLabel = DEPARTMENT_LABELS[activeDepartment] || activeDepartment;

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Single toggle button */}
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "7px 14px",
          border: "1.5px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          background: isOpen ? "var(--color-bg-subtle)" : "var(--color-bg)",
          color: "var(--color-text)",
          fontWeight: 600,
          fontSize: "var(--text-base)",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-subtle)"; }}
        onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = "var(--color-bg)"; }}
      >
        {/* Hamburger icon */}
        <span style={{ fontSize: 13, lineHeight: 1, display: "flex", flexDirection: "column", gap: 2.5 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ display: "block", width: 14, height: 1.5, background: "currentColor", borderRadius: 1 }} />
          ))}
        </span>
        {activeLabel}
        <span style={{ fontSize: 9, marginLeft: 1, opacity: 0.6 }}>{isOpen ? "▲" : "▼"}</span>
      </button>

      {/* Floating dropdown panel */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 400,
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: "6px",
            minWidth: 180,
          }}
        >
          {departments.map((dept) => {
            const label = DEPARTMENT_LABELS[dept] || dept;
            const isActive = activeDepartment === dept;
            return (
              <button
                key={dept}
                onClick={() => {
                  onDepartmentChange(dept);
                  onToggle();
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  background: isActive ? "var(--color-primary)" : "transparent",
                  color: isActive ? "#fff" : "var(--color-text)",
                  fontWeight: isActive ? 600 : 500,
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: "var(--text-base)",
                  fontFamily: "var(--font-sans)",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "var(--color-bg-subtle)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                {label}
              </button>
            );
          })}

          {/* Clear department — only when there are items */}
          {onClear && (itemCount ?? 0) > 0 && (
            <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 4, paddingTop: 4 }}>
              <button
                onClick={() => {
                  const label = DEPARTMENT_LABELS[activeDepartment] || activeDepartment;
                  const confirmed = confirm(
                    `Clear all products from "${label}"?\n\nThis cannot be undone.`
                  );
                  if (confirmed) {
                    onClear!();
                    onToggle();
                  }
                }}
                style={{
                  width: "100%",
                  padding: "7px 12px",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  background: "transparent",
                  color: "var(--color-error)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "var(--font-sans)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#FFF5F5"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                Clear Department
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
