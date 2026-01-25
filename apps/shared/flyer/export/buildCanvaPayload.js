import { buildFlyerCard } from "../models/buildFlyerCard";

export function buildCanvaPayload({
  template,
  placements,
  items,
}) {
  const elements = [];

  placements.forEach((p, i) => {
    const item = items[i];
    if (!item) return;

    const card = buildFlyerCard(p);

    if (item.image?.src) {
      elements.push({
        type: "image",
        src: item.image.src,
        x: card.image.x,
        y: card.image.y,
        width: card.image.width,
        height: card.image.height,
      });
    }

    if (item.title?.en) {
      elements.push({
        type: "text",
        text: item.title.en,
        x: card.title.x,
        y: card.title.y,
        maxWidth: card.title.maxWidth,
        fontSize: 22,
        fontWeight: "bold",
      });
    }

    if (item.price?.display) {
      elements.push({
        type: "text",
        text: item.price.display,
        x: card.price.x,
        y: card.price.y,
        fontSize: 36,
        fontWeight: "bold",
        color: "#c00",
        anchor: "bottom-right",
      });
    }
  });

  return {
    template,
    elements,
  };
}
