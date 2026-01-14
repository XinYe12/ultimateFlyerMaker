import fs from "fs/promises";
import pkg from "undici";

const { Agent, fetch, FormData } = pkg;

// IMPORTANT:
// - headersTimeout MUST be 0 (disabled)
// - OCR does not send headers until finished
const agent = new Agent({
  headersTimeout: 0,        // 🔥 DISABLE
  bodyTimeout: 300_000,     // 5 minutes safety
});

export async function runOCR(imagePath) {
  const buffer = await fs.readFile(imagePath);

  const blob = new globalThis.Blob([buffer], {
    type: "image/png",
  });

  const form = new FormData();
  form.append("file", blob, "image.png");

  // HARD wall-clock cap (not headers)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min

  try {
    const res = await fetch("http://127.0.0.1:17890/ocr", {
      method: "POST",
      body: form,
      dispatcher: agent,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn("OCR HTTP error:", res.status, text);
      return { rec_texts: [] };
    }

    const data = await res.json();
    console.log("[OCR] response keys:", Object.keys(data));
    console.log("[OCR] rec_texts len:", Array.isArray(data.rec_texts) ? data.rec_texts.length : "NOT_ARRAY");
    console.log("[OCR] first 5:", Array.isArray(data.rec_texts) ? data.rec_texts.slice(0, 5) : data.rec_texts);
    const rec_texts = Array.isArray(data.rec_texts) ? data.rec_texts : [];

    return {  
      rec_texts,
      text: rec_texts.join(" ").trim()
    };
  

  } catch (err) {
    console.warn("OCR failed or aborted — continuing:", err);
    return { rec_texts: [] };
  } finally {
    clearTimeout(timeout);
  }
}
