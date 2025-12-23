import { runCutout } from "../cutoutClient.js";
import { runOCR } from "./ocrService.js";
import { searchByImage } from "./searchService.js";
import { braveImageSearch } from "./braveSearchService.js";

export async function ingestPhoto(inputPath) {
  const cutoutPath = await runCutout(inputPath);

  const ocr = await runOCR(cutoutPath);

  const dbMatches = await searchByImage(cutoutPath);

  const webMatches = await braveImageSearch(cutoutPath, ocr);

  return {
    inputPath,
    cutoutPath,
    ocr,
    dbMatches,
    webMatches,
  };
}
