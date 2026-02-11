// apps/desktop/src/renderer/components/DepartmentSelector.tsx

import React from "react";

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

export default function DepartmentSelector({
  value,
  onChange,
  departments: departmentsProp,
  itemCount,
  onClear,
}: {
  value: string;
  onChange: (id: string) => void;
  departments?: string[];
  /** Number of items in the currently selected department (controls Clear button visibility) */
  itemCount?: number;
  /** Called when user confirms clearing the current department */
  onClear?: () => void;
}) {
  const departments = departmentsProp ?? Object.keys(DEPARTMENT_LABELS);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "8px 16px",
        overflowX: "auto",
        whiteSpace: "nowrap",
        background: "transparent",
        borderBottom: "1px solid #ddd",
        alignItems: "center",
      }}
    >
      {departments.map((dept) => {
        const label = DEPARTMENT_LABELS[dept] || dept;
        const isActive = value === dept;

        return (
          <button
            key={dept}
            onClick={() => onChange(dept)}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: 20,
              background: isActive ? "#4C6EF5" : "#F1F3F5",
              color: isActive ? "#fff" : "#333",
              fontWeight: isActive ? 600 : 500,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {label}
          </button>
        );
      })}

      {/* Clear current department — only visible when there are items */}
      {onClear && (itemCount ?? 0) > 0 && (
        <>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => {
              const label = DEPARTMENT_LABELS[value] || value;
              const confirmed = confirm(
                `Clear all products from "${label}"?\n\nThis will remove all images and price labels for this department. This cannot be undone.`
              );
              if (confirmed) onClear();
            }}
            style={{
              padding: "6px 14px",
              border: "1px solid #E03131",
              borderRadius: 6,
              background: "#FFF5F5",
              color: "#C92A2A",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Clear Department
          </button>
        </>
      )}
    </div>
  );
}
