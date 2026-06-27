import type { CardDef } from "../../../../shared/flyer/layout/layoutCardRows";
import { deriveRowCount, deriveActiveRowCount } from "../../../../shared/flyer/layout/layoutCardRows";
import { autoLayoutCards } from "../../../../shared/flyer/layout/autoLayoutCards";
import {
  DepartmentAreaDef,
  findDepartmentArea,
  findPageForDepartment,
  FlyerTemplateConfig,
  isCardDepartment,
  CardStyleDef,
} from "./loadFlyerTemplateConfig";
import { DEFAULT_ROWS } from "./importWizardCellHelpers";

export type CardLayoutOpts = {
  targetRows?: number;
};

function cardDefaultsFromTemplateStyle(cs?: CardStyleDef): Partial<CardDef> {
  if (!cs) return {};
  const patch: Partial<CardDef> = {};
  if (cs.titleColor) patch.titleColor = cs.titleColor;
  if (cs.priceColor) patch.priceColor = cs.priceColor;
  if (cs.orientation) patch.orientation = cs.orientation;
  return patch;
}

function applyTemplateStyleToCards(cards: CardDef[], area: DepartmentAreaDef | null): CardDef[] {
  const defaults = cardDefaultsFromTemplateStyle(area?.cardStyle);
  if (!Object.keys(defaults).length) return cards;
  return cards.map(c => ({ ...defaults, ...c }));
}

/**
 * Auto-compute the ideal row count from product count and region dimensions.
 * Targets portrait-ish cells (~1.5 height/width ratio) that fill the region naturally.
 * Result: 1 product → 1 row, 16 products in an 800×600 region → ~4 rows.
 */
export function computeAutoRows(
  itemCount: number,
  region: { width: number; height: number },
): number {
  if (itemCount <= 1) return 1;
  const TARGET_CELL_ASPECT = 1.5; // target height/width ratio for a product cell
  const regionAspect = region.width / Math.max(1, region.height);
  const rowsRaw = Math.sqrt(itemCount * TARGET_CELL_ASPECT / regionAspect);
  const rows = Math.max(1, Math.round(rowsRaw));
  return Math.min(rows, itemCount); // never more rows than items
}

/** Card layout for a department — original dynamic row/column packing. */
export function buildCardLayoutForDepartment(
  config: FlyerTemplateConfig,
  department: string,
  itemIds: string[] = [],
  opts?: CardLayoutOpts
): CardDef[] {
  const area = findDepartmentArea(config, department);
  if (area) {
    // Auto-compute rows from product count; user's explicit targetRows (from toolbar) overrides
    const autoRows = computeAutoRows(itemIds.length, area.productRegion);
    const cards = autoLayoutCards({
      itemIds,
      regionWidth: area.productRegion.width,
      targetRows: opts?.targetRows ?? autoRows,
    });
    return applyTemplateStyleToCards(cards, area);
  }

  const page = findPageForDepartment(config, department);
  const deptDef = page?.departments[department];
  if (deptDef && isCardDepartment(deptDef)) {
    const autoRows = computeAutoRows(itemIds.length, deptDef.region);
    return autoLayoutCards({
      itemIds,
      regionWidth: deptDef.region.width,
      targetRows: opts?.targetRows ?? autoRows,
    });
  }

  return autoLayoutCards({ itemIds, regionWidth: 800, targetRows: opts?.targetRows });
}

/** True when layout is missing, empty, or does not cover all current item ids. */
export function cardLayoutNeedsRebuild(
  layout: CardDef[] | undefined | null,
  itemIds: string[]
): boolean {
  if (!layout?.length) return true;
  const assigned = layout.map(c => c.itemId).filter(Boolean) as string[];
  if (assigned.length !== itemIds.length) return true;
  const assignedSet = new Set(assigned);
  return !itemIds.every(id => assignedSet.has(id));
}

/** Preserve per-card editor overrides when rebuilding layout for new items. */
function mergeCardPreservation(
  next: CardDef[],
  prev?: CardDef[] | null
): CardDef[] {
  if (!prev?.length) return next;
  const byItem = new Map(
    prev.filter(c => c.itemId).map(c => [c.itemId as string, c])
  );
  return next.map(card => {
    if (!card.itemId) return card;
    const old = byItem.get(card.itemId);
    if (!old) return card;
    const preserved: Partial<CardDef> = {};
    const keys = [
      "contentScale", "imageScale", "titleScale", "priceScale", "rowSpan",
      "imageRotation", "imageOffsetX", "imageOffsetY", "orientation",
      "cropLeft", "cropRight", "cropTop", "cropBottom",
      "titleFontFamily", "titleColor", "titleItalic", "titleBg", "titleBgPad", "titleEffect",
      "priceFontFamily", "priceColor", "priceShowDollar", "priceBg", "priceBgPad", "priceEffect",
      "priceCompDollarRatio", "priceCompDollarOffsetY", "priceCompQtyRatio",
      "priceCompDecRatio", "priceCompDecOffsetY", "priceCompUnitRatio", "priceCompUnitOffsetY",
      "titleCompMetaScale", "titleCompMetaOffsetY",
      "imageRadius", "imageBrightness", "imageContrast", "imageSaturation", "imageOpacity",
      "imageFlipH", "imageFlipV",
      "titleOffsetX", "titleOffsetY", "priceOffsetX", "priceOffsetY",
    ] as const;
    for (const key of keys) {
      const v = old[key];
      if (v !== undefined) (preserved as Record<string, unknown>)[key] = v;
    }
    return { ...card, ...preserved };
  });
}

function regionWidthForDepartment(
  config: FlyerTemplateConfig,
  department: string,
): number {
  const area = findDepartmentArea(config, department);
  if (area) return area.productRegion.width;
  const page = findPageForDepartment(config, department);
  const deptDef = page?.departments[department];
  if (deptDef && isCardDepartment(deptDef)) return deptDef.region.width;
  return 800;
}

/** Re-pack products when they were dropped into an oversized empty grid. */
export function compactInflatedCardLayout(
  layout: CardDef[],
  itemIds: string[],
  regionWidth: number,
): CardDef[] {
  if (!layout.length || !itemIds.length) return layout;
  const activeRows = deriveActiveRowCount(layout);
  const layoutRows = deriveRowCount(layout);
  if (layoutRows <= activeRows) return layout;
  return autoLayoutCards({
    itemIds,
    regionWidth,
    targetRows: activeRows,
  });
}

/** Build or reuse card layout so every discount item gets a slot. */
export function reconcileCardLayoutForDepartment(
  config: FlyerTemplateConfig,
  department: string,
  itemIds: string[] = [],
  existingLayout?: CardDef[] | null,
  opts?: CardLayoutOpts
): CardDef[] {
  const regionWidth = regionWidthForDepartment(config, department);
  let layout = existingLayout;
  if (layout?.length && itemIds.length) {
    layout = compactInflatedCardLayout(layout, itemIds, regionWidth);
  }

  if (!cardLayoutNeedsRebuild(layout, itemIds)) {
    return layout ?? existingLayout!;
  }
  const built = buildCardLayoutForDepartment(config, department, itemIds, opts);
  return mergeCardPreservation(built, layout ?? existingLayout);
}

/** Default row count from wizard department metadata. */
export function defaultRowsForDepartment(
  config: FlyerTemplateConfig,
  department: string
): number {
  const area = findDepartmentArea(config, department);
  if (area?.rows) return area.rows;
  const page = findPageForDepartment(config, department);
  const deptDef = page?.departments[department];
  if (deptDef && isCardDepartment(deptDef)) return deptDef.rows;
  return DEFAULT_ROWS;
}

/** Align saved toolbar row counts with the actual card layout on disk. */
export function reconcileRowCountsWithLayouts(
  counts: Record<string, number>,
  layouts?: Record<string, CardDef[] | null | undefined>,
): Record<string, number> {
  if (!layouts) return counts;
  const next = { ...counts };
  for (const [dept, layout] of Object.entries(layouts)) {
    if (!layout?.length) continue;
    next[dept] = deriveActiveRowCount(layout);
  }
  return next;
}
