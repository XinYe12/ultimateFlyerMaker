import canvasPkg from "@napi-rs/canvas";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

const { createCanvas, loadImage } = canvasPkg;

/**
 * Adds a drop shadow beneath a cutout image (transparent PNG)
 * @param {string} cutoutPath - Path to the cutout PNG with transparent background
 * @returns {Promise<string>} - Path to the new image with shadow
 */
export async function addShadowToCutout(cutoutPath) {
  console.log("🎨 [addShadow] Starting shadow overlay for:", cutoutPath);

  // Load the cutout image
  const img = await loadImage(cutoutPath);
  console.log(`🎨 [addShadow] Loaded image: ${img.width}x${img.height}`);

  // Shadow configuration - Dense and visible
  const SHADOW_BLUR = 50;
  const SHADOW_OFFSET_X = 0;
  const SHADOW_OFFSET_Y = 25;
  const SHADOW_COLOR = "rgba(0, 0, 0, 0.85)";

  // Add padding to accommodate shadow blur
  const PADDING = SHADOW_BLUR * 2;

  // Create canvas with extra space for shadow
  const canvas = createCanvas(
    img.width + PADDING * 2,
    img.height + PADDING * 2
  );
  const ctx = canvas.getContext("2d");

  // Configure shadow
  ctx.shadowColor = SHADOW_COLOR;
  ctx.shadowBlur = SHADOW_BLUR;
  ctx.shadowOffsetX = SHADOW_OFFSET_X;
  ctx.shadowOffsetY = SHADOW_OFFSET_Y;

  // Draw the cutout image with shadow
  ctx.drawImage(
    img,
    PADDING,
    PADDING,
    img.width,
    img.height
  );

  // Generate output path
  const outputPath = cutoutPath.replace(".cutout.png", ".cutout.shadow.png");

  // Save the result
  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(outputPath, buffer);

  // Verify from code POV: output is different and file exists with content
  if (outputPath === cutoutPath) throw new Error("[addShadow] output path must differ from input");
  const stat = await fs.stat(outputPath);
  if (!stat.isFile() || stat.size === 0) throw new Error("[addShadow] shadow file missing or empty: " + outputPath);

  console.log("✅ [addShadow] Shadow added successfully! Output:", outputPath);

  return outputPath;
}
