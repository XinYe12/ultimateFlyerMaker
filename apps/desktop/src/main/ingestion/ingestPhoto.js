import { runCutout } from "../cutoutClient.js";
import { runOCR } from "./ocrService.js";
import { searchByImage } from "./searchService.js";
import { braveImageSearch } from "./braveSearchService.js";
import { parseTitleDeepseek } from "./parseTitleDeepseek.js";

export async function ingestPhoto(inputPath) {
  const cutoutPath = await runCutout(inputPath);

  const ocr = await runOCR(cutoutPath);

  // ✅ make sure UI + downstream always have ocr.text
  const rec_texts = Array.isArray(ocr?.rec_texts) ? ocr.rec_texts : [];
  ocr.text = rec_texts.join(" ");
  console.log("[INGEST] ocr:", ocr);
  console.log("[INGEST] ocr.text:", ocr?.text);

  const title = await parseTitleDeepseek(ocr.text);
  const dbMatches = await searchByImage(cutoutPath);
  const webMatches = await braveImageSearch(cutoutPath, ocr);

  return {
    inputPath,
    cutoutPath,
    title,
    dbMatches,
    webMatches,
    ocr, // ✅ unchanged shape for UI
  };
}
