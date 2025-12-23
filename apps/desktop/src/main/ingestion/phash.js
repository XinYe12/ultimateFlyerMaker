import sharp from "sharp";

export async function computePHash(buffer) {
  const img = sharp(buffer)
    .resize(32, 32, { fit: "fill" })
    .greyscale();

  const raw = await img.raw().toBuffer(); // 32*32 = 1024 pixels

  // Compute average brightness
  const avg = raw.reduce((sum, v) => sum + v, 0) / raw.length;

  // Build 64-bit hash from first 64 pixels
  let bits = "";
  for (let i = 0; i < 64; i++) {
    bits += raw[i] > avg ? "1" : "0";
  }

  // Convert binary → hex
  return BigInt("0b" + bits).toString(16).padStart(16, "0");
}
