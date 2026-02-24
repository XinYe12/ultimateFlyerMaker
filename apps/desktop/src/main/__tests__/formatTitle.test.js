import { describe, it, expect } from "vitest";
import { formatTitle } from "../ingestion/formatTitle.js";

describe("formatTitle", () => {
  it("returns empty title when llmResult has no best_title", () => {
    expect(formatTitle({})).toEqual({
      en: "", zh: "", size: "", confidence: "low", source: "deepseek",
    });
    expect(formatTitle(null)).toMatchObject({ en: "", confidence: "low" });
  });

  it("extracts english and chinese name", () => {
    const result = formatTitle({
      best_title: { english_name: "Apple Juice", chinese_name: "苹果汁", confidence: 0.9 },
    });
    expect(result.en).toBe("Apple Juice");
    expect(result.zh).toBe("苹果汁");
  });

  it("marks high confidence when score >= 0.6", () => {
    const result = formatTitle({ best_title: { english_name: "X", confidence: 0.6 } });
    expect(result.confidence).toBe("high");
  });

  it("marks low confidence when score < 0.6", () => {
    const result = formatTitle({ best_title: { english_name: "X", confidence: 0.59 } });
    expect(result.confidence).toBe("low");
  });

  it("trims whitespace from names", () => {
    const result = formatTitle({
      best_title: { english_name: "  Milk  ", chinese_name: "  牛奶  ", confidence: 0.8 },
    });
    expect(result.en).toBe("Milk");
    expect(result.zh).toBe("牛奶");
  });

  it("size is always empty (best_title has no size field)", () => {
    const result = formatTitle({ best_title: { english_name: "Chips 200g", confidence: 0.9 } });
    expect(result.size).toBe("");
  });
});
