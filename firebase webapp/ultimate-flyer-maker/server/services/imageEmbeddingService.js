// apps/desktop/apps/desktop/src/main/ingestion/imageEmbeddingService.js
// ⚠️ LEGACY-COMPAT ELECTRON MAIN VERSION — COPY / PASTE AS-IS
// (keeps OpenAI logic, adapts return shape for searchProductsByImage)

import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================
   IMAGE → EMBEDDING
========================= */

export async function getImageEmbedding(imagePath) {
  if (!imagePath) return [];

  // 1️⃣ Read image
  const base64 = fs.readFileSync(imagePath, { encoding: "base64" });

  // 2️⃣ Vision parse (legacy behavior preserved)
  const visionResponse = await client.responses.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_image",
            image_url: `data:image/jpeg;base64,${base64}`,
          },
          {
            type: "input_text",
            text: `
Extract product metadata. Output JSON with EXACT keys:
{
  "englishTitle": "",
  "chineseTitle": "",
  "brand": "",
  "size": "",
  "category": "",
  "ocrText": "",
  "cleanTitle": ""
}
If unsure, return empty strings.`,
          },
        ],
      },
    ],
  });

  let parsed = {};
  try {
    parsed = JSON.parse(visionResponse.output_text || "{}");
  } catch {
    parsed = {};
  }

  // 3️⃣ Build embedding text (unchanged logic)
  const embeddingText = [
    parsed.englishTitle,
    parsed.chineseTitle,
    parsed.brand,
    parsed.size,
    parsed.category,
    parsed.cleanTitle,
    parsed.ocrText,
  ]
    .filter(Boolean)
    .join(" | ");

  // 4️⃣ Generate embedding
  const emb = await client.embeddings.create({
    model: "text-embedding-3-large",
    input: embeddingText || "generic product",
  });

  // ✅ IMPORTANT: return ONLY embedding array
  return emb.data[0].embedding || [];
}
