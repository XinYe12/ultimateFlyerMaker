import { runCutout } from "../cutoutClient.js";
import { runOCR } from "./ocrService.js";
import { runDeepSeek } from "./deepseekService.js";
import sizeOf from "image-size";
import { formatTitle } from "./formatTitle.js";
import { decideSizeFromAspectRatio } from "../../../../shared/flyer/layout/sizeFromImage.js";
import { validateResult } from "./validateResult.js";
import { addShadowToCutout } from "./addShadow.js";
import { getResourceProfile } from "../resourceProfile.js";

function getCutoutFallbackModel(primaryModel) {
  const explicit = String(process.env.UFM_CUTOUT_FALLBACK_MODEL || "").trim();
  if (explicit === "0" || /^none$/i.test(explicit)) return null;
  if (explicit && explicit !== primaryModel) return explicit;

  const current = primaryModel || getResourceProfile().rembgModel || "u2net";
  if (current === "u2net" || current === "briaai-rmbg" || current === "bria" || current === "briaai-rmbg-1.4") {
    return "isnet-general-use";
  }
  if (current === "isnet-general-use") return "birefnet-general-lite";
  if (current === "birefnet-general-lite") return "birefnet-general";
  return null;
}

async function runCutoutWithFallback(inputPath) {
  let cutout = await runCutout(inputPath);
  const fallbackModel = cutout.lowConfidence ? getCutoutFallbackModel(cutout.model) : null;
  if (fallbackModel) {
    console.log(
      `[ingestPhoto] Cutout low-confidence (${cutout.qualityReason || "unknown"}) — retrying with ${fallbackModel}`
    );
    try {
      const fallback = await runCutout(inputPath, undefined, { model: fallbackModel });
      if (!fallback.lowConfidence) cutout = fallback;
    } catch (err) {
      console.warn(`[ingestPhoto] Fallback cutout failed (${fallbackModel}):`, err?.message ?? err);
    }
  }
  return cutout;
}

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
  const cutoutResult = await runCutoutWithFallback(inputPath);
  const baseCutoutPath = cutoutResult.path;
  console.log("✂️ [phase2] Cutout complete:", baseCutoutPath);

  const cutoutPath = await addShadowToCutout(baseCutoutPath, {
    lowConfidence: cutoutResult.lowConfidence,
    qualityReason: cutoutResult.qualityReason,
    borderAlpha: cutoutResult.borderAlpha,
    bboxAreaRatio: cutoutResult.bboxAreaRatio,
  });
  console.log("🎨 [phase2] Shadow applied:", cutoutPath);

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
    lowConfidence: cutoutResult.lowConfidence,
    qualityReason: cutoutResult.qualityReason,
    cutoutDiagnostics: cutoutResult,
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


  // ---------- CUTOUT ----------
  const cutoutResult = await runCutoutWithFallback(inputPath);
  const baseCutoutPath = cutoutResult.path;
  console.log("✂️ [ingestPhoto] Cutout complete:", baseCutoutPath);

  // ---------- ADD SHADOW ----------
  const cutoutPath = await addShadowToCutout(baseCutoutPath, {
    lowConfidence: cutoutResult.lowConfidence,
    qualityReason: cutoutResult.qualityReason,
    borderAlpha: cutoutResult.borderAlpha,
    bboxAreaRatio: cutoutResult.bboxAreaRatio,
  });
  console.log("🎨 [ingestPhoto] Shadow applied, using:", cutoutPath);

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
    lowConfidence: cutoutResult.lowConfidence,
    qualityReason: cutoutResult.qualityReason,
    cutoutDiagnostics: cutoutResult,
    title,
      // preserve AI suggestion forever
    aiTitle: title,
    ocr: ocrResult, // ✅ preserve full OCR array
    llmResult,
  };
}
