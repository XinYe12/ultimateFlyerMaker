// services/ocrService.js
import tesseract from "node-tesseract-ocr";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const config = {
  lang: "eng",
  oem: 1,
  psm: 3,
};

// Existing function (path-based OCR)
export async function extractTextFromImage(imagePath) {
  try {
    const rawText = await tesseract.recognize(imagePath, config);
    const cleaned = rawText.replace(/\s+/g, " ").trim();
    return cleaned;
  } catch (err) {
    console.error("OCR error:", err);
    throw err;
  }
}

// NEW function required by autoImageSearchRoute.js
// Accepts buffer → saves temp file → OCR → deletes file
export async function ocrImage(buffer) {
  const tempFile = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    `temp_ocr_${Date.now()}.png`
  );

  // Save buffer to temp file
  fs.writeFileSync(tempFile, buffer);

  try {
    const rawText = await tesseract.recognize(tempFile, config);
    const cleaned = rawText.replace(/\s+/g, " ").trim();
    return cleaned;
  } catch (err) {
    console.error("OCR error (buffer):", err);
    throw err;
  } finally {
    // Cleanup
    fs.unlinkSync(tempFile);
  }
}
