import { db } from "./firebase.js";
import { FIRESTORE_COLLECTION } from "../config/vectorConfig.js";
import { getImageEmbedding, embedText } from "./imageEmbeddingService.js";
import { cosineSimilarity } from "./vectorUtils.js";

/* ---------- Shared response shape (no embeddings) ---------- */
function pickPublicFields(p) {
  return {
    id: p.id,
    englishTitle: p.englishTitle,
    chineseTitle: p.chineseTitle,
    brand: p.brand,
    size: p.size,
    category: p.category,
    publicUrl: p.publicUrl,
    score: Number((p.score != null ? p.score : 0).toFixed(4)),
  };
}

/* ---------- Text search (for product title → DB images) ---------- */
function normalize(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/\d+(kg|g|克|ml|l)/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCjkNgrams(text, minN = 2, maxN = 3) {
  const cjk = (text.match(/[\p{Script=Han}]+/gu) || []).join("");
  const grams = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i + n <= cjk.length; i++) {
      grams.push(cjk.slice(i, i + n));
    }
  }
  return grams;
}

function tokenize(text) {
  const norm = normalize(text);
  const spaceTokens = norm.split(" ").filter((t) => t.length >= 2);
  const cjkTokens = extractCjkNgrams(norm, 2, 3);
  return Array.from(new Set([...spaceTokens, ...cjkTokens]));
}

function buildHaystack(p) {
  return normalize(
    [p.englishTitle, p.chineseTitle, p.brand, p.cleanTitle, p.size, p.category]
      .filter(Boolean)
      .join(" ")
  );
}

function scoreTextMatch(queryTokens, hayTokens, p) {
  const haySet = new Set(hayTokens);
  let hit = 0;
  for (const t of queryTokens) {
    if (haySet.has(t)) hit++;
  }
  let score = queryTokens.length ? hit / queryTokens.length : 0;
  if (p.brand && queryTokens.includes(normalize(p.brand))) score += 0.08;
  if (p.size && queryTokens.includes(normalize(p.size))) score += 0.05;
  return Math.min(score, 1);
}

/**
 * Build search token array from parsed vision data.
 * Exported so batchIngestToDB can store tokens at ingest time.
 */
export function buildSearchTokens(parsed) {
  return tokenize(buildHaystack(parsed));
}

/* ---------- Embedding cache (for image search) ---------- */
let _embeddingCache = null; // null = stale, array = loaded

export function invalidateEmbeddingCache() {
  _embeddingCache = null;
}

async function getEmbeddingCache() {
  if (_embeddingCache) return _embeddingCache;
  const snapshot = await db
    .collection(FIRESTORE_COLLECTION)
    .where("status", "==", "active")
    .select("id", "englishTitle", "chineseTitle", "brand", "size", "category", "publicUrl", "embedding")
    .get();
  _embeddingCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  return _embeddingCache;
}

/**
 * Search product_vectors by title/text. Returns up to `limit` products with publicUrl for UI.
 * Uses array-contains-any index query — reads only matching docs, not all N.
 * @param {string} query - Product title or search text
 * @param {number} limit - Max results (default 6 for Replace UI)
 * @param {number} minScore - Minimum text match score (0–1)
 * @returns {Promise<Array<{ id, englishTitle, chineseTitle, brand, size, category, publicUrl, score }>>}
 */
export async function searchByText(query, limit = 6, minScore = 0.15) {
  if (!query || !String(query).trim()) return [];

  const queryTokens = tokenize(String(query).trim());
  if (!queryTokens.length) return [];

  const snapshot = await db
    .collection(FIRESTORE_COLLECTION)
    .where("searchTokens", "array-contains-any", queryTokens.slice(0, 10))
    .get();

  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.status === "active")
    .map((p) => {
      const hayTokens = tokenize(buildHaystack(p));
      const score = scoreTextMatch(queryTokens, hayTokens, p);
      return { ...p, score };
    })
    .filter((p) => p.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(pickPublicFields);
}

/**
 * Semantic search: embed query text and find nearest products by cosine similarity.
 * Better than text tokens for "Milk 2L" vs "Whole Milk 2 Liter", synonyms, etc.
 * Falls back to [] if Ollama embed fails.
 * @param {string} query - Product name, size, etc. (e.g. "Atlantic Salmon 500g")
 * @param {number} limit - Max results (default 6)
 * @param {number} minScore - Min cosine similarity 0–1 (default 0.3)
 */
export async function searchByTextEmbedding(query, limit = 6, minScore = 0.3) {
  if (!query || !String(query).trim()) return [];

  const queryEmbedding = await embedText(String(query).trim());
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return [];

  const all = await getEmbeddingCache();
  if (!all.length) return [];

  return all
    .map((p) => ({
      ...p,
      score: Array.isArray(p.embedding)
        ? cosineSimilarity(queryEmbedding, p.embedding)
        : 0,
    }))
    .filter((p) => p.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(pickPublicFields);
}

/**
 * Best-effort search for discount item → DB products.
 * Tries semantic (embedding) first; falls back to text tokens if Ollama fails.
 * Query includes en, zh, size for best match.
 * @param {{ en?: string; zh?: string; size?: string }} item - Discount item fields
 * @param {number} limit - Max results (1 for single, N for series)
 * @returns {Promise<Array>} Products with publicUrl, scores
 */
export async function searchForDiscountItem(item, limit = 6) {
  const parts = [item?.en, item?.zh, item?.size].filter(Boolean).map(String).map((s) => s.trim());
  const query = parts.join(" ").trim();
  if (!query) return [];

  const minScore = 0.25;

  try {
    const byEmbed = await searchByTextEmbedding(query, limit, minScore);
    if (byEmbed.length > 0) return byEmbed;
  } catch (err) {
    console.warn("[searchForDiscountItem] Embedding search failed, falling back to text:", err?.message?.slice(0, 60));
  }

  return searchByText(query, limit, 0.15);
}

/* ---------- Image search (embedding + cosine similarity) ---------- */
export async function searchByImage(imagePath, limit = 5) {
  let queryEmbedding;

  try {
    const res = await getImageEmbedding(imagePath);
    queryEmbedding = res?.embedding;
  } catch (err) {
    console.warn("⚠️ Embedding failed — skipping image search");
    return [];
  }

  if (!Array.isArray(queryEmbedding) || !queryEmbedding.length) {
    return [];
  }

  const all = await getEmbeddingCache();

  if (!all.length) return [];

  return all
    .map((p) => ({
      ...p,
      score: Array.isArray(p.embedding)
        ? cosineSimilarity(queryEmbedding, p.embedding)
        : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(pickPublicFields);
}
