import { describe, it, expect } from "vitest";
import {
  computeCardRects,
  resolveLayoutRows,
  resolveLayoutRowsForRendering,
  deriveRowCount,
  deriveActiveRowCount,
} from "../../../../shared/flyer/layout/layoutCardRows";

describe("resolveLayoutRows", () => {
  const cards = [{ id: "a", row: 0, order: 0, widthPx: 100 }];

  it("uses template row count when provided", () => {
    expect(resolveLayoutRows(cards, 3)).toBe(3);
  });

  it("falls back to deriveRowCount when template rows omitted", () => {
    expect(resolveLayoutRows([{ id: "a", row: 2, order: 0, widthPx: 100 }], undefined)).toBe(3);
    expect(deriveRowCount(cards)).toBe(1);
    expect(resolveLayoutRows(cards, undefined)).toBe(1);
  });
});

describe("deriveActiveRowCount", () => {
  it("ignores trailing empty rows below the last product", () => {
    const cards = [
      { id: "a", row: 0, order: 0, widthPx: 100, itemId: "1" },
      { id: "b", row: 1, order: 0, widthPx: 100, itemId: "2" },
      { id: "c", row: 2, order: 0, widthPx: 100, itemId: "3" },
      { id: "d", row: 3, order: 0, widthPx: 100 },
      { id: "e", row: 4, order: 0, widthPx: 100 },
    ];
    expect(deriveActiveRowCount(cards)).toBe(3);
  });

  it("keeps intentional empty rows that sit between filled rows", () => {
    const cards = [
      { id: "a", row: 0, order: 0, widthPx: 100, itemId: "1" },
      { id: "b", row: 2, order: 0, widthPx: 100, itemId: "2" },
    ];
    expect(deriveActiveRowCount(cards)).toBe(3);
  });
});

describe("resolveLayoutRowsForRendering", () => {
  const threeRowCards = [
    { id: "a", row: 0, order: 0, widthPx: 100, itemId: "1" },
    { id: "b", row: 1, order: 0, widthPx: 100, itemId: "2" },
    { id: "c", row: 2, order: 0, widthPx: 100, itemId: "3" },
  ];

  it("uses occupied rows from layout even when explicit count is inflated", () => {
    expect(resolveLayoutRowsForRendering(threeRowCards, 8, 8)).toBe(3);
  });

  it("uses explicit row count for empty grids", () => {
    expect(resolveLayoutRowsForRendering([], 5, 8)).toBe(5);
  });
});

describe("computeCardRects department row budget", () => {
  it("uses template rows to size cards within stacked department bands", () => {
    const region = { x: 0, y: 983, width: 1650, height: 994 };
    const cards = [
      { id: "a", row: 0, order: 0, widthPx: 540, itemId: "1" },
      { id: "b", row: 0, order: 1, widthPx: 540, itemId: "2" },
      { id: "c", row: 0, order: 2, widthPx: 540, itemId: "3" },
    ];
    const withTemplateRows = computeCardRects({ cards, region, rows: 3 });
    const withoutRows = computeCardRects({ cards, region });
    const expectedRowHeight = (994 - 12) / 3;
    expect(withTemplateRows[0].height).toBe(expectedRowHeight);
    expect(withTemplateRows[0].height).toBeLessThan(withoutRows[0].height);
    expect(withTemplateRows[0].y).toBe(region.y);
  });

  it("keeps seafood single-row placements inside the department band", () => {
    const seafoodRegion = { x: 0, y: 2048, width: 1650, height: 462 };
    const cards = [
      { id: "a", row: 0, order: 0, widthPx: 800, itemId: "1" },
      { id: "b", row: 0, order: 1, widthPx: 800, itemId: "2" },
    ];
    const rects = computeCardRects({ cards, region: seafoodRegion, rows: 1 });
    for (const rect of rects) {
      expect(rect.y).toBe(seafoodRegion.y);
      expect(rect.y + rect.height).toBeLessThanOrEqual(seafoodRegion.y + seafoodRegion.height + 1);
    }
  });
});
