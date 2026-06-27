/** Products per row in the flyer automation pipeline. */
export const AUTOMATION_COLS_PER_ROW = 3;
export const CARD_GAP = 6;
/** Uniform cell-to-cell gap and region inset for all departments. Must match DEFAULT_CELL_GAP in layoutCardRows.ts. */
export const DEFAULT_CELL_GAP = 12;

function deriveRowCount(cards) {
  if (cards.length === 0) return 1;
  return Math.max(...cards.map(c => c.row)) + 1;
}

/** Empty automation grid — same defaults as autoLayoutCards({ itemIds: [], ... }). */
function autoLayoutEmptyCards(regionWidth, rows, colsPerRow, gap = CARD_GAP) {
  const cardsPerRow = Math.max(1, colsPerRow ?? AUTOMATION_COLS_PER_ROW);
  const cardWidth = (regionWidth - (cardsPerRow - 1) * gap) / cardsPerRow;
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

function computeCardXPositions(cards, gap = CARD_GAP) {
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
      cursorX += card.widthPx + gap;
    }
  }
  return positions;
}

/** Cell rects for underprint masking — matches wizard preview + editor automation layout. */
export function automationCellRectsForArea(area) {
  const pr = area.productRegion;
  if (!pr) return [];

  const cellGap = DEFAULT_CELL_GAP;

  const innerX = pr.x + cellGap;
  const innerY = pr.y + cellGap;
  const innerW = Math.max(1, pr.width - 2 * cellGap);
  const innerH = Math.max(1, pr.height - 2 * cellGap);

  const rows = Math.max(1, parseInt(area.rows ?? 3, 10));
  const cols = Math.max(1, parseInt(area.cols ?? AUTOMATION_COLS_PER_ROW, 10));
  const cards = autoLayoutEmptyCards(innerW, rows, cols, cellGap);
  const rowHeight = (innerH - (rows - 1) * cellGap) / rows;
  const xPositions = computeCardXPositions(cards, cellGap);
  const rects = [];

  for (const card of cards) {
    const span = card.rowSpan ?? 1;
    const cardHeight = span * rowHeight + (span - 1) * cellGap;
    const x = xPositions.get(card.id) ?? 0;
    rects.push({
      x: innerX + x,
      y: innerY + card.row * (rowHeight + cellGap),
      width: card.widthPx,
      height: cardHeight,
    });
  }

  return rects;
}
