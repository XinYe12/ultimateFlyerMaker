// server/flyer-automation/models/FlyerItem.js
import { decideSizeFromAspectRatio } from "./layout/sizeFromImage.js";

export function createFlyerItem({
  id,
  enTitle,
  cnTitle,
  priceValue,
  unit,
  category,
  department = "grocery",   // ✅ ADD
  imageSrc = "",
  confidence = 0.9,
  sourceText = ""
}) {
  return {
    id,
    title: {
      en: enTitle,
      cn: cnTitle
    },
    price: {
      value: priceValue,
      unit,
      display: `$${priceValue.toFixed(2)} /${unit}`
    },
    category,
    image: {
      src: imageSrc,
      source: imageSrc ? "internal" : "external",
      aspectRatio
    },
    layout: {
      size
    },
    confidence,
    meta: {
      sourceText
    }
  };
}
// after image is chosen
item.image.aspectRatio = aspectRatio;
item.layout.size = decideSizeFromAspectRatio(aspectRatio);
