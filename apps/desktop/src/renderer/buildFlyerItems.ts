// apps/desktop/src/renderer/buildFlyerItems.ts

import { decideSizeFromAspectRatio } from "../../../shared/flyer/layout/sizeFromImage.js";

export function buildFlyerItems(imageResults: any[]) {
  return imageResults.map((r, index) => {
    const width = r.width;
    const height = r.height;

    const aspectRatio =
      typeof width === "number" && typeof height === "number"
        ? width / height
        : null;

    const size = decideSizeFromAspectRatio(aspectRatio);

    return {
      id: `item_${index}`,
      imagePath: r.imagePath || r.path,
      layout: { size }, // 🔑 REQUIRED by placeItems
      meta: {
        en: r.title?.en || "",
        zh: r.title?.zh || "",
        size: r.title?.size || ""
      }
    };
  });
}
