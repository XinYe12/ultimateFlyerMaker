// server/flyer-automation/image/removeBackground.js
import "dotenv/config";
import fetch from "node-fetch";
import fs from "fs";

const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY;

export async function removeBackground(inputPath, outputPath) {
  if (!REMOVE_BG_API_KEY) {
    throw new Error("REMOVE_BG_API_KEY missing");
  }

  const imageBuffer = fs.readFileSync(inputPath);

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: {
      "X-Api-Key": REMOVE_BG_API_KEY,
    },
    body: (() => {
      const form = new FormData();
      form.append("image_file", imageBuffer, "image.png");
      form.append("size", "auto");
      return form;
    })(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error("remove.bg failed: " + text);
  }

  const resultBuffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, resultBuffer);

  return outputPath;
}
