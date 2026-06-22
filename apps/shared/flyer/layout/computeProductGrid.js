/**
 * Compute product cell rectangles inside a department productRegion.
 * Supports inset padding, cell gaps, and optional row/col weight arrays.
 */

function normalizeWeights(raw, count) {
  if (!Array.isArray(raw) || raw.length !== count) {
    return Array.from({ length: count }, () => 1);
  }
  const vals = raw.map(v => Math.max(0.01, Number(v) || 1));
  const sum = vals.reduce((a, b) => a + b, 0);
  return vals.map(v => v / sum);
}

function distributeAxis(total, count, gap, weights) {
  const gaps = Math.max(0, count - 1) * gap;
  const available = Math.max(0, total - gaps);
  const w = normalizeWeights(weights, count);
  const floatSizes = w.map(weight => available * weight);
  const sizes = floatSizes.map(s => Math.floor(s));
  let remainder = Math.round(available - sizes.reduce((a, b) => a + b, 0));
  for (let i = 0; remainder > 0; i++, remainder--) {
    sizes[i % count]++;
  }
  const positions = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    positions.push(cursor);
    cursor += sizes[i] + (i < count - 1 ? gap : 0);
  }
  return { sizes, positions };
}

/**
 * @param {{ x: number, y: number, width: number, height: number }} productRegion
 * @param {number} rows
 * @param {number} cols
 * @param {object} [gridLayout]
 * @returns {{ gridBounds: object, cells: Array<{ x, y, width, height, row, col }> }}
 */
export function computeProductGrid(productRegion, rows, cols, gridLayout = {}) {
  const r = rows ?? 4;
  const c = cols ?? 4;
  const gap = Math.max(0, Number(gridLayout.cellGap ?? 0));
  const insetTop = Math.max(0, Number(gridLayout.insetTop ?? 0));
  const insetLeft = Math.max(0, Number(gridLayout.insetLeft ?? 0));
  const insetRight = Math.max(0, Number(gridLayout.insetRight ?? 0));
  const insetBottom = Math.max(0, Number(gridLayout.insetBottom ?? 0));

  const gridX = productRegion.x + insetLeft;
  const gridY = productRegion.y + insetTop;
  const gridW = Math.max(0, productRegion.width - insetLeft - insetRight);
  const gridH = Math.max(0, productRegion.height - insetTop - insetBottom);

  const colAxis = distributeAxis(gridW, c, gap, gridLayout.colWeights);
  const rowAxis = distributeAxis(gridH, r, gap, gridLayout.rowWeights);

  const cells = [];
  for (let row = 0; row < r; row++) {
    for (let col = 0; col < c; col++) {
      const x = gridX + colAxis.positions[col];
      const y = gridY + rowAxis.positions[row];
      const width = colAxis.sizes[col];
      const height = rowAxis.sizes[row];
      const x2 = Math.min(x + width, gridX + gridW);
      const y2 = Math.min(y + height, gridY + gridH);
      cells.push({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(Math.max(0, x2 - x)),
        height: Math.round(Math.max(0, y2 - y)),
        row,
        col,
      });
    }
  }

  return {
    gridBounds: {
      x: Math.round(gridX),
      y: Math.round(gridY),
      width: Math.round(gridW),
      height: Math.round(gridH),
    },
    cells,
  };
}
