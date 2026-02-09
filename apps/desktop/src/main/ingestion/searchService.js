import "./firebase.js"; // force init
import { getFirestore } from "firebase-admin/firestore";
import { FIRESTORE_COLLECTION } from "../config/vectorConfig.js";
import { getImageEmbedding } from "./imageEmbeddingService.js";
import { cosineSimilarity } from "./vectorUtils.js";

const db = getFirestore();

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
 * Search product_vectors by title/text. Returns up to `limit` products with publicUrl for UI.
 * @param {string} query - Product title or search text
 * @param {number} limit - Max results (default 6 for Replace UI)
 * @param {number} minScore - Minimum text match score (0–1)
 * @returns {Promise<Array<{ id, englishTitle, chineseTitle, brand, size, category, publicUrl, score }>>}
 */
export async function searchByText(query, limit = 6, minScore = 0.15) {
  if (!query || !String(query).trim()) return [];

  const queryTokens = tokenize(String(query).trim());
  if (!queryTokens.length) return [];

  const snapshot = await db.collection(FIRESTORE_COLLECTION).get();
  const products = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  return products
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

  const snapshot = await db.collection(FIRESTORE_COLLECTION).get();
  const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

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
