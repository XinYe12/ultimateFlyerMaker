
export function createFlyerItem({
  id,
  enTitle,
  cnTitle,
  priceValue,
  unit,
  category,
  department = "grocery",
  imageSrc = "",
  aspectRatio = null,
  confidence = 0.9,
  sourceText = ""
}) {


  return {
    id,
    department,
    title: {
      en: enTitle,
      cn: cnTitle,
    },
    price: {
      value: priceValue,
      unit,
      display: unit
        ? `$${priceValue.toFixed(2)} /${unit}`
        : `$${priceValue.toFixed(2)}`,
    },
    category,
    image: {
      src: imageSrc,
      source: imageSrc ? "internal" : "external",
      aspectRatio,
    },

    // 🔒 CARD IS NOW PART O

    confidence,
    meta: {
      sourceText,
    },
  };
}
