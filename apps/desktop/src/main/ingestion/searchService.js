// apps/desktop/apps/desktop/src/main/ingestion/searchService.js
// ✅ EXTRACTED FROM LEGACY — PURE FUNCTION

import "./firebase.js"; // force init
import { getFirestore } from "firebase-admin/firestore";
import { FIRESTORE_COLLECTION } from "../config/vectorConfig.js";
import { getImageEmbedding } from "./imageEmbeddingService.js";
import { cosineSimilarity } from "./vectorUtils.js";

const db = getFirestore();

export async function searchByImage(imagePath) {
  const queryEmbedding = await getImageEmbedding(imagePath);

  const snapshot = await db.collection(FIRESTORE_COLLECTION).get();
  const all = snapshot.docs.map((d) => d.data());

  if (!all.length) return [];

  return all
    .map((p) => ({
      ...p,
      score: cosineSimilarity(queryEmbedding, p.embedding || []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
