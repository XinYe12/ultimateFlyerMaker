import { runCutout } from "./cutoutClient.js";
import path from "path";

export async function applyImageTreatment(flyerItem) {
  const outputDir = path.dirname(flyerItem.image.src);

  const cutoutPath = await runCutout(
    flyerItem.image.src,
    outputDir
  );

  flyerItem.image.src = cutoutPath;
  return flyerItem;
}
