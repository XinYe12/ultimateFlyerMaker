import React from "react";
import { CustomBoxDef, DepartmentAreaDef, RegionStyleDef } from "./loadFlyerTemplateConfig";

export type TextDragState = {
  boxId: string;
  startMouseX: number;
  startMouseY: number;
  startOffsetX: number;
  startOffsetY: number;
};

export function defaultRegionStyle(departmentKey: string): RegionStyleDef {
  const DEPT_BG: Record<string, string> = {
    grocery: "#dcfce7",
    meat: "#fee2e2",
    produce: "#ecfccb",
    frozen: "#dbeafe",
    seafood: "#cffafe",
    hot_food: "#ffedd5",
    dairy: "#ede9fe",
    bakery: "#fef3c7",
    sushi: "#fce7f3",
  };
  return {
    backgroundColor: DEPT_BG[departmentKey] ?? "#f1f5f9",
    borderRadius: 0,
  };
}

export function renderImportBoxOverlay(
  box: CustomBoxDef,
  scale: number,
  isSelected: boolean,
  outlineOnly: boolean,
  onTextDragStart?: (e: React.MouseEvent, box: CustomBoxDef) => void
) {
  const textContent = box.content?.trim() ? box.content : (box.label ?? "");
  const fillOpacity = outlineOnly ? (isSelected ? "22" : "00") : isSelected ? "44" : "22";
  const bgColor = box.boxType === "image"
    ? "rgba(148,163,184,0.25)"
    : `${box.color}${fillOpacity}`;

  const isVerticalLabel = box.width < box.height * 0.45 && box.height > 40;
  const innerStyle: React.CSSProperties = {
    padding: "2px 6px",
    color: box.textColor,
    fontWeight: box.boxType === "text" ? 600 : 700,
    fontSize: Math.max(8, (box.fontSize ?? 24) * scale),
    lineHeight: 1.15,
    textAlign: box.textAlign ?? (isVerticalLabel ? "center" : "left"),
    fontFamily: box.fontFamily || undefined,
    userSelect: "none",
    whiteSpace: "pre-wrap",
    pointerEvents: onTextDragStart && isSelected ? "auto" : "none",
    cursor: onTextDragStart && isSelected ? "grab" : "default",
    ...(isVerticalLabel ? { writingMode: "vertical-rl", textOrientation: "mixed" } : {}),
  };

  const hasFreePos = box.textOffsetX != null || box.textOffsetY != null;

  return (
    <>
      <div
        style={{
          position: "absolute", inset: 0,
          background: bgColor,
          borderRadius: (box.borderRadius ?? 0) * scale,
          pointerEvents: "none",
        }}
      />
      {hasFreePos ? (
        <div
          style={{
            position: "absolute",
            left: (box.textOffsetX ?? 0) * scale,
            top: (box.textOffsetY ?? 0) * scale,
            pointerEvents: onTextDragStart ? "auto" : "none",
          }}
          onMouseDown={isSelected && onTextDragStart ? (e) => onTextDragStart(e, box) : undefined}
        >
          <div style={innerStyle}>{textContent}</div>
        </div>
      ) : (
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex",
            alignItems: box.textVertical === "middle" ? "center" : box.textVertical === "bottom" ? "flex-end" : "flex-start",
            justifyContent: box.textAlign === "center" ? "center" : box.textAlign === "right" ? "flex-end" : "flex-start",
            overflow: "hidden",
            pointerEvents: onTextDragStart ? "auto" : "none",
          }}
          onMouseDown={isSelected && onTextDragStart ? (e) => onTextDragStart(e, box) : undefined}
        >
          <div style={innerStyle}>{textContent}</div>
        </div>
      )}
      {box.isEditable && (
        <div style={{ position: "absolute", top: 2, right: 2, fontSize: 8, background: "#f59e0b", color: "#fff", padding: "1px 4px", borderRadius: 3, pointerEvents: "none" }}>
          {box.fieldKind ?? "field"}
        </div>
      )}
    </>
  );
}
