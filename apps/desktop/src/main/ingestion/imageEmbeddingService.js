import OpenAI from "openai";
import fs from "fs";

export async function getImageEmbedding(imagePath) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // 1️⃣ Read image into base64
  const base64 = fs.readFileSync(imagePath, { encoding: "base64" });

  // 2️⃣ Full structured extraction (MATCHES INGESTION PIPELINE)
  const visionResponse = await client.responses.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
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
If unsure, return empty strings.`
          }
        ]
      }
    ]
  });

  const parsed = JSON.parse(visionResponse.output_text);

  // 3️⃣ Build embedding text exactly like ingestion Java pipeline
 const embeddingText = [
  parsed.englishTitle,
  parsed.chineseTitle,
  parsed.brand,
  parsed.size,
  parsed.category,
  parsed.cleanTitle,
  parsed.ocrText
].filter(Boolean).join(" | ");


  //console.log("🧠 Embedding text:", embeddingText);

  // 4️⃣ Generate embedding using SAME MODEL as Java ingestion
  const emb = await client.embeddings.create({
    model: "text-embedding-3-large",
    input: embeddingText || "generic product"
  });
  console.log("🔍 EMBEDDING TEXT (SEARCH):", embeddingText);
  console.log("🔢 Length:", embeddingText.length);


  return {
    embedding: emb.data[0].embedding,
    parsed
  };
}
