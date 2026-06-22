import { describe, it, expect } from "vitest";
import { looksLikeFlyerTitleGraphic } from "../ingestion/imageEmbeddingService.js";

describe("looksLikeFlyerTitleGraphic", () => {
  it("flags stylized title + price flyer graphics", () => {
    expect(looksLikeFlyerTitleGraphic("Green Ton Choy 1.88")).toBe(true);
    expect(looksLikeFlyerTitleGraphic("Sale $1.88")).toBe(true);
  });

  it("flags section banner text", () => {
    expect(looksLikeFlyerTitleGraphic("H O T  F O O D")).toBe(true);
    expect(looksLikeFlyerTitleGraphic("WEEKLY SPECIAL")).toBe(true);
  });

  it("does not flag packaging with weight or ingredients", () => {
    expect(
      looksLikeFlyerTitleGraphic("Organic Milk 1 gal NET WT 128 FL OZ ingredients: milk vitamin d")
    ).toBe(false);
    expect(looksLikeFlyerTitleGraphic("Chicken Breast 16 oz pack of 2 $5.99")).toBe(false);
  });

  it("returns false for empty OCR", () => {
    expect(looksLikeFlyerTitleGraphic("")).toBe(false);
    expect(looksLikeFlyerTitleGraphic(null)).toBe(false);
  });
});
