import { runCutout } from "../cutoutClient.js";
import { runOCR } from "./ocrService.js";
import { runDeepSeek } from "./deepseekService.js";
import sizeOf from "image-size";
import { decideSizeFromAspectRatio } from "../../../../shared/flyer/layout/sizeFromImage.js";

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

  const bestItem = Array.isArray(llmResult?.items)
    ? llmResult.items[0]
    : null;

  // ---------- CUTOUT ----------
  const cutoutPath = await runCutout(inputPath);

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
    title: {
      en: bestItem?.english_name || "",
      zh: bestItem?.chinese_name || "",
    },
    ocr: ocrResult, // ✅ preserve full OCR array
    llmResult,
  };
}
