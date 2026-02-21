import { FlyerPlacement } from "../models/FlyerPlacement"

export const CARD_GAP = 6;
export const CARD_BG = '#e8e8e8';

export type CardDef = {
  id: string;
  row: number;
  order: number;
  widthPx: number;
  itemId?: string;
  rowSpan?: number;  // number of rows this card spans (default 1)
};

/**
 * Derive the number of rows from card data (max row index + 1).
 */
export function deriveRowCount(cards: CardDef[]): number {
  if (cards.length === 0) return 1;
  return Math.max(...cards.map(c => c.row)) + 1;
}

/**
 * Build a map of x-offsets for each card (accounting for spanning cards from above).
 *
 * When a card in row R has rowSpan > 1, it occupies its x-range in rows R+1 … R+span-1.
 * Cards in those lower rows must skip over that occupied space.
 *
 * Returns a Map from card.id → x offset (relative to region left edge).
 */
function computeCardXPositions(cards: CardDef[]): Map<string, number> {
  const effectiveRows = deriveRowCount(cards);
  const byRow = new Map<number, CardDef[]>();
  for (const card of cards) {
    const list = byRow.get(card.row) || [];
    list.push(card);
    byRow.set(card.row, list);
  }

  // First pass: compute x positions for each card in row order.
  // Track "occupied spans" that bleed into later rows.
  // Each span = { xStart, width } in a given row.
  const occupiedByRow = new Map<number, Array<{ xStart: number; width: number }>>();
  const positions = new Map<string, number>();

  for (let row = 0; row < effectiveRows; row++) {
    const rowCards = (byRow.get(row) || []).slice().sort((a, b) => a.order - b.order);
    const occupied = (occupiedByRow.get(row) || []).slice().sort((a, b) => a.xStart - b.xStart);

    let cursorX = 0;
    let occIdx = 0;

    for (const card of rowCards) {
      // Skip past any occupied spans at the current cursor position
      while (occIdx < occupied.length && occupied[occIdx].xStart <= cursorX + 0.5) {
        const occ = occupied[occIdx];
        // Jump cursor past this occupied span
        cursorX = occ.xStart + occ.width + CARD_GAP;
        occIdx++;
      }

      positions.set(card.id, cursorX);

      // If this card spans multiple rows, mark its space as occupied in lower rows
      const span = card.rowSpan ?? 1;
      if (span > 1) {
        for (let sr = row + 1; sr < row + span && sr < effectiveRows; sr++) {
          const list = occupiedByRow.get(sr) || [];
          list.push({ xStart: cursorX, width: card.widthPx });
          occupiedByRow.set(sr, list);
        }
      }

      cursorX += card.widthPx + CARD_GAP;
    }
  }

  return positions;
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
  pageId,
  regionId,
}: {
  cards: CardDef[];
  region: { x: number; y: number; width: number; height: number };
  rows?: number;
  pageId: string;
  regionId: string;
}): FlyerPlacement[] {
  const effectiveRows = rows ?? deriveRowCount(cards);
  const rowHeight = (region.height - (effectiveRows - 1) * CARD_GAP) / effectiveRows;
  const placements: FlyerPlacement[] = [];
  const xPositions = computeCardXPositions(cards);

  for (const card of cards) {
    if (!card.itemId) continue;

    const span = card.rowSpan ?? 1;
    const cardHeight = span * rowHeight + (span - 1) * CARD_GAP;
    const x = xPositions.get(card.id) ?? 0;

    placements.push({
      itemId: card.itemId,
      pageId,
      regionId,
      cardSize: "SMALL",
      x: region.x + x,
      y: region.y + card.row * (rowHeight + CARD_GAP),
      width: card.widthPx,
      height: cardHeight,
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
}: {
  cards: CardDef[];
  region: { x: number; y: number; width: number; height: number };
  rows?: number;
}): Array<{ cardId: string; x: number; y: number; width: number; height: number; itemId?: string }> {
  const effectiveRows = rows ?? deriveRowCount(cards);
  const rowHeight = (region.height - (effectiveRows - 1) * CARD_GAP) / effectiveRows;
  const rects: Array<{ cardId: string; x: number; y: number; width: number; height: number; itemId?: string }> = [];
  const xPositions = computeCardXPositions(cards);

  for (const card of cards) {
    const span = card.rowSpan ?? 1;
    const cardHeight = span * rowHeight + (span - 1) * CARD_GAP;
    const x = xPositions.get(card.id) ?? 0;

    rects.push({
      cardId: card.id,
      x: region.x + x,
      y: region.y + card.row * (rowHeight + CARD_GAP),
      width: card.widthPx,
      height: cardHeight,
      itemId: card.itemId,
    });
  }

  return rects;
}
