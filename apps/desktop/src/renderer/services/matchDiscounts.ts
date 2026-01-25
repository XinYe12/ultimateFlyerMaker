// PATH: apps/desktop/src/renderer/services/matchDiscounts.ts
// ✅ MUST EXACTLY EXPORT THIS SYMBOL

import { IngestItem, DiscountMatch } from "../types";

export function matchDiscounts(
  ingestedItems: IngestItem[]
): DiscountMatch[] {
  return ingestedItems
    .filter(item => item.result && item.status === "done")
    .map(item => {
      const result = item.result!;
      const title = result.title;

      const priceDisplay =
        result.llmResult?.priceDisplay ??
        result.dbMatches?.price ??
        "";

      const priceValue =
        typeof result.llmResult?.price === "number"
          ? result.llmResult.price
          : undefined;

      const confidenceScore =
        title.confidence === "high" ? 0.9 : 0.4;

      const reasons: string[] = [];

      if (title.confidence === "high") reasons.push("title high confidence");
      if (priceDisplay) reasons.push("price detected");
      if (result.dbMatches) reasons.push("db match");
      if (result.webMatches) reasons.push("web match");

      return {
        ingestedItemId: item.id,
        title: { en: title.en, zh: title.zh },
        price: { display: priceDisplay, value: priceValue },
        confidence: { score: confidenceScore, reasons },
      };
    });
}

// 🔒 REQUIRED BY App.tsx
export function matchDiscountsInEditor(
  ingestedItems: IngestItem[]
): DiscountMatch[] {
  return matchDiscounts(ingestedItems);
}
