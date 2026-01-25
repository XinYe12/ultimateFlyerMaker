export async function matchDiscountsInEditor(images: any[]) {
  const discounts = await window.ufm.getDiscounts();

  if (!images.length || !discounts.length) {
    return images.map(i => ({
      ...i,
      discount: null,
      matchScore: 0,
      matchConfidence: "none",
    }));
  }

  const matched = await window.ufm.matchDiscountToSlots({
    images,
    discounts,
  });

  return matched;
}
