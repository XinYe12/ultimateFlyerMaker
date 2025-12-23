// server/services/imageAnalysisService.js
import fs from "fs";
import { parseProductTitle } from "../parseTitleDeepSeek.js";
import vision from "@google-cloud/vision";

const client = new vision.ImageAnnotatorClient();

export async function analyzeImageAndParse(filePath) {
  const [ocr] = await client.textDetection(filePath);
  const texts = ocr.textAnnotations?.map(t => t.description) || [];
  const ocrText = texts.join(" ");

  let parsed = {};
  try {
    const aiTitle = await parseProductTitle(ocrText);
    parsed = {
      title_ai: aiTitle,
      ocrText
    };
  } catch (e) {
    parsed = {
      title_ai: "",
      ocrText
    };
  }

  // cleanup
  fs.unlinkSync(filePath);

  return parsed;
}
