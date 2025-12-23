import sharp from "sharp";

export async function applyCardTreatment(
  inputPath,
  outputPath,
  {
    targetWidth = 800,
    paddingRatio = 0.12,
    background = "#ffffff"
  } = {}
) {
  const img = sharp(inputPath);
  const meta = await img.metadata();

  const pad = Math.round(targetWidth * paddingRatio);
  const innerW = targetWidth - pad * 2;

  const resized = img.resize(innerW, null, {
    fit: "inside"
  });

  const resizedMeta = await resized.metadata();

  const cardHeight = resizedMeta.height + pad * 2;

  await resized
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background
    })
    .png()
    .toFile(outputPath);

  return {
    width: targetWidth,
    height: cardHeight,
    aspectRatio: targetWidth / cardHeight
  };
}
