import { runCutout } from "../cutoutClient.js";
import { runOCR } from "./ocrService.js";
import { searchByImage } from "./searchService.js";
import { braveImageSearch } from "./braveSearchService.js";
import { parseTitleDeepseek } from "./parseTitleDeepseek.js";


export async function ingestPhoto(inputPath) {
  const cutoutPath = await runCutout(inputPath);

  const ocr = await runOCR(cutoutPath);

  const title = await parseTitleDeepseek(ocr.text);
  const dbMatches = await searchByImage(cutoutPath);
  const webMatches = await braveImageSearch(cutoutPath, ocr);

  return {
    inputPath,
    cutoutPath,
    ocr,
    title,
    dbMatches,
    webMatches,
  };
}
