// PATH: apps/desktop/src/renderer/editor/glueDiscountItems.ts
// GUARANTEED SAFE VERSION (NO .map ON UNDEFINED POSSIBLE)

import { IngestItem, DiscountItem, DiscountMatch } from "../types";

export function glueDiscountItems(
  ingestedItems?: IngestItem[],
  matches?: DiscountMatch[]
): DiscountItem[] {
  const safeIngested = Array.isArray(ingestedItems) ? ingestedItems : [];
  const safeMatches = Array.isArray(matches) ? matches : [];

  const ingestMap = new Map(
    safeIngested
      .filter(i => i && i.status === "done" && i.result)
      .map(i => [i.id, i.result!])
  );

  const out: DiscountItem[] = [];

  for (let i = 0; i < safeMatches.length; i++) {
    const match = safeMatches[i];
    const source = ingestMap.get(match.ingestedItemId);
    if (!source) continue;

    out.push({
      id: match.ingestedItemId,
      image: { src: source.cutoutPath },
      title: { en: match.title.en, zh: match.title.zh },
      price: { display: match.price.display, value: match.price.value },
      confidence: {
        score: match.confidence.score,
        reasons: match.confidence.reasons,
      },
    });
  }

  return out;
}
