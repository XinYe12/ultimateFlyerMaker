import "../config/firebase.js";           // FORCE initialize first
import { getFirestore } from "firebase-admin/firestore";
import { FIRESTORE_COLLECTION } from "../config/vectorConfig.js";
import { getImageEmbedding } from "./imageEmbeddingService.js";
import { cosineSimilarity } from "../utils/vectorUtils.js";

const db = getFirestore();

export async function searchByImage(queryImagePath) {
  const queryEmbedding = await getImageEmbedding(queryImagePath);

  // READ ALL PRODUCTS — THIS IS WHERE YOU GOT NOT_FOUND
  const snapshot = await db.collection(FIRESTORE_COLLECTION).get();

  const all = snapshot.docs.map((d) => d.data());

  if (all.length === 0) {
    return { error: "No products found in Firestore" };
  }

  let best = null;
  let score = -1;

  for (const p of all) {
    const sim = cosineSimilarity(queryEmbedding, p.embedding);
    if (sim > score) {
      score = sim;
      best = p;
    }
  }

  return { bestMatch: best, score };
}
