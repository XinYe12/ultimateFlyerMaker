export async function runDeepSeek({ raw_ocr_text }) {
  const rawText = Array.isArray(raw_ocr_text)
    ? raw_ocr_text.join("\n")
    : String(raw_ocr_text || "");

  console.log("🔥 DEEPSEEK INPUT TEXT:\n", rawText);

  const apiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY missing");
  }

  const prompt = `
You are given OCR text extracted from a grocery product image.

TASKS:
1. Parse ALL meaningful product-like strings you see.
2. Identify the ONE most likely real product title a human would use on a flyer.

IMPORTANT:
- Ignore SKU codes, batch numbers, random letters, OCR noise.
- Prefer brand + product names.
- Prefer natural language names.
- The "best_title" MUST be one of the parsed items (or a cleaned version of one).

SIZE vs QUANTITY:
- Put product weight/size in "size": e.g. "924g", "650g", "360g", "1kg", "500ml". Numbers that are clearly weights go in size, not quantity.
- Use "quantity" ONLY for multi-buy counts: e.g. "2 for $5" → quantity 2, "3 for $10" → quantity 3. Never put gram weights (like 924, 650) in quantity.

Return a JSON OBJECT with EXACT shape:

{
  "best_title": {
    "english_name": "string",
    "chinese_name": "string or null",
    "confidence": number
  },
  "items": [
    {
      "english_name": "string",
      "chinese_name": "string or null",
      "size": "string or null",
      "sale_price": "string",
      "regular_price": "string or null",
      "unit": "string or null",
      "quantity": "number or null",
      "confidence": number
    }
  ]
}

INPUT OCR TEXT:
"""
${rawText}
"""
`;

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "Return JSON only. No explanations." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;

  console.log("🧠 DEEPSEEK RAW OUTPUT:", content);

  const parsed = JSON.parse(content);

  if (!parsed || !parsed.best_title || !Array.isArray(parsed.items)) {
    throw new Error("DeepSeek output missing best_title or items[]");
  }

  return parsed;
}
