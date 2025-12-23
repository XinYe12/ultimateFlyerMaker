// apps/desktop/apps/desktop/src/main/ingestion/ocrService.js
// ✅ ELECTRON MAIN VERSION — COPY / PASTE AS-IS

import tesseract from "node-tesseract-ocr";

const config = {
  lang: "eng",
  oem: 1,
  psm: 3,
};

/* =========================
   PATH-BASED OCR (USED)
========================= */

export async function runOCR(imagePath) {
  try {
    const rawText = await tesseract.recognize(imagePath, config);
    return {
      text: rawText.replace(/\s+/g, " ").trim(),
    };
  } catch (err) {
    console.error("OCR error:", err);
    return { text: "" };
  }
}
