/**
 * Metadata extraction + embedding for DB ingestion.
 *
 * Vision:   Gemini Flash (Google API) — sees the actual image, extracts metadata.
 * OCR:      PaddleOCR text is passed to Gemini as extra context when available.
 * Fallback: DeepSeek text-only if Gemini fails but OCR found text.
 * Embed:    Gemini text-embedding-004 (free, cloud, 768-dim) — no local model needed.
 */

import fs from "fs";
import path from "path";
import { net } from "electron";
import sharp from "sharp";
import { runOCR } from "./ocrService.js";
import { assertCanCallGemini, trackGeminiRequest } from "../ipc/quotaTracker.js";
import { resolveGeminiVisionModel } from '../config/geminiModels.js';

/* ---------- Gemini vision ---------- */

async function readImageForGemini(imagePath, maxDim = 1536) {
  const stat = fs.statSync(imagePath);
  if (stat.size < 100) throw new Error(`Image file too small to be valid (${stat.size} bytes): ${imagePath}`);
  try {
    const buf = await sharp(imagePath)
      .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { data: buf.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    const ext = path.extname(imagePath).toLowerCase().replace(".", "");
    const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const data = fs.readFileSync(imagePath, { encoding: "base64" });
    return { data, mimeType };
  }
}

async function runGeminiVision(imagePath, ocrText) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const GEMINI_MODEL = await resolveGeminiVisionModel(apiKey);
  const { data, mimeType } = await readImageForGemini(imagePath);

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
    const res = await net.fetch(
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
    console.log("[imageEmbedding] Gemini raw response:", cleaned.slice(0, 300));
    return JSON.parse(cleaned);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Local heuristic for scan-only cleanup. Catches obvious flyer title graphics when
 * Gemini misclassifies stylized name/price art as a product photo.
 */
export function looksLikeFlyerTitleGraphic(ocrText) {
  const text = String(ocrText || "").trim();
  if (!text) return false;

  const packagingSignals =
    /\b(net\s*wt|ingredients|nutrition|allergen|upc|sku|distributed|manufactured|best\s+before|sell\s+by|packed|refrigerat)\b/i;
  if (packagingSignals.test(text)) return false;
  if (/\b\d+\s*(oz|fl\s*oz|ml|l|g|kg|lb|lbs)\b/i.test(text)) return false;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 20) return false;

  const hasPrice = /(?:\$\s*)?\d+\.\d{2}\b/.test(text) || /\$\s*\d+/.test(text);
  const hasCategoryBanner =
    /\b(hot\s*food|weekly\s+special|produce|seafood|meat|dairy|bakery|frozen|deli)\b/i.test(text);
  const hasSpacedBanner = /\b(?:[A-Z]\s+){3,}[A-Z]\b/.test(text);

  if (hasSpacedBanner || (hasCategoryBanner && words.length <= 12)) return true;
  if (hasPrice && words.length <= 10 && text.length <= 100) return true;

  return false;
}

async function readOcrText(imagePath) {
  try {
    const ocrResult = await runOCR(imagePath);
    const texts = Array.isArray(ocrResult) ? (ocrResult[0]?.rec_texts ?? []) : [];
    return texts.join(" ").trim();
  } catch (err) {
    console.warn("[imageEmbedding] OCR failed during classify:", err?.message?.slice(0, 80));
    return "";
  }
}

/**
 * Dedicated classification-only Gemini call.
 * Uses a focused binary prompt — no metadata fields — to avoid biasing Gemini
 * toward "isProduct: true" just to fill a schema.
 */
async function runGeminiClassify(imagePath, ocrText = "") {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const GEMINI_MODEL = await resolveGeminiVisionModel(apiKey);
  const { data, mimeType } = await readImageForGemini(imagePath);

  const ocrContext = ocrText
    ? `\n\nOCR text extracted from this image (may include stylized flyer typography):\n"""\n${ocrText}\n"""`
    : "\n\nNo OCR text was extracted — rely entirely on visual analysis.";

  const prompt = `You are reviewing images in a grocery store product database cleanup scan.
Decide whether this image shows a physical retail product (food, drink, packaged goods, produce, seafood, meat, dairy, etc.).

Return {"isProduct": false} if the image is ANY of:
- Plain text, banners, title cards, date labels, or sale announcements
- Stylized/decorative product NAME text (cursive, outlined, shadowed flyer typography) on a plain or gradient background with NO visible physical product
- Example: a graphic reading "Green Ton Choy" or a large standalone "1.88" price with decorative fonts but no food or packaging photographed
- Store logos, flyer templates, section headers (e.g. "HOT FOOD", "WEEKLY SPECIAL"), or decorative graphics
- Standalone price numbers or price tags with no product visible
- People, landscapes, receipts, documents, or blank/unrecognizable images

Return {"isProduct": true} ONLY if a physical grocery/retail product is clearly visible — not just its name written as graphic text.

Reply with ONLY valid JSON — no markdown, no explanation:
{"isProduct": true} or {"isProduct": false}${ocrContext}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40_000);

  try {
    const res = await net.fetch(
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
    // Require explicit true — ambiguous/missing values are treated as non-product for scan cleanup
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
    const ocrText = await readOcrText(localPath);
    assertCanCallGemini();
    let isProduct = await runGeminiClassify(localPath, ocrText);
    trackGeminiRequest();
    if (isProduct && looksLikeFlyerTitleGraphic(ocrText)) {
      console.log("[imageEmbedding] Classify override: flyer title graphic detected via OCR heuristic");
      isProduct = false;
    }
    return { isProduct, ocrText };
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

/* ---------- Gemini embed ---------- */

const EMBED_MODEL = "gemini-embedding-2";
const EMBED_TIMEOUT_MS = 30_000;

async function geminiEmbed(text) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

  try {
    const res = await net.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: 768,
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini embed HTTP ${res.status}: ${body.slice(0, 120)}`);
    }
    const data = await res.json();
    return Array.isArray(data?.embedding?.values) ? data.embedding.values : [];
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Embed arbitrary text using Gemini text-embedding-004.
 * @param {string} text
 * @returns {Promise<number[]>} 768-dim vector, or [] on failure
 */
export async function embedText(text) {
  const s = String(text || "").trim() || "product";
  try {
    return await geminiEmbed(s);
  } catch (err) {
    console.warn("[imageEmbedding] embedText failed:", err?.message?.slice(0, 80));
    return [];
  }
}

/* ---------- Main export ---------- */

/**
 * Extract product metadata via Gemini vision (+ OCR context), then embed.
 * Falls back to DeepSeek text-only if Gemini fails and OCR found text.
 * Returns { embedding, parsed }. Embedding is [] if Gemini embed fails (soft-optional).
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

  // --- Step 3: Embed (Gemini text-embedding-004, free, cloud-based) ---
  let embedding = [];
  try {
    embedding = await geminiEmbed(embeddingText);
  } catch (err) {
    console.warn("[imageEmbedding] Embed failed:", err?.message?.slice(0, 80));
  }

  return { embedding, parsed };
}

/**
 * Minimal connectivity test for both Gemini endpoints.
 * Logs full details to the backend terminal and returns a structured result.
 * Does NOT count against quota tracking.
 */
export async function testGeminiConnection() {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  const result = { apiKeyPresent: !!apiKey, vision: null, embed: null };

  console.log("\n=== [testGemini] Starting connection test ===");
  console.log(`  API key: ${apiKey ? apiKey.slice(0, 8) + "…" + apiKey.slice(-4) : "(missing)"}`);

  if (!apiKey) {
    console.log("  RESULT: FAIL — GEMINI_API_KEY not set in .env");
    return { ...result, error: "GEMINI_API_KEY not set in .env" };
  }

  const model = await resolveGeminiVisionModel(apiKey);
  console.log(`  Vision model: ${model}`);

  // --- Vision (text-only ping — no image needed) ---
  try {
    const res = await net.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word: ok" }] }] }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    const body = await res.text();
    if (res.ok) {
      console.log(`  [vision] OK (HTTP ${res.status})`);
      result.vision = { ok: true, status: res.status };
    } else {
      console.log(`  [vision] FAIL HTTP ${res.status}:\n  ${body}`);
      result.vision = { ok: false, status: res.status, body };
    }
  } catch (err) {
    console.log(`  [vision] FAIL (network error): ${err.message}`);
    result.vision = { ok: false, error: err.message };
  }

  // --- Embed ---
  try {
    const res = await net.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-2",
          content: { parts: [{ text: "test" }] },
          outputDimensionality: 8,
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    const body = await res.text();
    if (res.ok) {
      console.log(`  [embed]  OK (HTTP ${res.status})`);
      result.embed = { ok: true, status: res.status };
    } else {
      console.log(`  [embed]  FAIL HTTP ${res.status}:\n  ${body}`);
      result.embed = { ok: false, status: res.status, body };
    }
  } catch (err) {
    console.log(`  [embed]  FAIL (network error): ${err.message}`);
    result.embed = { ok: false, error: err.message };
  }

  const allOk = result.vision?.ok && result.embed?.ok;
  console.log(`=== [testGemini] Result: ${allOk ? "ALL OK" : "FAILED"} ===\n`);
  return result;
}
