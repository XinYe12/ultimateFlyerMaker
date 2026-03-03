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
    .replace(/(\d+)(kg|g|克|ml|l)/g, "$1")
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
  // 1. Full-haystack coverage (includes brand, category, size)
  const haySet = new Set(hayTokens);
  let hit = 0;
  for (const t of queryTokens) if (haySet.has(t)) hit++;
  const haystackScore = queryTokens.length ? hit / queryTokens.length : 0;

  // 2. Title-only coverage — product name must match (high signal)
  const titleTokens = tokenize(
    normalize([p.englishTitle, p.chineseTitle].filter(Boolean).join(" "))
  );
  const titleSet = new Set(titleTokens);
  let titleHit = 0;
  for (const t of queryTokens) if (titleSet.has(t)) titleHit++;
  const titleScore = queryTokens.length ? titleHit / queryTokens.length : 0;

  // 3. Bidirectional: how much of the product title is covered by the query
  //    Low coverage = different product type → should score lower
  const querySet = new Set(queryTokens);
  let productHit = 0;
  for (const t of titleTokens) if (querySet.has(t)) productHit++;
  const productCoverage = titleTokens.length ? productHit / titleTokens.length : 0;

  // Weighted blend: title match is primary signal
  let score = 0.55 * titleScore + 0.25 * haystackScore + 0.20 * productCoverage;

  if (p.brand && queryTokens.includes(normalize(p.brand))) score += 0.07;
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
let _embeddingCache = null;     // null = stale, array = loaded
let _embeddingCacheLoad = null; // in-flight Promise — prevents N concurrent Firestore queries

export function invalidateEmbeddingCache() {
  _embeddingCache = null;
  _embeddingCacheLoad = null;
}

async function getEmbeddingCache() {
  if (_embeddingCache) return _embeddingCache;
  // If a load is already in flight, reuse it instead of firing another Firestore query
  if (!_embeddingCacheLoad) {
    _embeddingCacheLoad = db
      .collection(FIRESTORE_COLLECTION)
      .where("status", "==", "active")
      .select("id", "englishTitle", "chineseTitle", "brand", "size", "category", "publicUrl", "embedding")
      .get()
      .then((snapshot) => {
        _embeddingCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        _embeddingCacheLoad = null;
        return _embeddingCache;
      })
      .catch((err) => {
        _embeddingCacheLoad = null; // allow retry on next call
        throw err;
      });
  }
  return _embeddingCacheLoad;
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
      score: Array.isArray(p.embedding) && p.embedding.length === queryEmbedding.length
        ? cosineSimilarity(queryEmbedding, p.embedding)
        : 0,
    }))
    .filter((p) => p.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(pickPublicFields);
}

/* ---------- Multi-query helpers ---------- */

function mergeByBestScore(results, limit) {
  const map = new Map();
  for (const r of results) {
    if (!map.has(r.id) || r.score > map.get(r.id).score) map.set(r.id, r);
  }
  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function hybridMerge(embedResults, textResults, limit) {
  const map = new Map();
  for (const r of embedResults) map.set(r.id, { ...r, _embedScore: r.score, _textScore: 0 });
  for (const r of textResults) {
    if (map.has(r.id)) {
      map.get(r.id)._textScore = r.score;
    } else {
      map.set(r.id, { ...r, _embedScore: 0, _textScore: r.score });
    }
  }
  for (const [, v] of map) {
    v.score = Number((0.55 * v._embedScore + 0.45 * v._textScore).toFixed(4));
  }
  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Best-effort search for discount item → DB products.
 * Runs multi-query text search (en / zh / combined) and semantic embedding in parallel,
 * then merges results with hybrid scoring.
 * @param {{ en?: string; zh?: string; size?: string }} item - Discount item fields
 * @param {number} limit - Max results (1 for single, N for series)
 * @returns {Promise<Array>} Products with publicUrl, scores
 */
export async function searchForDiscountItem(item, limit = 6) {
  const enQuery   = (item?.en   || "").trim();
  const zhQuery   = (item?.zh   || "").trim();
  const fullQuery = [item?.en, item?.zh, item?.size].filter(Boolean).map(String).map((s) => s.trim()).join(" ").trim();

  if (!fullQuery && !enQuery && !zhQuery) return [];

  // Run text search for all distinct query variants (parallel)
  const queries = [...new Set([fullQuery, enQuery, zhQuery].filter(Boolean))];
  const textResultSets = await Promise.all(
    queries.map((q) => searchByText(q, limit * 2, 0.15).catch(() => []))
  );
  const textMerged = mergeByBestScore(textResultSets.flat(), limit * 2);

  // Run embedding on the most informative query
  let embedResults = [];
  try {
    embedResults = await searchByTextEmbedding(fullQuery || enQuery, limit * 2, 0.25);
  } catch { /* ignore — text search covers it */ }

  // Hybrid merge: weight embedding 0.55, text 0.45
  return hybridMerge(embedResults, textMerged, limit);
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
