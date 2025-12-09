// services/ocrService.js
import tesseract from "node-tesseract-ocr";

const config = {
  lang: "eng",
  oem: 1,
  psm: 3,
};

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
