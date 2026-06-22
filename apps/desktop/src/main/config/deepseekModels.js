/**
 * Returns the DeepSeek chat model name for JSON structuring / repair.
 * Priority: DEEPSEEK_MODEL env → deepseek-v4-flash.
 */
export function resolveDeepSeekModel() {
  const configured = String(process.env.DEEPSEEK_MODEL || "").trim();
  if (configured) return configured;
  return "deepseek-v4-flash";
}
