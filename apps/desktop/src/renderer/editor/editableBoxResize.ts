export type EditableBoxResizeHandle = "tl" | "tr" | "bl" | "br" | "t" | "r" | "b" | "l";

/** Department regions need a larger floor; editable text strips can be much smaller. */
export const MIN_REGION_SIZE = 80;
export const MIN_EDITABLE_BOX_WIDTH = 16;
export const MIN_EDITABLE_BOX_HEIGHT = 12;

export function resizeEditableBoxRect(
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  handle: EditableBoxResizeHandle,
  canvasW: number,
  canvasH: number,
  snap: (v: number) => number,
): { x: number; y: number; width: number; height: number } {
  const minW = MIN_EDITABLE_BOX_WIDTH;
  const minH = MIN_EDITABLE_BOX_HEIGHT;
  let x = sx;
  let y = sy;
  let width = sw;
  let height = sh;

  if (handle === "tl") {
    const nx = snap(Math.min(sx + dx, sx + sw - minW));
    const ny = snap(Math.min(sy + dy, sy + sh - minH));
    width = snap(Math.max(minW, sw - (nx - sx)));
    height = snap(Math.max(minH, sh - (ny - sy)));
    x = nx;
    y = ny;
  } else if (handle === "tr") {
    const ny = snap(Math.min(sy + dy, sy + sh - minH));
    height = snap(Math.max(minH, sh - (ny - sy)));
    width = snap(Math.max(minW, sw + dx));
    y = ny;
  } else if (handle === "bl") {
    const nx = snap(Math.min(sx + dx, sx + sw - minW));
    width = snap(Math.max(minW, sw - (nx - sx)));
    height = snap(Math.max(minH, sh + dy));
    x = nx;
  } else if (handle === "br") {
    width = snap(Math.max(minW, sw + dx));
    height = snap(Math.max(minH, sh + dy));
  } else if (handle === "t") {
    const ny = snap(Math.min(sy + dy, sy + sh - minH));
    height = snap(Math.max(minH, sh - (ny - sy)));
    y = ny;
  } else if (handle === "b") {
    height = snap(Math.max(minH, sh + dy));
  } else if (handle === "l") {
    const nx = snap(Math.min(sx + dx, sx + sw - minW));
    width = snap(Math.max(minW, sw - (nx - sx)));
    x = nx;
  } else if (handle === "r") {
    width = snap(Math.max(minW, sw + dx));
  }

  x = Math.max(0, x);
  y = Math.max(0, y);
  width = Math.min(width, canvasW - x);
  height = Math.min(height, canvasH - y);
  return { x, y, width, height };
}

export const EDITABLE_BOX_CORNER_HANDLES = ["tl", "tr", "bl", "br"] as const;
export const EDITABLE_BOX_EDGE_HANDLES = ["t", "r", "b", "l"] as const;

export function resizeHandleCursor(handle: EditableBoxResizeHandle): string {
  if (handle === "t" || handle === "b") return "ns-resize";
  if (handle === "l" || handle === "r") return "ew-resize";
  return handle === "tl" || handle === "br" ? "nwse-resize" : "nesw-resize";
}
