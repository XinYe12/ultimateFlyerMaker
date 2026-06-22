/** Products per row in the flyer automation pipeline. */
export const AUTOMATION_COLS_PER_ROW = 3;
export const CARD_GAP = 6;

function deriveRowCount(cards) {
  if (cards.length === 0) return 1;
  return Math.max(...cards.map(c => c.row)) + 1;
}

/** Empty automation grid — same defaults as autoLayoutCards({ itemIds: [], ... }). */
function autoLayoutEmptyCards(regionWidth, rows, colsPerRow) {
  const cardsPerRow = Math.max(1, colsPerRow ?? AUTOMATION_COLS_PER_ROW);
  const cardWidth = (regionWidth - (cardsPerRow - 1) * CARD_GAP) / cardsPerRow;
  const cards = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cardsPerRow; c++) {
      cards.push({
        id: `${r}-${c}`,
        row: r,
        order: c,
        widthPx: Math.round(cardWidth),
      });
    }
  }
  return cards;
}

function computeCardXPositions(cards) {
  const effectiveRows = deriveRowCount(cards);
  const byRow = new Map();
  for (const card of cards) {
    const list = byRow.get(card.row) || [];
    list.push(card);
    byRow.set(card.row, list);
  }

  const positions = new Map();
  for (let row = 0; row < effectiveRows; row++) {
    const rowCards = (byRow.get(row) || []).slice().sort((a, b) => a.order - b.order);
    let cursorX = 0;
    for (const card of rowCards) {
      positions.set(card.id, cursorX);
      cursorX += card.widthPx + CARD_GAP;
    }
  }
  return positions;
}

/** Cell rects for underprint masking — matches wizard preview + editor automation layout. */
export function automationCellRectsForArea(area) {
  const pr = area.productRegion;
  if (!pr) return [];

  const rows = Math.max(1, parseInt(area.rows ?? 3, 10));
  const cols = Math.max(1, parseInt(area.cols ?? AUTOMATION_COLS_PER_ROW, 10));
  const cards = autoLayoutEmptyCards(pr.width, rows, cols);
  const rowHeight = (pr.height - (rows - 1) * CARD_GAP) / rows;
  const xPositions = computeCardXPositions(cards);
  const rects = [];

  for (const card of cards) {
    const span = card.rowSpan ?? 1;
    const cardHeight = span * rowHeight + (span - 1) * CARD_GAP;
    const x = xPositions.get(card.id) ?? 0;
    rects.push({
      x: pr.x + x,
      y: pr.y + card.row * (rowHeight + CARD_GAP),
      width: card.widthPx,
      height: cardHeight,
    });
  }

  return rects;
}
