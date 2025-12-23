// apps/desktop/apps/desktop/src/main/ingestion/productSearchService.js
// ✅ ELECTRON MAIN VERSION — COPY / PASTE AS-IS

import { db } from "./firebase.js";
import { cosineSimilarity } from "./vectorUtils.js";
import { getImageEmbedding } from "./imageEmbeddingService.js";

const VECTOR_COLLECTION = "product_vectors";

/* =========================
   TEXT UTILITIES
========================= */

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
    [
      p.englishTitle,
      p.chineseTitle,
      p.brand,
      p.cleanTitle,
      p.size,
      p.category,
    ]
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

/* =========================
   🔎 TEXT SEARCH
========================= */

export async function searchProductsByText(query, limit = 5, minScore = 0.15) {
  if (!query || !query.trim()) return [];

  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  const snap = await db.collection(VECTOR_COLLECTION).get();
  const products = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

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

/* =========================
   🔎 VECTOR SEARCH
========================= */

export async function searchProductsByVector(embedding, limit = 5) {
  if (!embedding || !embedding.length) return [];

  const snap = await db.collection(VECTOR_COLLECTION).get();
  const products = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  return products
    .map((p) => ({
      ...p,
      score: cosineSimilarity(embedding, p.embedding || []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(pickPublicFields);
}

/* =========================
   🔎 IMAGE SEARCH
========================= */

export async function searchProductsByImage(imagePath, limit = 5) {
  if (!imagePath) return [];
  const embedding = await getImageEmbedding(imagePath);
  return searchProductsByVector(embedding, limit);
}

/* =========================
   🧹 RESPONSE SHAPER
========================= */

function pickPublicFields(p) {
  return {
    id: p.id,
    englishTitle: p.englishTitle,
    chineseTitle: p.chineseTitle,
    brand: p.brand,
    size: p.size,
    category: p.category,
    publicUrl: p.publicUrl,
    score: Number(p.score?.toFixed(4) || 0),
  };
}
