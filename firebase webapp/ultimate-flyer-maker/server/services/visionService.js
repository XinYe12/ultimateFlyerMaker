import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function extractTextFromImage(imagePath) {
  const image = fs.readFileSync(imagePath, { encoding: "base64" });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Extract all product-related text from this image." },
          { type: "image_url", image_url: `data:image/jpeg;base64,${image}` }
        ]
      }
    ]
  });

  const text = response.choices[0].message.content.trim();
  return text;
}
