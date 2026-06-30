import React from "react";
import {
  EditableBoxResizeHandle,
  EDITABLE_BOX_CORNER_HANDLES,
  EDITABLE_BOX_EDGE_HANDLES,
  resizeHandleCursor,
} from "./editableBoxResize";

const CORNER_ARM = 7;
const CORNER_STROKE = 1.5;
const HIT = 12;

type Props = {
  onHandleMouseDown: (e: React.MouseEvent, handle: EditableBoxResizeHandle) => void;
};

function cornerBracketStyle(corner: (typeof EDITABLE_BOX_CORNER_HANDLES)[number]): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    width: CORNER_ARM,
    height: CORNER_ARM,
    borderColor: "#2563eb",
    borderStyle: "solid",
    borderWidth: 0,
    pointerEvents: "none",
    boxSizing: "border-box",
  };
  if (corner === "tl") return { ...base, top: 0, left: 0, borderTopWidth: CORNER_STROKE, borderLeftWidth: CORNER_STROKE };
  if (corner === "tr") return { ...base, top: 0, right: 0, borderTopWidth: CORNER_STROKE, borderRightWidth: CORNER_STROKE };
  if (corner === "bl") return { ...base, bottom: 0, left: 0, borderBottomWidth: CORNER_STROKE, borderLeftWidth: CORNER_STROKE };
  return { ...base, bottom: 0, right: 0, borderBottomWidth: CORNER_STROKE, borderRightWidth: CORNER_STROKE };
}

function cornerHitStyle(corner: (typeof EDITABLE_BOX_CORNER_HANDLES)[number]): React.CSSProperties {
  const half = HIT / 2;
  if (corner === "tl") return { top: -half, left: -half };
  if (corner === "tr") return { top: -half, right: -half };
  if (corner === "bl") return { bottom: -half, left: -half };
  return { bottom: -half, right: -half };
}

function edgeHitStyle(edge: (typeof EDITABLE_BOX_EDGE_HANDLES)[number]): React.CSSProperties {
  const thickness = 6;
  if (edge === "t") return { top: -thickness / 2, left: CORNER_ARM, right: CORNER_ARM, height: thickness };
  if (edge === "b") return { bottom: -thickness / 2, left: CORNER_ARM, right: CORNER_ARM, height: thickness };
  if (edge === "l") return { left: -thickness / 2, top: CORNER_ARM, bottom: CORNER_ARM, width: thickness };
  return { right: -thickness / 2, top: CORNER_ARM, bottom: CORNER_ARM, width: thickness };
}

/** Minimal L-bracket corners + invisible edge hit strips for editable field resize. */
export default function EditableBoxResizeHandles({ onHandleMouseDown }: Props) {
  return (
    <>
      {EDITABLE_BOX_CORNER_HANDLES.map(corner => (
        <div
          key={corner}
          style={{
            position: "absolute",
            width: HIT,
            height: HIT,
            cursor: resizeHandleCursor(corner),
            zIndex: 3,
            ...cornerHitStyle(corner),
          }}
          onMouseDown={e => {
            e.stopPropagation();
            onHandleMouseDown(e, corner);
          }}
        >
          <div style={cornerBracketStyle(corner)} />
        </div>
      ))}
      {EDITABLE_BOX_EDGE_HANDLES.map(edge => (
        <div
          key={edge}
          style={{
            position: "absolute",
            cursor: resizeHandleCursor(edge),
            zIndex: 2,
            ...edgeHitStyle(edge),
          }}
          onMouseDown={e => {
            e.stopPropagation();
            onHandleMouseDown(e, edge);
          }}
        />
      ))}
    </>
  );
}

export const EDITABLE_BOX_SELECTION_BORDER = "1px solid #2563eb";
