import { createCanvas, loadImage } from "@napi-rs/canvas";

const SIZE = 32;
const SMALLER = 8;

/**
 * Compute a 64-bit DCT perceptual hash (pHash) for an image.
 * Ported from ImageHash.java — identical DCT formula and median threshold.
 * @param {string} imagePath Absolute path to the image file.
 * @returns {Promise<string>} 16-char hex string representing the 64-bit hash.
 */
export async function computePHash(imagePath) {
  const img = await loadImage(imagePath);
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  // RGBA → grayscale float grid (BT.601 luma)
  const vals = [];
  for (let y = 0; y < SIZE; y++) {
    const row = new Float64Array(SIZE);
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      row[x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    vals.push(row);
  }

  const dct = applyDCT(vals);

  // Top-left 8×8 block, skip DC component [0][0]
  const list = [];
  for (let y = 0; y < SMALLER; y++) {
    for (let x = 0; x < SMALLER; x++) {
      if (!(x === 0 && y === 0)) list.push(dct[y][x]);
    }
  }

  // Compute median
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid] + sorted[mid - 1]) / 2
      : sorted[mid];

  // Build 63-bit hash (63 values: 8*8 - 1 DC component)
  let hash = 0n;
  for (const v of list) {
    hash = (hash << 1n) | (v > median ? 1n : 0n);
  }

  // Pad to 16 hex chars (64 bits)
  return hash.toString(16).padStart(16, "0");
}

/**
 * Compute 2D DCT-II — exact formula matching ImageHash.java.
 * F[u][v] = 0.25 * cu * cv * Σ_i Σ_j cos((2i+1)*u*π/(2*SIZE)) * cos((2j+1)*v*π/(2*SIZE)) * f[i][j]
 */
function applyDCT(f) {
  const result = [];
  for (let u = 0; u < SIZE; u++) {
    result.push(new Float64Array(SIZE));
    const cu = u === 0 ? 1 / Math.sqrt(2) : 1.0;
    for (let v = 0; v < SIZE; v++) {
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1.0;
      let sum = 0;
      for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE; j++) {
          sum +=
            Math.cos(((2 * i + 1) * u * Math.PI) / (2 * SIZE)) *
            Math.cos(((2 * j + 1) * v * Math.PI) / (2 * SIZE)) *
            f[i][j];
        }
      }
      result[u][v] = 0.25 * cu * cv * sum;
    }
  }
  return result;
}

/**
 * Compute the Hamming distance between two 16-char hex pHash strings.
 * @param {string} h1
 * @param {string} h2
 * @returns {number} Number of differing bits (0–64).
 */
export function hammingDistance(h1, h2) {
  let xor = BigInt("0x" + h1) ^ BigInt("0x" + h2);
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}
