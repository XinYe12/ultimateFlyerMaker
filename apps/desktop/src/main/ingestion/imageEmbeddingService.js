/**
 * Metadata extraction + embedding for DB ingestion.
 *
 * Vision:   Gemini 1.5 Flash (Google API) — sees the actual image, extracts metadata.
 * OCR:      PaddleOCR text is passed to Gemini as extra context when available.
 * Fallback: DeepSeek text-only if Gemini fails but OCR found text.
 * Embed:    nomic-embed-text (Ollama, ~274MB) produces the search vector.
 */

import fs from "fs";
import path from "path";
import { runOCR } from "./ocrService.js";
import { assertCanCallGemini, trackGeminiRequest } from "../ipc/quotaTracker.js";

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
const EMBED_TIMEOUT_MS = 60_000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

/* ---------- Gemini vision ---------- */

function readImageForGemini(imagePath) {
  const ext = path.extname(imagePath).toLowerCase().replace(".", "");
  const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const data = fs.readFileSync(imagePath, { encoding: "base64" });
  return { data, mimeType };
}

async function runGeminiVision(imagePath, ocrText) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const { data, mimeType } = readImageForGemini(imagePath);

  const ocrContext = ocrText
    ? `\n\nOCR text extracted from this image (use to confirm names, brand, size):\n"""\n${ocrText}\n"""`
    : "\n\nNo OCR text was extracted — rely entirely on visual analysis of the image.";

  const prompt = `You are a grocery product recognition expert. Analyze this image and extract metadata.

STEP 1 — Is this a product image?
Set "isProduct": false if the image is clearly NOT a retail/grocery product, for example:
- Plain text, banners, title cards, date labels (e.g. "Aug 1", "Sale", "Weekly Special")
- Logos, flyer templates, decorative graphics, price tags without a product
- People, landscapes, receipts, or documents
Set "isProduct": true if the image shows an actual product (food, drink, packaged goods, produce, etc.).

STEP 2 — If isProduct is true, fill the remaining fields with your best visual guess.
CRITICAL RULES for product images:
- "englishTitle" and "cleanTitle" MUST NOT be empty — describe what you see (e.g. "Fresh Red Apple", "Whole Chicken", "Orange Juice Carton").
- "category" must always be one of the listed values.
- If OCR text is missing or unclear, rely entirely on visual appearance.

Return ONLY a JSON object — no markdown, no explanation.

{
  "isProduct": true or false,
  "englishTitle": "main product name in English (empty string if isProduct is false)",
  "chineseTitle": "Chinese product name if visible on packaging, else empty string",
  "brand": "brand name if identifiable, else empty string",
  "size": "weight or volume (e.g. 500ml, 1kg, per lb), else empty string",
  "category": "one of: seafood, dairy, meat, produce, snack, beverage, bakery, frozen, condiment, other",
  "cleanTitle": "2-5 word search title (empty string if isProduct is false)"
}${ocrContext}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40_000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inlineData: { mimeType, data } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0,
            maxOutputTokens: 1024,
          },
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status}: ${body}`);
    }

    const json = await res.json();
    const candidate = json?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    if (finishReason && finishReason !== "STOP") {
      throw new Error(`Gemini stopped early: finishReason=${finishReason}`);
    }
    const text = candidate?.content?.parts?.[0]?.text ?? "";
    if (!text) throw new Error("Gemini returned empty content");

    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Dedicated classification-only Gemini call.
 * Uses a focused binary prompt — no metadata fields — to avoid biasing Gemini
 * toward "isProduct: true" just to fill a schema.
 */
async function runGeminiClassify(imagePath) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const { data, mimeType } = readImageForGemini(imagePath);

  const prompt = `You are reviewing images in a grocery store product database.
Decide whether this image shows a physical retail product (food, drink, packaged goods, produce, seafood, meat, dairy, etc.).

Return {"isProduct": false} if the image is:
- A plain text label, banner, title card, date card, or sale announcement
- A store logo, flyer template, decorative graphic, or price tag with no product visible
- A person, landscape, receipt, document, or anything that is not a physical sellable item
- Blurry, blank, or completely unrecognizable

Return {"isProduct": true} only if a physical grocery/retail product is clearly visible.

Reply with ONLY valid JSON — no markdown, no explanation:
{"isProduct": true} or {"isProduct": false}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40_000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ inlineData: { mimeType, data } }, { text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0,
            maxOutputTokens: 16,
          },
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status}: ${body}`);
    }

    const json = await res.json();
    const candidate = json?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    if (finishReason && finishReason !== "STOP") {
      throw new Error(`Gemini stopped early: finishReason=${finishReason}`);
    }
    const text = candidate?.content?.parts?.[0]?.text ?? "";
    if (!text) throw new Error("Gemini returned empty content");

    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const obj = JSON.parse(cleaned);
    // Require explicit true — anything ambiguous is treated as a product (safe default)
    return obj?.isProduct === true;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Classify an image (from URL or local path) as product or not.
 * Used for scanning the DB to remove non-product images.
 * @param {string} imagePathOrUrl - Local file path or public URL (https://)
 * @returns {Promise<{ isProduct: boolean }>}
 */
export async function classifyImageAsProduct(imagePathOrUrl) {
  const isUrl = typeof imagePathOrUrl === "string" && imagePathOrUrl.startsWith("http");
  let localPath = imagePathOrUrl;

  if (isUrl) {
    const res = await fetch(imagePathOrUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    const buf = await res.arrayBuffer();
    const ext = path.extname(new URL(imagePathOrUrl).pathname) || ".jpg";
    const safeExt = /^\.(jpg|jpeg|png|gif|webp)$/i.test(ext) ? ext : ".jpg";
    const os = await import("os");
    localPath = path.join(os.tmpdir(), `ufm-classify-${Date.now()}${safeExt}`);
    await fs.promises.writeFile(localPath, Buffer.from(buf));
  }

  try {
    assertCanCallGemini();
    const isProduct = await runGeminiClassify(localPath);
    trackGeminiRequest();
    return { isProduct };
  } finally {
    if (isUrl && localPath) {
      try {
        await fs.promises.unlink(localPath);
      } catch {}
    }
  }
}

/* ---------- DeepSeek text fallback (when Gemini fails but OCR has text) ---------- */

async function runDeepSeekForDb(ocrText) {
  const apiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY missing");

  const prompt = `You are given OCR text extracted from a grocery product image.
Parse it into structured product metadata.
Return ONLY valid JSON. No explanations.

Keys:
- englishTitle: main product name in English
- chineseTitle: Chinese product name if present, else ""
- brand: brand name if identifiable, else ""
- size: weight or volume (e.g. "500ml", "1kg"), else ""
- category: product category (e.g. "seafood", "dairy", "snack", "produce", "beverage"), else ""
- cleanTitle: short clean title optimized for search

OCR TEXT:
"""
${ocrText}
"""`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
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
        max_tokens: 512,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`DeepSeek HTTP ${res.status}: ${body.slice(0, 150)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return JSON.parse(content);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/* ---------- Ollama embed ---------- */

function ollamaEmbed(text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
  return fetch(`${OLLAMA_BASE}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, input: text }),
    signal: controller.signal,
  }).then((res) => {
    clearTimeout(timeout);
    return res;
  }).catch((err) => {
    clearTimeout(timeout);
    throw err;
  });
}

/* ---------- Main export ---------- */

/**
 * Extract product metadata via Gemini vision (+ OCR context), then embed.
 * Falls back to DeepSeek text-only if Gemini fails and OCR found text.
 * Returns { embedding, parsed }.
 */
export async function getImageEmbedding(imagePath) {
  let parsed = {
    isProduct: true,
    englishTitle: "",
    chineseTitle: "",
    brand: "",
    size: "",
    category: "",
    ocrText: "",
    cleanTitle: "",
  };

  // --- Step 1: OCR — fast, already running, gives Gemini extra context ---
  let ocrText = "";
  try {
    const ocrResult = await runOCR(imagePath);
    const texts = Array.isArray(ocrResult) ? (ocrResult[0]?.rec_texts ?? []) : [];
    ocrText = texts.join(" ").trim();
    parsed.ocrText = ocrText;
  } catch (err) {
    console.warn("[imageEmbedding] OCR failed:", err?.message?.slice(0, 80));
  }

  // --- Step 2: Gemini vision — sees the actual image ---
  let geminiOk = false;
  try {
    assertCanCallGemini();
    const obj = await runGeminiVision(imagePath, ocrText);
    trackGeminiRequest();
    if (obj && typeof obj === "object") {
      const isProduct = obj.isProduct !== false; // default true if field missing
      const candidate = {
        isProduct,
        englishTitle: String(obj.englishTitle ?? "").trim(),
        chineseTitle: String(obj.chineseTitle ?? "").trim(),
        brand: String(obj.brand ?? "").trim(),
        size: String(obj.size ?? "").trim(),
        category: String(obj.category ?? "").trim(),
        cleanTitle: String(obj.cleanTitle ?? "").trim(),
        ocrText,
      };
      if (!isProduct) {
        // Non-product image — accept the classification, no need for content check
        parsed = candidate;
        geminiOk = true;
        console.log("[imageEmbedding] Gemini classified as non-product:", JSON.stringify(parsed));
      } else {
        // Product image — only accept if Gemini gave something meaningful
        const hasContent = candidate.englishTitle || candidate.chineseTitle || candidate.cleanTitle;
        if (hasContent) {
          parsed = candidate;
          geminiOk = true;
          console.log("[imageEmbedding] Gemini result:", JSON.stringify(parsed));
        } else {
          console.warn("[imageEmbedding] Gemini returned all-empty fields — treating as failure");
        }
      }
    }
  } catch (err) {
    console.warn("[imageEmbedding] Gemini failed:", err?.message);
  }

  // --- Step 2b: DeepSeek text fallback (only if Gemini failed and OCR has text) ---
  if (!geminiOk && ocrText) {
    try {
      const obj = await runDeepSeekForDb(ocrText);
      if (obj && typeof obj === "object") {
        parsed = {
          englishTitle: String(obj.englishTitle ?? "").trim(),
          chineseTitle: String(obj.chineseTitle ?? "").trim(),
          brand: String(obj.brand ?? "").trim(),
          size: String(obj.size ?? "").trim(),
          category: String(obj.category ?? "").trim(),
          cleanTitle: String(obj.cleanTitle ?? "").trim(),
          ocrText,
        };
      }
    } catch (err) {
      console.warn("[imageEmbedding] DeepSeek fallback failed:", err?.message?.slice(0, 80));
    }
  }

  const embeddingText = [
    parsed.englishTitle,
    parsed.chineseTitle,
    parsed.brand,
    parsed.size,
    parsed.category,
    parsed.cleanTitle,
    parsed.ocrText,
  ].filter(Boolean).join(" | ") || "product";

  // --- Step 3: Embed (nomic-embed-text, ~274MB) ---
  let embedding = [];
  try {
    const res = await ollamaEmbed(embeddingText);
    if (!res.ok) throw new Error(`Ollama embed ${res.status}`);
    const data = await res.json();
    embedding = Array.isArray(data.embeddings?.[0]) ? data.embeddings[0] : data.embedding || [];
  } catch (err) {
    console.warn("[imageEmbedding] Embed failed:", err?.message?.slice(0, 80));
  }

  return { embedding, parsed };
}

/**
 * Embed arbitrary text for semantic search (e.g. discount item query).
 * Uses same model as product embeddings for compatibility.
 * @param {string} text - Query text (e.g. "Atlantic Salmon 500g | 大西洋三文鱼")
 * @returns {Promise<number[]>} 768-dim vector, or [] on failure
 */
export async function embedText(text) {
  const s = String(text || "").trim() || "product";
  try {
    const res = await ollamaEmbed(s);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.embeddings?.[0]) ? data.embeddings[0] : data.embedding || [];
  } catch {
    return [];
  }
}

/* ---------- Ollama status check (for UI indicator) ---------- */

/**
 * Check if Ollama is running and the embed model is available.
 * @returns {Promise<{ ok: boolean; model?: string; error?: string }>}
 */
export async function checkOllamaStatus() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return { ok: false, error: `Ollama returned ${res.status}` };

    const json = await res.json();
    const modelNames = (json.models || []).map((m) => m.name || "").filter(Boolean);
    const hasEmbed = modelNames.some(
      (n) => n === OLLAMA_EMBED_MODEL || n.startsWith(OLLAMA_EMBED_MODEL + ":")
    );

    if (hasEmbed) {
      const found = modelNames.find(
        (n) => n === OLLAMA_EMBED_MODEL || n.startsWith(OLLAMA_EMBED_MODEL + ":")
      );
      return { ok: true, model: found || OLLAMA_EMBED_MODEL };
    }
    return {
      ok: false,
      error: `Model ${OLLAMA_EMBED_MODEL} not found. Run: ollama pull ${OLLAMA_EMBED_MODEL}`,
    };
  } catch (err) {
    clearTimeout(timeout);
    const msg = err.message || String(err);
    if (msg.includes("abort") || msg.includes("ECONNREFUSED")) {
      return { ok: false, error: `Ollama not running. Run: ollama pull ${OLLAMA_EMBED_MODEL}` };
    }
    return { ok: false, error: msg };
  }
}
