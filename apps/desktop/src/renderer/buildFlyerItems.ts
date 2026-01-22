// apps/desktop/src/renderer/buildFlyerItems.ts

export function buildFlyerItems(imageResults: any[]) {
  return imageResults.map((r, index) => {
    const discount = r.discount || null;

    // ---------- TITLE (AUTHORITATIVE) ----------
    const zh =
      discount?.zh && discount.zh.trim()
        ? discount.zh.trim()
        : "";

    const en =
      discount?.en && discount.en.trim()
        ? discount.en.trim()
        : r.title?.en || "";

    // ---------- PRICE DISPLAY (ALREADY NORMALIZED) ----------
    // price.display must be prepared in MAIN
    const priceDisplay =
      discount?.price?.display ??
      discount?.display ??
      "";

    return {
      id: `item_${index + 1}`,

      // ---------- IMAGE ----------
      image: {
        src: r.image?.src || ""
      },

      // ---------- LAYOUT ----------
      layout: r.layout,

      department: r.department ?? "grocery",

      // ---------- META ----------
      meta: {
        en,
        zh
      },

      // ---------- PRICE (TEXT ONLY) ----------
      price: {
        display: priceDisplay
      }
    };
  });
}
