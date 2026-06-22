import { runOCR } from "./ocrService.js";
import { runDeepSeek } from "./deepseekService.js";
import sizeOf from "image-size";
import { formatTitle } from "./formatTitle.js";
import { decideSizeFromAspectRatio } from "../../../../shared/flyer/layout/sizeFromImage.js";
import { runCutoutPipeline } from "./cutoutPipeline.js";

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
  const pipelineResult = await runCutoutPipeline(inputPath);
  const cutoutPath = pipelineResult.path;
  console.log(pipelineResult.skippedCutout ? "⚡ [phase2] Cutout skipped (already transparent):" : "✂️ [phase2] Cutout complete:", cutoutPath);

  let layout = { size: "SMALL" };
  try {
    let { width, height } = sizeOf(cutoutPath);
    if (cutoutPath.includes(".shadow.png") && width > 200 && height > 200) {
      width -= 200;
      height -= 200;
    }
    const ar = typeof width === "number" && typeof height === "number" ? width / height : null;
    layout.size = decideSizeFromAspectRatio(ar);
  } catch {}

  return {
    cutoutPath,
    layout,
    lowConfidence: pipelineResult.lowConfidence,
    qualityReason: pipelineResult.qualityReason,
    cutoutDiagnostics: pipelineResult,
  };
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


  // ---------- CUTOUT + SHADOW ----------
  const pipelineResult = await runCutoutPipeline(inputPath);
  const cutoutPath = pipelineResult.path;
  console.log(pipelineResult.skippedCutout ? "⚡ [ingestPhoto] Cutout skipped (already transparent):" : "✂️ [ingestPhoto] Cutout + shadow complete:", cutoutPath);

  // ---------- LAYOUT ----------
  let layout = { size: "SMALL" };
  try {
    let { width, height } = sizeOf(cutoutPath);
    if (cutoutPath.includes(".shadow.png") && width > 200 && height > 200) {
      width -= 200;
      height -= 200;
    }
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
    lowConfidence: pipelineResult.lowConfidence,
    qualityReason: pipelineResult.qualityReason,
    cutoutDiagnostics: pipelineResult,
    title,
    aiTitle: title,
    ocr: ocrResult,
    llmResult,
  };
}
