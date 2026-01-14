import { ingestPhoto } from "../ingestion/ingestPhoto.js";

export async function ingestImages(_event, imagePaths) {
  const results = [];

  // ✅ sequential to avoid OCR overload/timeouts
  for (const p of imagePaths) {
    results.push(await ingestPhoto(p));
  }

  return results;
}