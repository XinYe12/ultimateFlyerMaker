// server/flyer-automation/image/trimAndPad.js
import sharp from "sharp";

export async function trimAndPad(
  inputPath,
  outputPath,
  paddingRatio = 0.12
) {
  const img = sharp(inputPath);
  const trimmed = await img.trim();

  const meta = await trimmed.metadata();

  const padX = Math.round(meta.width * paddingRatio);
  const padY = Math.round(meta.height * paddingRatio);

  await trimmed
    .extend({
      top: padY,
      bottom: padY,
      left: padX,
      right: padX,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outputPath);

  return outputPath;
}
