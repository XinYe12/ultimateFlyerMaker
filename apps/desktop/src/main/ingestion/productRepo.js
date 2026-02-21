import { db } from "./firebase.js";
import { FIRESTORE_COLLECTION } from "../config/vectorConfig.js";

export async function saveProductEmbedding(productId, name, embedding, imagePath) {
  await db.collection(FIRESTORE_COLLECTION).doc(productId).set({
    id: productId,
    name,
    embedding,
    imagePath,
    createdAt: Date.now(),
  });
}

export async function getAllEmbeddings() {
  const snapshot = await db.collection(FIRESTORE_COLLECTION).get();
  return snapshot.docs.map((d) => d.data());
}
