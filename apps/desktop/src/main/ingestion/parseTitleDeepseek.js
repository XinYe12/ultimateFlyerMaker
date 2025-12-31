// apps/desktop/src/main/ingestion/parseTitleDeepseek.js
// clearnOCR is not used for now
function cleanOCR(text) {
  if (!text) return "";

  let t = text;

  // remove latin letters
  t = t.replace(/[a-zA-Z]/g, " ");

  // remove weight patterns
  t = t.replace(/\d+(\.\d+)?\s*(kg|g|克|lb|oz)/gi, " ");

  // keep Chinese only
  t = t.replace(/[^\u4e00-\u9fa5\s]/g, " ");

  // normalize spaces
  return t.replace(/\s+/g, " ").trim();
}

export async function parseTitleDeepseek(ocrText) {
  const raw = process.env.DEEPSEEK_API_KEY;
  const key = typeof raw === "string" ? raw.trim() : String(raw || "").trim();

  if (!key || key.toLowerCase() === "undefined" || key.toLowerCase() === "null") {
    return {
      zh: "",
      en: "",
      size: ""
    };
  }

  if (!ocrText) {
    return {
      zh: "",
      en: "",
      size: ""
    };
  }

  const prompt = `
You extract PRODUCT TITLES from supermarket OCR text.

Return STRICT JSON only. No markdown. No explanation.

JSON SCHEMA (ALL KEYS REQUIRED):
{
  "zh": "Chinese product title",
  "en": "English product title",
  "size": "size if explicitly present, else empty string"
}

RULES:
- zh: concise Chinese product name (brand + product only)
- en: concise English product name (natural English)
- size: only if clearly stated (e.g. 250g, 500ml, 1kg)
- Do NOT include slogans
- Do NOT hallucinate
- If a field is not present, return empty string

OCR TEXT:
"""
${ocrText}
"""
`.trim();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let res;
  try {
    res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You output JSON only." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 128
      }),
      signal: controller.signal
    });
  } catch {
    clearTimeout(timeout);
    return {
      zh: "",
      en: "",
      size: ""
    };
  }

  clearTimeout(timeout);

  if (!res || !res.ok) {
    return {
      zh: "",
      en: "",
      size: ""
    };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return {
      zh: "",
      en: "",
      size: ""
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  } catch {
    return {
      zh: "",
      en: "",
      size: ""
    };
  }

  return {
    zh: typeof parsed.zh === "string" ? parsed.zh.trim() : "",
    en: typeof parsed.en === "string" ? parsed.en.trim() : "",
    size: typeof parsed.size === "string" ? parsed.size.trim() : ""
  };
}
