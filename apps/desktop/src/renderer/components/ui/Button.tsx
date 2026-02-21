// Shared Button component with design token styling

import React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
};

const baseStyles: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontWeight: "var(--font-semibold)",
  cursor: "pointer",
  border: "none",
  borderRadius: "var(--radius-sm)",
  transition: "background 0.15s, color 0.15s, border-color 0.15s",
};

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "var(--color-primary)",
    color: "#fff",
  },
  secondary: {
    background: "var(--color-bg-subtle)",
    color: "var(--color-text)",
    border: "1.5px solid var(--color-border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-text-muted)",
  },
  danger: {
    background: "#FFF5F5",
    color: "var(--color-error)",
    border: "1px solid #FFE3E3",
  },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: { padding: "6px 12px", fontSize: "var(--text-sm)" },
  md: { padding: "8px 16px", fontSize: "var(--text-base)" },
  lg: { padding: "12px 24px", fontSize: "var(--text-lg)" },
};

export default function Button({
  variant = "primary",
  size = "md",
  disabled,
  style,
  onMouseEnter,
  onMouseLeave,
  ...props
}: ButtonProps) {
  const variantStyle = variantStyles[variant];
  const sizeStyle = sizeStyles[size];

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (variant === "primary") {
      e.currentTarget.style.background = "var(--color-primary-hover)";
    } else if (variant === "secondary") {
      e.currentTarget.style.background = "#E9ECEF";
      e.currentTarget.style.borderColor = "#ADB5BD";
    } else if (variant === "danger") {
      e.currentTarget.style.background = "#FFE3E3";
    }
    onMouseEnter?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (variant === "primary") {
      e.currentTarget.style.background = "var(--color-primary)";
    } else if (variant === "secondary") {
      e.currentTarget.style.background = "var(--color-bg-subtle)";
      e.currentTarget.style.borderColor = "var(--color-border)";
    } else if (variant === "danger") {
      e.currentTarget.style.background = "#FFF5F5";
    }
    onMouseLeave?.(e);
  };

  return (
    <button
      style={{
        ...baseStyles,
        ...variantStyle,
        ...sizeStyle,
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
      disabled={disabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    />
  );
}
