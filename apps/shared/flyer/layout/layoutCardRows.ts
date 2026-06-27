import { FlyerPlacement } from "../models/FlyerPlacement"

export const CARD_GAP = 6;
/** Uniform cell-to-cell gap and region inset applied to all departments. */
export const DEFAULT_CELL_GAP = 12;
export const CARD_BG = '#e8e8e8';

export type CardDef = {
  id: string;
  row: number;
  order: number;
  widthPx: number;
  itemId?: string;
  rowSpan?: number;  // number of rows this card spans (default 1)
  contentScale?: number;
  imageScale?: number;
  titleScale?: number;
  priceScale?: number;
  imageRotation?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
  orientation?: 'vertical' | 'horizontal' | 'top';
  cropLeft?: number;
  cropRight?: number;
  cropTop?: number;
  cropBottom?: number;
  titleFontFamily?: string;
  titleColor?: string;
  titleItalic?: boolean;
  titleBg?: string;
  titleBgPad?: number;
  titleEffect?: 'stroke' | 'glow' | 'shadow';
  priceFontFamily?: string;
  priceColor?: string;
  priceShowDollar?: boolean;
  priceBg?: string;
  priceBgPad?: number;
  priceEffect?: 'stroke' | 'glow' | 'shadow';
  priceCompDollarRatio?: number;
  priceCompDollarOffsetY?: number;
  priceCompQtyRatio?: number;
  priceCompDecRatio?: number;
  priceCompDecOffsetY?: number;
  priceCompUnitRatio?: number;
  priceCompUnitOffsetY?: number;
  titleCompMetaScale?: number;
  titleCompMetaOffsetY?: number;
  imageRadius?: number;
  imageBrightness?: number;
  imageContrast?: number;
  imageSaturation?: number;
  imageOpacity?: number;
  imageFlipH?: boolean;
  imageFlipV?: boolean;
  titleOffsetX?: number;
  titleOffsetY?: number;
  priceOffsetX?: number;
  priceOffsetY?: number;
};

/**
 * Derive the number of rows from card data (max row index + 1).
 */
export function deriveRowCount(cards: CardDef[]): number {
  if (cards.length === 0) return 1;
  return Math.max(...cards.map(c => c.row)) + 1;
}

/**
 * Row count for sizing/placement when products only occupy the top rows of an
 * oversized template grid (trailing rows are empty placeholder cards).
 */
export function deriveActiveRowCount(cards: CardDef[]): number {
  if (cards.length === 0) return 1;
  const filled = cards.filter(c => c.itemId);
  if (!filled.length) return deriveRowCount(cards);
  const maxFilledRow = Math.max(...filled.map(c => c.row));
  const layoutRows = deriveRowCount(cards);
  if (layoutRows <= maxFilledRow + 1) return layoutRows;
  const trailing = cards.filter(c => c.row > maxFilledRow);
  if (trailing.length > 0 && trailing.every(c => !c.itemId)) {
    return maxFilledRow + 1;
  }
  return layoutRows;
}

/** Use template row budget when set; otherwise derive from card layout. */
export function resolveLayoutRows(cards: CardDef[], templateRows?: number): number {
  if (templateRows != null && templateRows >= 1) {
    return Math.max(1, Math.round(templateRows));
  }
  return deriveRowCount(cards);
}

/**
 * Row budget for rendering card rects/placements in the editor and export.
 * When a layout exists, its occupied rows are authoritative — saved toolbar/template
 * counts can be inflated and must not stretch cells into unused space below products.
 */
export function resolveLayoutRowsForRendering(
  cards: CardDef[],
  explicitRows?: number,
  templateRows?: number,
): number {
  if (cards.length > 0) {
    return deriveActiveRowCount(cards);
  }
  if (explicitRows != null && explicitRows >= 1) {
    return Math.max(1, Math.round(explicitRows));
  }
  return resolveLayoutRows(cards, templateRows);
}

/**
 * Compute x-offsets and widths for each card, derived from actual region width and gap.
 *
 * Widths are computed fresh from regionWidth/gap so that cards always fill the region
 * exactly, regardless of the gap value baked into card.widthPx.
 * The last card in each row absorbs any rounding remainder.
 *
 * When a card in row R has rowSpan > 1, it occupies its x-range in rows R+1 … R+span-1.
 * Cards in those lower rows must skip over that occupied space.
 */
function computeCardXPositions(
  cards: CardDef[],
  regionWidth: number,
  gap: number = CARD_GAP,
): Map<string, { x: number; width: number }> {
  const effectiveRows = deriveRowCount(cards);
  const byRow = new Map<number, CardDef[]>();
  for (const card of cards) {
    const list = byRow.get(card.row) || [];
    list.push(card);
    byRow.set(card.row, list);
  }

  const occupiedByRow = new Map<number, Array<{ xStart: number; width: number }>>();
  const result = new Map<string, { x: number; width: number }>();

  for (let row = 0; row < effectiveRows; row++) {
    const rowCards = (byRow.get(row) || []).slice().sort((a, b) => a.order - b.order);
    const occupied = (occupiedByRow.get(row) || []).slice().sort((a, b) => a.xStart - b.xStart);

    const occupiedW = occupied.reduce((s, o) => s + o.width + gap, 0);
    const available = Math.max(0, regionWidth - occupiedW);
    const cols = rowCards.length;
    const usable = Math.max(0, available - (cols - 1) * gap);
    // Use widthPx as proportional weights: equal by default, respects drag-resize ratios.
    const totalWeight = rowCards.reduce((s, c) => s + Math.max(1, c.widthPx), 0);

    let cursorX = 0;
    let occIdx = 0;

    for (let ci = 0; ci < rowCards.length; ci++) {
      const card = rowCards[ci];

      // Skip past any occupied spans at the current cursor position
      while (occIdx < occupied.length && occupied[occIdx].xStart <= cursorX + 0.5) {
        const occ = occupied[occIdx];
        cursorX = occ.xStart + occ.width + gap;
        occIdx++;
      }

      const x = cursorX;
      // Last card absorbs rounding so all cards exactly fill the region
      const width = ci === rowCards.length - 1
        ? Math.max(1, regionWidth - x)
        : Math.max(1, Math.round(usable * Math.max(1, card.widthPx) / totalWeight));

      result.set(card.id, { x, width });

      const span = card.rowSpan ?? 1;
      if (span > 1) {
        for (let sr = row + 1; sr < row + span && sr < effectiveRows; sr++) {
          const list = occupiedByRow.get(sr) || [];
          list.push({ xStart: x, width });
          occupiedByRow.set(sr, list);
        }
      }

      cursorX += width + gap;
    }
  }

  return result;
}

/**
 * Convert a CardLayout + region into FlyerPlacements.
 * If `rows` is not provided, it is derived from the cards.
 * rowHeight = (region.height - (rows-1) * GAP) / rows
 * x = region.x + sum of preceding cards' widths + gaps
 * y = region.y + row * (rowHeight + GAP)
 */
export function layoutCardRows({
  cards,
  region,
  rows,
  gap = CARD_GAP,
  pageId,
  regionId,
}: {
  cards: CardDef[];
  region: { x: number; y: number; width: number; height: number };
  rows?: number;
  /** Cell gap in px; defaults to CARD_GAP (6). Pass departmentArea.gridLayout.cellGap when available. */
  gap?: number;
  pageId: string;
  regionId: string;
}): FlyerPlacement[] {
  const effectiveRows = rows != null ? resolveLayoutRows(cards, rows) : deriveRowCount(cards);
  const rowHeight = (region.height - (effectiveRows - 1) * gap) / effectiveRows;
  const placements: FlyerPlacement[] = [];
  const cardPos = computeCardXPositions(cards, region.width, gap);

  for (const card of cards) {
    if (!card.itemId) continue;

    const span = card.rowSpan ?? 1;
    const cardHeight = span * rowHeight + (span - 1) * gap;
    const pos = cardPos.get(card.id);

    placements.push({
      itemId: card.itemId,
      pageId,
      regionId,
      cardSize: "SMALL",
      x: region.x + (pos?.x ?? 0),
      y: region.y + card.row * (rowHeight + gap),
      width: pos?.width ?? card.widthPx,
      height: cardHeight,
      contentScale: card.contentScale,
      imageScale: card.imageScale,
      titleScale: card.titleScale,
      priceScale: card.priceScale,
      imageRotation: card.imageRotation,
      imageOffsetX: card.imageOffsetX,
      imageOffsetY: card.imageOffsetY,
      orientation: card.orientation,
      cropLeft: card.cropLeft,
      cropRight: card.cropRight,
      cropTop: card.cropTop,
      cropBottom: card.cropBottom,
      titleFontFamily: card.titleFontFamily,
      titleColor: card.titleColor,
      titleItalic: card.titleItalic,
      titleBg: card.titleBg,
      titleBgPad: card.titleBgPad,
      titleEffect: card.titleEffect,
      priceFontFamily: card.priceFontFamily,
      priceColor: card.priceColor,
      priceShowDollar: card.priceShowDollar,
      priceBg: card.priceBg,
      priceBgPad: card.priceBgPad,
      priceEffect: card.priceEffect,
      priceCompDollarRatio: card.priceCompDollarRatio,
      priceCompDollarOffsetY: card.priceCompDollarOffsetY,
      priceCompQtyRatio: card.priceCompQtyRatio,
      priceCompDecRatio: card.priceCompDecRatio,
      priceCompDecOffsetY: card.priceCompDecOffsetY,
      priceCompUnitRatio: card.priceCompUnitRatio,
      priceCompUnitOffsetY: card.priceCompUnitOffsetY,
      titleCompMetaScale: card.titleCompMetaScale,
      titleCompMetaOffsetY: card.titleCompMetaOffsetY,
      imageRadius: card.imageRadius,
      imageBrightness: card.imageBrightness,
      imageContrast: card.imageContrast,
      imageSaturation: card.imageSaturation,
      imageOpacity: card.imageOpacity,
      imageFlipH: card.imageFlipH,
      imageFlipV: card.imageFlipV,
      titleOffsetX: card.titleOffsetX,
      titleOffsetY: card.titleOffsetY,
      priceOffsetX: card.priceOffsetX,
      priceOffsetY: card.priceOffsetY,
    });
  }

  return placements;
}

/**
 * Compute card rects (for all cards including empty ones) for rendering backgrounds.
 * If `rows` is not provided, it is derived from the cards.
 */
export function computeCardRects({
  cards,
  region,
  rows,
  gap = CARD_GAP,
}: {
  cards: CardDef[];
  region: { x: number; y: number; width: number; height: number };
  rows?: number;
  /** Cell gap in px; defaults to CARD_GAP (6). Pass departmentArea.gridLayout.cellGap when available. */
  gap?: number;
}): Array<{ cardId: string; x: number; y: number; width: number; height: number; itemId?: string }> {
  const effectiveRows = rows != null ? resolveLayoutRows(cards, rows) : deriveRowCount(cards);
  const rowHeight = (region.height - (effectiveRows - 1) * gap) / effectiveRows;
  const rects: Array<{ cardId: string; x: number; y: number; width: number; height: number; itemId?: string }> = [];
  const cardPos = computeCardXPositions(cards, region.width, gap);

  for (const card of cards) {
    const span = card.rowSpan ?? 1;
    const cardHeight = span * rowHeight + (span - 1) * gap;
    const pos = cardPos.get(card.id);

    rects.push({
      cardId: card.id,
      x: region.x + (pos?.x ?? 0),
      y: region.y + card.row * (rowHeight + gap),
      width: pos?.width ?? card.widthPx,
      height: cardHeight,
      itemId: card.itemId,
    });
  }

  return rects;
}
