export function buildCanvaPayload({ items, placements }) {
  const itemMap = new Map(items.map(i => [i.id, i]));

  return {
    template_id: "FLYER_EMPTY_V1",
    elements: placements.map(p => {
      const item = itemMap.get(p.itemId);
      if (!item) return null;

      return {
        id: item.id,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        image: item.image?.src || "",
        size: item.layout?.size || "SMALL",
        department: item.department || "grocery",
        title_en: item.meta?.en || "",
        title_zh: item.meta?.zh || "",
        price: item.price?.display || ""
      };
    }).filter(Boolean)
  };
}
