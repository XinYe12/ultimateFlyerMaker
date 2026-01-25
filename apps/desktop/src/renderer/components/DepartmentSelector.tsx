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
};

export default function DepartmentSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const departments = Object.keys(DEPARTMENT_LABELS);

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
    </div>
  );
}
