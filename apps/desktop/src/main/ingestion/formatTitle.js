// apps/desktop/src/main/ingestion/formatTitle.js
// Trust DeepSeek to choose the most likely title (EN / ZH / SIZE)

export function formatTitle(deepSeekResult) {
  const best = deepSeekResult?.best_title;

  if (!best) {
    return {
      en: "",
      zh: "",
      size: "",
      confidence: "low",
      source: "deepseek",
    };
  }

  const en = (best.english_name || "").trim();
  const zh = (best.chinese_name || "").trim();
  const size = (best.size || "").trim();

  return {
    en,
    zh,
    size,
    confidence: best.confidence >= 0.6 ? "high" : "low",
    source: "deepseek",
  };
}
