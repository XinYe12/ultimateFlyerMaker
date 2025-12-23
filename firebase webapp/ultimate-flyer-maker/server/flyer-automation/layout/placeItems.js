// server/flyer-automation/layout/placeItems.js

const SIZE_MAP = {
  SMALL: { w: 1, h: 1 },
  MEDIUM: { w: 1, h: 2 },
  LARGE: { w: 4, h: 3 }
};

/**
 * Place items into a grid
 * @param {Array} items FlyerItem[]
 * @param {Object} options
 * @param {number} options.columns
 * @param {number} options.maxItems
 */
export function placeItems(items, { columns = 4, maxItems = 16 }) {
  const placements = [];
  const grid = []; // 2D occupancy grid

  function isFree(x, y, w, h) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (grid[y + dy]?.[x + dx]) return false;
      }
    }
    return true;
  }

  function occupy(x, y, w, h, itemId) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (!grid[y + dy]) grid[y + dy] = [];
        grid[y + dy][x + dx] = itemId;
      }
    }
  }

  let count = 0;

  for (const item of items) {
    if (count >= maxItems) break;

    const size = SIZE_MAP[item.layout.size || "SMALL"];
    let placed = false;

    for (let y = 0; !placed; y++) {
      for (let x = 0; x <= columns - size.w; x++) {
        if (isFree(x, y, size.w, size.h)) {
          occupy(x, y, size.w, size.h, item.id);

          placements.push({
            itemId: item.id,
            x,
            y,
            w: size.w,
            h: size.h
          });

          placed = true;
          count++;
          break;
        }
      }
    }
  }

  return placements;
}
