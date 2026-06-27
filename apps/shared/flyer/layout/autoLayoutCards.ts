import { CARD_GAP } from "./layoutCardRows";

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export type CardDef = {
  id: string;
  row: number;
  order: number;
  widthPx: number;
  itemId?: string;
  rowSpan?: number;
  contentScale?: number;
};

export const AUTOMATION_COLS_PER_ROW = 3;
const DEFAULT_CARDS_PER_ROW = AUTOMATION_COLS_PER_ROW;

/**
 * Auto-distribute item IDs across rows.
 * - Default 3 items per row; rows = ceil(itemCount / 3)
 * - No card takes full width (minimum 2 cards per row)
 * - If itemIds is empty, creates `defaultRows` rows with 3 empty cards each
 */
export function autoLayoutCards({
  itemIds,
  regionWidth,
  defaultRows,
  targetRows,
}: {
  itemIds: string[];
  regionWidth: number;
  defaultRows?: number;
  targetRows?: number;
}): CardDef[] {
  const cards: CardDef[] = [];

  if (itemIds.length === 0) {
    // Create empty rows with 3 cards each
    const rows = defaultRows ?? 3;
    const cardsPerRow = DEFAULT_CARDS_PER_ROW;
    const cardWidth = (regionWidth - (cardsPerRow - 1) * CARD_GAP) / cardsPerRow;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cardsPerRow; c++) {
        cards.push({
          id: generateId(),
          row: r,
          order: c,
          widthPx: Math.round(cardWidth),
        });
      }
    }
    return cards;
  }

  // Dynamic row count: ceil(N / 3), or use targetRows if specified
  const rows = targetRows ?? Math.ceil(itemIds.length / DEFAULT_CARDS_PER_ROW);

  // Uniform column count across ALL rows — enables vertical merge buttons between any two rows
  const colsPerRow = Math.max(2, Math.ceil(itemIds.length / rows));
  const cardWidth = (regionWidth - (colsPerRow - 1) * CARD_GAP) / colsPerRow;

  let itemIndex = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < colsPerRow; c++) {
      const entry: CardDef = {
        id: generateId(),
        row: r,
        order: c,
        widthPx: Math.round(cardWidth),
      };
      if (itemIndex < itemIds.length) {
        entry.itemId = itemIds[itemIndex++];
      }
      cards.push(entry);
    }
  }

  return cards;
}
