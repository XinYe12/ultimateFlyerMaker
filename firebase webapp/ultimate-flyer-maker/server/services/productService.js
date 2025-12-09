import { db } from "../config/firebase.js";
import { getImageEmbedding } from "./imageEmbeddingService.js";
import { cosineSimilarity } from "../utils/vectorUtils.js";

const FIRESTORE_COLLECTION = "product_vectors";

export async function addProductFromImage(productId, name, imagePath) {
  const embedding = await getImageEmbedding(imagePath);

  await db.collection(FIRESTORE_COLLECTION).doc(productId).set({
    id: productId,
    name,
    embedding,
    imagePath,
    createdAt: Date.now()
  });

  return { id: productId, name };
}
