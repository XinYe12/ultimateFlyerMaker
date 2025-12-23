// server/flyer-automation/image/computeMetadata.js
import sharp from "sharp";

export async function computeImageMetadata(imagePath) {
  const meta = await sharp(imagePath).metadata();

  const width = meta.width;
  const height = meta.height;

  return {
    width,
    height,
    aspectRatio: width / height,
  };
}
