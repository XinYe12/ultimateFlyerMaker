import { ingestPhoto } from "../ingestion/ingestPhoto.js";

export async function ingestImages(_event, imagePaths) {
  if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
    throw new Error("ingestImages expects non-empty array");
  }

  const results = [];

  for (const imagePath of imagePaths) {
    const result = await ingestPhoto(imagePath);
    results.push(result);
  }

  return results;
}
