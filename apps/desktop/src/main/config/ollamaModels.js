/**
 * Ollama config for local template layout parsing.
 */

export function resolveOllamaBaseUrl() {
  return String(process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
}

/** Vision model — default qwen2.5vl for flyer layout. */
export function resolveOllamaVisionModel() {
  const configured = String(process.env.OLLAMA_VISION_MODEL || "").trim();
  return configured || "qwen2.5vl";
}

/** Text-only fallback — OCR context → JSON without sending the image. */
export function resolveOllamaTextModel() {
  const configured = String(process.env.OLLAMA_TEXT_MODEL || "").trim();
  return configured || "qwen2.5:7b";
}

/** Context window for layout parsing (vision image + OCR + schema exceed Ollama's 4096 default). */
export function resolveOllamaNumCtx() {
  const raw = String(process.env.OLLAMA_NUM_CTX || "").trim();
  if (!raw) return 16_384;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 4096) return 16_384;
  return parsed;
}
