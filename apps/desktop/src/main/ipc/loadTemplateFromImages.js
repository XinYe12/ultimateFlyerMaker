import { nativeImage } from "electron";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { generateUnderprint, getUnderprintDir } from "./generateUnderprint.js";

async function sampleBackgroundColor(imgPath, width, height) {
  const cs = Math.max(1, Math.min(10, Math.floor(Math.min(width, height) * 0.03)));
  try {
    const [tl, tr, bl, br] = await Promise.all([
      sharp(imgPath).extract({ left: 0, top: 0, width: cs, height: cs }).flatten({ background: "#fff" }).raw().toBuffer(),
      sharp(imgPath).extract({ left: width - cs, top: 0, width: cs, height: cs }).flatten({ background: "#fff" }).raw().toBuffer(),
      sharp(imgPath).extract({ left: 0, top: height - cs, width: cs, height: cs }).flatten({ background: "#fff" }).raw().toBuffer(),
      sharp(imgPath).extract({ left: width - cs, top: height - cs, width: cs, height: cs }).flatten({ background: "#fff" }).raw().toBuffer(),
    ]);
    let r = 0, g = 0, b = 0, count = 0;
    for (const buf of [tl, tr, bl, br]) {
      for (let i = 0; i < buf.length; i += 3) { r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; count++; }
    }
    if (!count) return "#ffffff";
    const h = v => Math.round(v / count).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  } catch {
    return "#ffffff";
  }
}

function clampDim(v, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 100) return fallback;
  return Math.min(n, 8000);
}

/**
 * Load flyer images for manual template setup — no OCR or layout detection.
 * Returns one page per image with empty regions/boxes; user configures everything in the wizard.
 */
export async function loadTemplateFromImages(_event, payload) {
  const rawPages = Array.isArray(payload?.pages) ? payload.pages : null;
  const imagePaths = rawPages
    ? rawPages.map((p) => String(p.path || "")).filter(Boolean)
    : (Array.isArray(payload) ? payload : []).map(String).filter(Boolean);

  if (!imagePaths.length) {
    throw new Error("No images provided");
  }

  const templateId = `imported_${Date.now()}`;
  const underprintDir = getUnderprintDir(templateId);
  await fs.promises.mkdir(underprintDir, { recursive: true });

  const pages = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i];
    const override = rawPages?.[i];

    const img = nativeImage.createFromPath(imgPath);
    const { width: imgW, height: imgH } = img.getSize();
    if (!imgW || !imgH) {
      throw new Error(`Could not read dimensions for image: ${path.basename(imgPath)}`);
    }

    const canvasWidth = clampDim(override?.canvasWidth, imgW);
    const canvasHeight = clampDim(override?.canvasHeight, imgH);
    let backgroundColor = String(override?.backgroundColor || "").trim();
    if (!backgroundColor) backgroundColor = await sampleBackgroundColor(imgPath, imgW, imgH);

    const underprintPath = path.join(underprintDir, `p${i + 1}.png`);
    await generateUnderprint(imgPath, underprintPath, canvasWidth, canvasHeight, []);

    pages.push({
      pageId: `p${i + 1}`,
      canvasWidth,
      canvasHeight,
      backgroundColor,
      boxes: [],
      departmentAreas: [],
      sourceImagePath: imgPath,
      backgroundImage: underprintPath,
    });
  }

  return {
    templateId,
    isCustom: true,
    name: "Imported Template",
    pages,
  };
}

/** Probe image file dimensions for the upload step UI. */
export async function probeTemplateImages(_event, imagePaths) {
  if (!Array.isArray(imagePaths) || imagePaths.length === 0) return [];

  return imagePaths.map((imgPath) => {
    const img = nativeImage.createFromPath(String(imgPath));
    const { width, height } = img.getSize();
    return {
      path: String(imgPath),
      width: width || 800,
      height: height || 1000,
    };
  });
}
