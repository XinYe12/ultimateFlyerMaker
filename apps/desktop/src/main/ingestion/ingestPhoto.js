import { runCutout } from "../cutoutClient.js";
import { runOCR } from "./ocrService.js";
import { runDeepSeek } from "./deepseekService.js";
import sizeOf from "image-size";
import { formatTitle } from "./formatTitle.js";
import { decideSizeFromAspectRatio } from "../../../../shared/flyer/layout/sizeFromImage.js";
import { validateResult } from "./validateResult.js";
import { addShadowToCutout } from "./addShadow.js";

/* ---------- PHASE 1: OCR + LLM only (fast, ~3-5s) ---------- */
export async function ingestPhotoPhase1(inputPath) {
  const ocrResult = await runOCR(inputPath);
  console.log("OCR DEBUG [phase1] ocrResult:", ocrResult);

  const rec_texts = Array.isArray(ocrResult) ? ocrResult[0]?.rec_texts ?? [] : [];

  let llmResult = { items: [] };
  if (rec_texts.length > 0) {
    try {
      llmResult = await runDeepSeek({ raw_ocr_text: rec_texts, image_path: inputPath });
    } catch (err) {
      console.warn("[phase1] DeepSeek failed, continuing:", err?.message ?? err);
    }
  }

  const title = formatTitle(llmResult);
  return { inputPath, cutoutPath: null, layout: null, title, aiTitle: title, ocr: ocrResult, llmResult };
}

/* ---------- PHASE 2: cutout + shadow + sizing (slow, ~10-15s) ---------- */
export async function ingestPhotoPhase2(inputPath) {
  const baseCutoutPath = await runCutout(inputPath);
  console.log("✂️ [phase2] Cutout complete:", baseCutoutPath);

  const cutoutPath = await addShadowToCutout(baseCutoutPath);
  console.log("🎨 [phase2] Shadow applied:", cutoutPath);

  let layout = { size: "SMALL" };
  try {
    const { width, height } = sizeOf(cutoutPath);
    const ar = typeof width === "number" && typeof height === "number" ? width / height : null;
    layout.size = decideSizeFromAspectRatio(ar);
  } catch {}

  return { cutoutPath, layout };
}

/* ---------- ORIGINAL (shim — used by JobProcessor + ingestImages) ---------- */
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
    try {
      llmResult = await runDeepSeek({
        raw_ocr_text: rec_texts,
        image_path: inputPath,
      });
    } catch (err) {
      console.warn("[ingestPhoto] DeepSeek failed, continuing without LLM data:", err?.message ?? err);
    }
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
