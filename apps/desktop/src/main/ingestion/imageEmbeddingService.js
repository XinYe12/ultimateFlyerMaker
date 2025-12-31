import OpenAI from "openai";
import fs from "fs";

const MAX_RETRIES = 3;

export async function getImageEmbedding(imagePath) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30_000
  });

  const base64 = fs.readFileSync(imagePath, { encoding: "base64" });

  let parsed = {
    englishTitle: "",
    chineseTitle: "",
    brand: "",
    size: "",
    category: "",
    ocrText: "",
    cleanTitle: ""
  };

  // ---------- VISION (BEST EFFORT) ----------
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const vision = await client.responses.create({
        model: "gpt-4o-mini",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_image",
                image_url: `data:image/jpeg;base64,${base64}`
              },
              {
                type: "input_text",
                text: `
Return ONLY valid JSON with keys:
englishTitle, chineseTitle, brand, size, category, ocrText, cleanTitle
Empty strings allowed.`
              }
            ]
          }
        ]
      });

      parsed = JSON.parse(vision.output_text);
      break;
    } catch (err) {
      if (i === MAX_RETRIES - 1) {
        console.warn("VISION FAILED — CONTINUING WITHOUT IT");
      }
    }
  }

  const embeddingText = [
    parsed.englishTitle,
    parsed.chineseTitle,
    parsed.brand,
    parsed.size,
    parsed.category,
    parsed.cleanTitle,
    parsed.ocrText
  ].filter(Boolean).join(" | ");

  // ---------- EMBEDDING (BEST EFFORT) ----------
  try {
    const emb = await client.embeddings.create({
      model: "text-embedding-3-large",
      input: embeddingText || "generic product"
    });

    return {
      embedding: emb.data[0].embedding,
      parsed
    };
  } catch (err) {
    console.warn("EMBEDDING FAILED — RETURNING EMPTY VECTOR");
    return {
      embedding: [],
      parsed
    };
  }
}
