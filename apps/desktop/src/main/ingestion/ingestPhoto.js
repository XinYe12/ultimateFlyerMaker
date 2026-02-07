import { runCutout } from "../cutoutClient.js";
import { runOCR } from "./ocrService.js";
import { runDeepSeek } from "./deepseekService.js";
import sizeOf from "image-size";
import { formatTitle } from "./formatTitle.js";
import { decideSizeFromAspectRatio } from "../../../../shared/flyer/layout/sizeFromImage.js";
import { validateResult } from "./validateResult.js";
import { addShadowToCutout } from "./addShadow.js";

export async function ingestPhoto(inputPath) {
  // ---------- OCR FIRST ----------
  const ocrResult = await runOCR(inputPath);
  console.log("OCR DEBUG [ingestPhoto] ocrResult:", ocrResult);

  const rec_texts = Array.isArray(ocrResult)
    ? ocrResult[0]?.rec_texts ?? []
    : [];

  // ---------- DEEPSEEK ----------
  let llmResult = { items: [] };

  if (rec_texts.length > 0) {
    llmResult = await runDeepSeek({
      raw_ocr_text: rec_texts,
      image_path: inputPath,
    });
  }

const title = formatTitle(llmResult);


  // ---------- CUTOUT ----------
  const baseCutoutPath = await runCutout(inputPath);
  console.log("✂️ [ingestPhoto] Cutout complete:", baseCutoutPath);

  // ---------- ADD SHADOW ----------
  const cutoutPath = await addShadowToCutout(baseCutoutPath);
  console.log("🎨 [ingestPhoto] Shadow applied, using:", cutoutPath);

  // ---------- LAYOUT ----------
  let layout = { size: "SMALL" };
  try {
    const { width, height } = sizeOf(cutoutPath);
    const aspectRatio =
      typeof width === "number" && typeof height === "number"
        ? width / height
        : null;
    layout.size = decideSizeFromAspectRatio(aspectRatio);
  } catch {}

  return {
    inputPath,
    cutoutPath,
    layout,
    title,
      // preserve AI suggestion forever
    aiTitle: title,
    ocr: ocrResult, // ✅ preserve full OCR array
    llmResult,
  };
}
