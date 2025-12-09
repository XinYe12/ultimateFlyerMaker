// server/services/queryEmbeddingService.js
import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function toDataUrl(buffer, mimeType = "image/png") {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export async function getQueryEmbeddingFromImage(buffer, mimeType = "image/png") {
  const dataUrl = toDataUrl(buffer, mimeType);

  // STEP 1 — Vision parse with SAFE JSON request
  const visionRes = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: [
          { type: "input_image", image_url: dataUrl },
          {
            type: "input_text",
            text: `
Return ONLY valid JSON.
Do NOT include backticks.
Do NOT include code blocks.
Do NOT add explanations.

Required Format:
{
 "englishTitle": "",
 "chineseTitle": "",
 "brand": "",
 "size": "",
 "category": "",
 "ocrText": "",
 "cleanTitle": ""
}
`
          }
        ]
      }
    ]
  });

  let jsonText = visionRes.output_text.trim();

  // STEP 2 — Strip accidental ```json or ``` if present
  jsonText = jsonText.replace(/```json/gi, "")
                     .replace(/```/g, "")
                     .trim();

  const parsed = JSON.parse(jsonText);

  // STEP 3 — Build embedding text (must match ingestion exactly)
  const embeddingText = [
    parsed.englishTitle,
    parsed.chineseTitle,
    parsed.brand,
    parsed.size,
    parsed.category,
    parsed.cleanTitle,
    parsed.ocrText
  ].filter(Boolean).join(" | ");

  // STEP 4 — Generate embedding
  const emb = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: embeddingText
  });

  return emb.data[0].embedding;
}
