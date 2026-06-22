import type { CardDef } from "../../../../shared/flyer/layout/layoutCardRows";
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

function layoutCardsForRegion(
  itemIds: string[],
  regionWidth: number,
  defaultRows: number,
  opts?: CardLayoutOpts
): CardDef[] {
  return autoLayoutCards({
    itemIds,
    regionWidth,
    defaultRows,
    targetRows: opts?.targetRows,
  });
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
    const defaultRows = area.rows ?? DEFAULT_ROWS;
    const cards = layoutCardsForRegion(
      itemIds,
      area.productRegion.width,
      defaultRows,
      opts
    );
    return applyTemplateStyleToCards(cards, area);
  }

  const page = findPageForDepartment(config, department);
  const deptDef = page?.departments[department];
  if (deptDef && isCardDepartment(deptDef)) {
    return layoutCardsForRegion(
      itemIds,
      deptDef.region.width,
      deptDef.rows,
      opts
    );
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

/** Build or reuse card layout so every discount item gets a slot. */
export function reconcileCardLayoutForDepartment(
  config: FlyerTemplateConfig,
  department: string,
  itemIds: string[] = [],
  existingLayout?: CardDef[] | null,
  opts?: CardLayoutOpts
): CardDef[] {
  if (!cardLayoutNeedsRebuild(existingLayout, itemIds)) {
    return existingLayout!;
  }
  const built = buildCardLayoutForDepartment(config, department, itemIds, opts);
  return mergeCardPreservation(built, existingLayout);
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
