import { generateCutoutPNG } from "../browser-ml/cutoutService";

/**
 * Mutates FlyerItem in-place
 */
export async function applyImageTreatment(item) {
  if (!item?.image) return item;

  // RULE: LARGE → CUTOUT
  if (
    item.layout?.size === "LARGE" &&
    item.rawImageFile
  ) {
    try {
      const png = await generateCutoutPNG(item.rawImageFile);
      item.image = {
        src: png,
        treatment: "CUTOUT",
      };
    } catch (e) {
      // fallback
      item.image.treatment = "FOCUS_CARD";
    }
  }

  return item;
}
