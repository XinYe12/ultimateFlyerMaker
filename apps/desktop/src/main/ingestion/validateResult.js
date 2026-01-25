// apps/desktop/src/main/ingestion/validateResult.js
// Validates FINAL ingest result before entering Editor State

export function validateResult(result) {
  if (!result || typeof result !== "object") return false;

  // required structural fields
  if (!result.inputPath) return false;
  if (!result.cutoutPath) return false;
  if (!result.layout || !result.layout.size) return false;

  // title must exist (can be empty string, but must be present)
  if (!result.title || typeof result.title.en !== "string") return false;

  // OCR must be array (can be empty)
  if (!Array.isArray(result.ocr)) return false;

  return true;
}
