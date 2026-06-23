import React from "react";
import { CardStyleDef, DepartmentAreaDef, GridLayoutDef } from "./loadFlyerTemplateConfig";
import { autoLayoutCards, AUTOMATION_COLS_PER_ROW } from "../../../../shared/flyer/layout/autoLayoutCards";
import { computeCardRects } from "../../../../shared/flyer/layout/layoutCardRows";
// @ts-expect-error shared JS module
import { computeProductGrid } from "../../../../shared/flyer/layout/computeProductGrid.js";

export { AUTOMATION_COLS_PER_ROW };

/** Sample cell position/size relative to department productRegion (wizard step 2 only). */
export type SampleCellDef = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const DEFAULT_ROWS = 3;
export const DEFAULT_COLS = AUTOMATION_COLS_PER_ROW;
const MIN_CELL = 48;
export const TARGET_CELL_SIZE_MIN = 1;
export const TARGET_CELL_SIZE_MAX = 100;

export function clampTargetCellSize(v: number): number {
  return Math.max(TARGET_CELL_SIZE_MIN, Math.min(TARGET_CELL_SIZE_MAX, Math.round(v)));
}

export function gridInnerBounds(
  region: { width: number; height: number },
  gridLayout: GridLayoutDef = {}
) {
  const insetTop = Math.max(0, gridLayout.insetTop ?? 0);
  const insetLeft = Math.max(0, gridLayout.insetLeft ?? 0);
  const insetRight = Math.max(0, gridLayout.insetRight ?? 0);
  const insetBottom = Math.max(0, gridLayout.insetBottom ?? 0);
  return {
    width: Math.max(0, region.width - insetLeft - insetRight),
    height: Math.max(0, region.height - insetTop - insetBottom),
  };
}

/** How many rows/cols fit a target cell size inside padded grid bounds. */
export function suggestRowsColsForCellSize(
  region: { width: number; height: number },
  cellW: number,
  cellH: number,
  gridLayout: GridLayoutDef = {}
): { rows: number; cols: number } {
  const gap = Math.max(0, gridLayout.cellGap ?? 0);
  const inner = gridInnerBounds(region, gridLayout);
  const w = Math.max(TARGET_CELL_SIZE_MIN, cellW);
  const h = Math.max(TARGET_CELL_SIZE_MIN, cellH);
  const cols = Math.max(1, Math.floor((inner.width + gap) / (w + gap)));
  const rows = Math.max(1, Math.floor((inner.height + gap) / (h + gap)));
  return { rows, cols };
}

/** Actual cell dimensions produced by the current grid config. */
export function getComputedCellSize(
  area: DepartmentAreaDef
): { width: number; height: number } | null {
  const rows = Math.max(1, area.rows ?? DEFAULT_ROWS);
  const cols = Math.max(1, area.cols ?? DEFAULT_COLS);
  const { cells } = computeProductGrid(area.productRegion, rows, cols, area.gridLayout ?? {});
  const cell = cells[0];
  if (!cell) return null;
  return { width: cell.width, height: cell.height };
}

/** Sensible initial target — roughly 5×4 cells instead of a few huge blocks. */
export function defaultTargetCellSize(
  region: { width: number; height: number },
  gridLayout: GridLayoutDef = {}
): { width: number; height: number } {
  const gl = gridLayout.insetTop != null ? gridLayout : defaultGridPadding(region);
  const inner = gridInnerBounds(region, gl);
  const gap = gl.cellGap ?? 0;
  const cols = 5;
  const rows = 4;
  return {
    width: Math.max(MIN_CELL, Math.floor((inner.width - gap * (cols - 1)) / cols)),
    height: Math.max(MIN_CELL, Math.floor((inner.height - gap * (rows - 1)) / rows)),
  };
}

export function resolveTargetCellSize(
  area: DepartmentAreaDef & { sampleCell?: SampleCellDef }
): { width: number; height: number } {
  const gl = area.gridLayout ?? defaultGridPadding(area.productRegion);
  if (area.gridLayout?.targetCellWidth && area.gridLayout?.targetCellHeight) {
    return {
      width: clampTargetCellSize(area.gridLayout.targetCellWidth),
      height: clampTargetCellSize(area.gridLayout.targetCellHeight),
    };
  }
  if (area.sampleCell) {
    return {
      width: clampTargetCellSize(area.sampleCell.width),
      height: clampTargetCellSize(area.sampleCell.height),
    };
  }
  const defaults = defaultTargetCellSize(area.productRegion, gl);
  return {
    width: clampTargetCellSize(defaults.width),
    height: clampTargetCellSize(defaults.height),
  };
}

export function defaultCardStyle(): CardStyleDef {
  return {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    hasShadow: false,
  };
}

/** Pleasing inset/gap defaults — ~4% of the shorter department edge. */
export function defaultGridPadding(region: { width: number; height: number }): GridLayoutDef {
  const pad = Math.max(10, Math.round(Math.min(region.width, region.height) * 0.04));
  const gap = Math.max(6, Math.round(pad * 0.65));
  return {
    insetTop: pad,
    insetLeft: pad,
    insetRight: pad,
    insetBottom: pad,
    cellGap: gap,
  };
}

export function createSampleCell(region: { width: number; height: number }, snap: (v: number) => number): SampleCellDef {
  const w = snap(Math.max(MIN_CELL, region.width * 0.3));
  const h = snap(Math.max(MIN_CELL, region.height * 0.32));
  return {
    x: snap((region.width - w) / 2),
    y: snap((region.height - h) / 2),
    width: w,
    height: h,
  };
}

export function cellBoxShadow(cs: CardStyleDef, selected: boolean): string | undefined {
  if (cs.hasShadow) return "0 2px 8px rgba(15, 23, 42, 0.18)";
  if (selected) return "0 0 0 2px #3b82f6";
  return undefined;
}

export function renderStyledCell(
  cs: CardStyleDef,
  rect: { x: number; y: number; width: number; height: number },
  scale: number,
  selected: boolean,
  key?: string,
  opts?: { previewAlpha?: number }
) {
  const bw = Math.max(0, cs.borderWidth ?? 0);
  const bg = cs.backgroundColor ?? "#ffffff";
  const alpha = opts?.previewAlpha;
  const background = alpha != null && alpha < 1
    ? `${bg}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`
    : bg;
  return (
    <div
      key={key}
      style={{
        position: "absolute",
        left: rect.x * scale,
        top: rect.y * scale,
        width: rect.width * scale,
        height: rect.height * scale,
        border: bw > 0 ? `${bw * scale}px solid ${cs.borderColor ?? "#cbd5e1"}` : undefined,
        background,
        boxSizing: "border-box",
        pointerEvents: "none",
        borderRadius: (cs.borderRadius ?? 0) * scale,
        boxShadow: cellBoxShadow(cs, selected),
      }}
    />
  );
}

export function renderDepartmentGrid(
  area: DepartmentAreaDef & { id: string },
  scale: number,
  selected: boolean,
  opts?: { previewAlpha?: number }
) {
  const cs: CardStyleDef = area.cardStyle ?? defaultCardStyle();
  const rows = Math.max(1, area.rows ?? DEFAULT_ROWS);
  const cols = Math.max(1, area.cols ?? DEFAULT_COLS);
  const { cells } = computeProductGrid(area.productRegion, rows, cols, area.gridLayout ?? {});

  return cells.map((cell: { x: number; y: number; width: number; height: number; row: number; col: number }) => {
    const rel = {
      x: cell.x - area.productRegion.x,
      y: cell.y - area.productRegion.y,
      width: cell.width,
      height: cell.height,
    };
    return renderStyledCell(cs, rel, scale, selected, `${area.id}-${cell.row}-${cell.col}`, opts);
  });
}

/** Same grid layout the automation editor uses — dynamic cols per row, adjustable row count. */
export function automationGridCardsForArea(
  area: DepartmentAreaDef,
  itemIds: string[] = []
) {
  const rows = Math.max(1, area.rows ?? DEFAULT_ROWS);
  const cards = autoLayoutCards({
    itemIds,
    regionWidth: area.productRegion.width,
    defaultRows: rows,
    targetRows: rows,
  });
  const cols = cards.length > 0
    ? Math.max(...cards.map(c => c.order + 1))
    : AUTOMATION_COLS_PER_ROW;
  return { cards, rows, cols };
}

/** Apply automation defaults to a department area (rows + 3-wide empty grid baseline). */
export function withAutomationGridDefaults(area: DepartmentAreaDef): DepartmentAreaDef {
  const rows = Math.max(1, area.rows ?? DEFAULT_ROWS);
  return {
    ...area,
    rows,
    cols: AUTOMATION_COLS_PER_ROW,
    gridLayout: area.gridLayout ?? defaultGridPadding(area.productRegion),
  };
}

/** Preview product grid on the wizard canvas using the automation pipeline layout. */
export function renderAutomationGridPreview(
  area: DepartmentAreaDef & { id: string },
  scale: number,
  selected: boolean,
  opts?: { previewAlpha?: number }
) {
  const cs: CardStyleDef = area.cardStyle ?? defaultCardStyle();
  const { cards, rows } = automationGridCardsForArea(area);
  const rects = computeCardRects({ cards, region: area.productRegion, rows });

  return rects.map((rect, i) => {
    const rel = {
      x: rect.x - area.productRegion.x,
      y: rect.y - area.productRegion.y,
      width: rect.width,
      height: rect.height,
    };
    return renderStyledCell(cs, rel, scale, selected, `${area.id}-auto-${i}`, opts);
  });
}

export function renderReadonlyDepartmentFill(
  area: DepartmentAreaDef & { id: string },
  scale: number
) {
  const r = area.productRegion;
  const regionBg = area.regionStyle?.backgroundColor ?? "#f1f5f9";
  const regionRadius = (area.regionStyle?.borderRadius ?? 0) * scale;
  return (
    <div
      style={{
        position: "absolute",
        left: r.x * scale,
        top: r.y * scale,
        width: r.width * scale,
        height: r.height * scale,
        overflow: "hidden",
        pointerEvents: "none",
        background: regionBg,
        borderRadius: regionRadius,
        ...(regionRadius > 0 ? { clipPath: `inset(0 round ${regionRadius}px)` } : {}),
        boxSizing: "border-box",
      }}
    />
  );
}
