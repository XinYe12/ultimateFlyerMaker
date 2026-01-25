// apps/desktop/src/renderer/buildFlyerItems.ts
// FINALIZED PREVIEW INPUT ONLY
// apps/desktop/src/renderer/buildFlyerItems.ts
// FINALIZED PREVIEW INPUT ONLY

export function buildFlyerItems(matchedResults: any[]) {
  return matchedResults
    .filter((r) => r.discount) // 🚨 ONLY items with matched discounts
    .map((r, index) => {
      const discount = r.discount;

      return {
        id: `item_${index + 1}`,

        // ---------- IMAGE ----------
        image: {
          src: r.cutoutPath || r.inputPath
        },

        // ---------- LAYOUT ----------


        department: r.department ?? "grocery",

        // ---------- TITLE (REQUIRED) ----------
        title:
          discount?.en ||
          discount?.english_name ||
          r.title?.en ||
          "",

        // ---------- META ----------
        meta: {
          en:
            discount?.en ||
            discount?.english_name ||
            r.title?.en ||
            ""
        },

        // ---------- PRICE ----------
        price: {
          display:
            discount?.price?.display ||
            discount?.sale_price ||
            ""
        }
      };
    });
}
