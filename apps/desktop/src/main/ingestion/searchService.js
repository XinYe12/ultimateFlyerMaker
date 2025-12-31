import "./firebase.js"; // force init
import { getFirestore } from "firebase-admin/firestore";
import { FIRESTORE_COLLECTION } from "../config/vectorConfig.js";
import { getImageEmbedding } from "./imageEmbeddingService.js";
import { cosineSimilarity } from "./vectorUtils.js";

const db = getFirestore();

export async function searchByImage(imagePath) {
  // 🔑 FIX: destructure embedding
  const { embedding: queryEmbedding } = await getImageEmbedding(imagePath);

  if (!queryEmbedding || !queryEmbedding.length) {
    return [];
  }

  const snapshot = await db.collection(FIRESTORE_COLLECTION).get();
  const all = snapshot.docs.map(d => d.data());

  if (!all.length) return [];

  return all
    .map(p => ({
      ...p,
      score: Array.isArray(p.embedding)
        ? cosineSimilarity(queryEmbedding, p.embedding)
        : 0
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
