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
};

const DEFAULT_CARDS_PER_ROW = 3;

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
}: {
  itemIds: string[];
  regionWidth: number;
  defaultRows?: number;
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

  // Dynamic row count: ceil(N / 3)
  const rows = Math.ceil(itemIds.length / DEFAULT_CARDS_PER_ROW);

  // Distribute items evenly across rows
  let itemIndex = 0;

  for (let r = 0; r < rows; r++) {
    const remaining = itemIds.length - itemIndex;
    const remainingRows = rows - r;
    const rowItemCount = Math.ceil(remaining / remainingRows);

    // Ensure at least 2 cards per row (no full-width cards)
    const totalCardsInRow = Math.max(2, rowItemCount);
    const cardWidth = (regionWidth - (totalCardsInRow - 1) * CARD_GAP) / totalCardsInRow;

    for (let c = 0; c < totalCardsInRow; c++) {
      if (c < rowItemCount && itemIndex < itemIds.length) {
        cards.push({
          id: generateId(),
          row: r,
          order: c,
          widthPx: Math.round(cardWidth),
          itemId: itemIds[itemIndex],
        });
        itemIndex++;
      } else {
        // Empty padding card
        cards.push({
          id: generateId(),
          row: r,
          order: c,
          widthPx: Math.round(cardWidth),
        });
      }
    }
  }

  return cards;
}
