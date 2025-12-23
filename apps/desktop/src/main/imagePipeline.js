import { runCutout } from "./cutoutClient.js";
import path from "path";

/**
 * ALWAYS run CUTOUT.
 * Input: FlyerItem
 * Output: FlyerItem with image.src replaced by cutout PNG
 */
export async function processFlyerImage(flyerItem) {
  const src = flyerItem.image?.src;
  if (!src) return flyerItem;

  const outputDir = path.dirname(src);

  const cutoutPath = await runCutout(src, outputDir);
  flyerItem.image.src = cutoutPath;

  return flyerItem;
}
