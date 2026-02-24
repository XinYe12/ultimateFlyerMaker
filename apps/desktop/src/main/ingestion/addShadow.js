import canvasPkg from "@napi-rs/canvas";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

const { createCanvas, loadImage } = canvasPkg;

/**
 * Scans an RGBA ImageData buffer and returns the bounding box of non-transparent pixels.
 * Returns null if the image is entirely transparent.
 */
function getNonTransparentBbox(data, width, height) {
  let top = -1, bottom = -1, left = width, right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (top === -1) top = y;
        bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (top === -1) return null;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/**
 * Adds a drop shadow beneath a cutout image (transparent PNG)
 * @param {string} cutoutPath - Path to the cutout PNG with transparent background
 * @returns {Promise<string>} - Path to the new image with shadow
 */
export async function addShadowToCutout(cutoutPath) {
  console.log("🎨 [addShadow] Starting shadow overlay for:", cutoutPath);

  const img = await loadImage(cutoutPath);
  console.log(`🎨 [addShadow] Loaded image: ${img.width}x${img.height}`);

  // ── Step 1: find tight non-transparent bounding box ──
  const measureCanvas = createCanvas(img.width, img.height);
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.drawImage(img, 0, 0);
  const { data } = measureCtx.getImageData(0, 0, img.width, img.height);
  const bbox = getNonTransparentBbox(data, img.width, img.height);

  // Fall back to full image if bbox detection fails (fully opaque image / unusual format)
  const srcX = bbox ? bbox.x : 0;
  const srcY = bbox ? bbox.y : 0;
  const srcW = bbox ? bbox.w : img.width;
  const srcH = bbox ? bbox.h : img.height;
  console.log(`🎨 [addShadow] Trimmed to ${srcW}x${srcH} (from ${img.width}x${img.height})`);

  // ── Step 2: create shadow canvas sized to trimmed content ──
  const SHADOW_BLUR = 50;
  const SHADOW_OFFSET_X = 0;
  const SHADOW_OFFSET_Y = 25;
  const SHADOW_COLOR = "rgba(0, 0, 0, 0.85)";
  const PADDING = SHADOW_BLUR * 2;

  const canvas = createCanvas(srcW + PADDING * 2, srcH + PADDING * 2);
  const ctx = canvas.getContext("2d");

  ctx.shadowColor = SHADOW_COLOR;
  ctx.shadowBlur = SHADOW_BLUR;
  ctx.shadowOffsetX = SHADOW_OFFSET_X;
  ctx.shadowOffsetY = SHADOW_OFFSET_Y;

  // Draw only the trimmed region at the padded position
  ctx.drawImage(img, srcX, srcY, srcW, srcH, PADDING, PADDING, srcW, srcH);

  // ── Step 3: save ──
  const outputPath = cutoutPath.replace(".cutout.png", ".cutout.shadow.png");
  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(outputPath, buffer);

  if (outputPath === cutoutPath) throw new Error("[addShadow] output path must differ from input");
  const stat = await fs.stat(outputPath);
  if (!stat.isFile() || stat.size === 0) throw new Error("[addShadow] shadow file missing or empty: " + outputPath);

  console.log("✅ [addShadow] Shadow added successfully! Output:", outputPath);
  return outputPath;
}
