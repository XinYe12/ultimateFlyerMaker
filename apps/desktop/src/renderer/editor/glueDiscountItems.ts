// apps/desktop/src/renderer/editor/glueDiscountItems.ts

export type DiscountItem = {
  id: string;

  image: {
    src: string;
  };

  title: {
    en: string;
    zh?: string;
  };

  price: {
    display: string;
  };


  match: {
    confidence: "high" | "low" | "none";
    score: number;
  };
};

export function glueDiscountItems(editorQueue: any[]): DiscountItem[] {
  return editorQueue.map((q, idx) => {
    // support DEBUG items + real pipeline items
    const r = q.result ?? q;
    const d = r.discount ?? {};

    return {
      id: q.id ?? `discount_item_${idx + 1}`,

      image: {
        src: r.cutoutPath ?? r.image?.path ?? "",
      },

      title: {
        en:
          d.en ||
          d.english_name ||
          r.title?.en ||
          r.title ||
          "",
        zh:
          d.zh ||
          d.chinese_name ||
          r.title?.zh ||
          "",
      },

      price: {
        display:
          d.price?.display ||
          r.price?.display ||
          "",
      },

      match: {
        confidence: r.matchConfidence ?? "high",
        score: r.matchScore ?? 1,
      },
    };
  });
}
