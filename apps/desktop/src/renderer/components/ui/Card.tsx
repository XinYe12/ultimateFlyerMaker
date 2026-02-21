// Shared Card component for bordered containers

import React from "react";

type CardProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export default function Card({ children, style }: CardProps) {
  return (
    <div
      style={{
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
