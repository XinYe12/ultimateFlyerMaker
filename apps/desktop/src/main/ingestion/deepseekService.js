export async function runDeepSeek({ raw_ocr_text }) {
  const rawText = Array.isArray(raw_ocr_text)
    ? raw_ocr_text.join("\n")
    : String(raw_ocr_text || "");

  console.log("🔥 DEEPSEEK INPUT TEXT:\n", rawText);

  const apiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY missing");
  }

  const prompt =
`You are given discount text from a grocery store.

Each LINE represents ONE product.

Return a JSON OBJECT with this exact shape:

{
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

MANDATORY RULES:
- Parse ALL lines
- One product per line
- Do NOT merge items
- Do NOT drop items
- Size must be in English (e.g. "3-pack")
- Prices must preserve literal text meaning
- If a price implies multiple units, populate "unit" and "quantity"
- If the text contains patterns like "X for Y", "X/Y", or "Xpcs for Y",
  DO NOT normalize them into a single price.
- Preserve the original pricing text verbatim in "sale_price".


INPUT TEXT:
"""
${rawText}
"""
`;

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 2048
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;

  console.log("🧠 DEEPSEEK RAW OUTPUT:", content);

  const parsed = JSON.parse(content);

  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error("DeepSeek output missing items[]");
  }

  return parsed.items;
}
