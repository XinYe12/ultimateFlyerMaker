import { applyCardTreatment } from "./image/applyCardTreatment.js";
import sharp from "sharp";

(async () => {
  const input = "./uploads/raw_sample.jpg";
  const output = "./uploads/card_sample.png";

  await applyCardTreatment(input, output);

  const meta = await sharp(output).metadata();
  console.log({
    width: meta.width,
    height: meta.height,
    aspectRatio: meta.width / meta.height
  });
})();
