// apps/desktop/src/main/ingestion/promoteSerperResults.js
// When the user exports a flyer that contains Serper-sourced images, this module
// saves those images to the Firestore product_vectors collection so that the same
// (or similar) product triggers a DB hit on future pipeline runs instead of Serper.

import path from "path";
import crypto from "crypto";
import fs from "fs";
import { getStorage } from "firebase-admin/storage";
import { db } from "./firebase.js";
import { embedText } from "./imageEmbeddingService.js";
import { buildSearchTokens, buildMatchKeys, invalidateEmbeddingCache } from "./searchService.js";
import { FIRESTORE_COLLECTION } from "../config/vectorConfig.js";

async function uploadCutoutToStorage(bucket, cutoutPath, productId) {
  const ext = path.extname(cutoutPath).replace(".", "") || "png";
  const storagePath = `products/${productId}/serper-accepted.${ext}`;
  const token = crypto.randomUUID();

  await bucket.upload(cutoutPath, {
    destination: storagePath,
    metadata: {
      contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const bucketName = bucket.name;
  const encodedPath = encodeURIComponent(storagePath);
  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
  return { publicUrl, storagePath };
}

/**
 * Save user-accepted Serper images to Firestore product_vectors.
 * Called after flyer export so future pipelines can DB-match the same products.
 *
 * @param {Array<{ en?: string; zh?: string; size?: string; cutoutPath: string }>} items
 */
export async function promoteSerperResults(items) {
  if (!Array.isArray(items) || items.length === 0) return;

  let bucket;
  try {
    bucket = getStorage().bucket();
  } catch (err) {
    console.warn("[promoteSerperResults] Firebase Storage unavailable:", err.message);
    return;
  }

  let promoted = 0;
  for (const item of items) {
    const { en = "", zh = "", size = "", cutoutPath } = item;
    if (!cutoutPath) continue;

    // Skip if the cutout file no longer exists on disk
    try {
      await fs.promises.access(cutoutPath);
    } catch {
      console.warn(`[promoteSerperResults] Cutout file missing, skipping "${en}": ${cutoutPath}`);
      continue;
    }

    const sizeClean = (size || "").replace(/^\//, "").trim(); // "/LB" → "LB"
    const matchKeys = buildMatchKeys(en, zh, sizeClean);

    try {
      // Dedup: if any matchKey already exists in the DB, skip this product
      if (matchKeys.length > 0) {
        const snap = await db
          .collection(FIRESTORE_COLLECTION)
          .where("matchKeys", "array-contains", matchKeys[0])
          .limit(1)
          .get();
        if (!snap.empty) {
          console.log(`[promoteSerperResults] Already in DB, skipping "${en}"`);
          continue;
        }
      }

      // Embed the product name for semantic search
      const embedInput = [en, zh, sizeClean].filter(Boolean).join(" | ");
      const embedding = await embedText(embedInput);

      // Build a minimal parsed object so buildSearchTokens produces the right tokens
      const parsed = {
        englishTitle: en,
        chineseTitle: zh,
        brand: "",
        size: sizeClean,
        category: "",
        cleanTitle: en || zh,
        ocrText: "",
      };
      const searchTokens = buildSearchTokens(parsed);

      const productId = crypto.randomUUID();
      const { publicUrl, storagePath } = await uploadCutoutToStorage(bucket, cutoutPath, productId);

      await db.collection(FIRESTORE_COLLECTION).doc(productId).set({
        id: productId,
        englishTitle: en,
        chineseTitle: zh,
        brand: "",
        size: sizeClean,
        category: "",
        cleanTitle: en || zh,
        ocrText: "",
        embedding: Array.isArray(embedding) && embedding.length > 0 ? embedding : [],
        embeddingModel: Array.isArray(embedding) && embedding.length > 0 ? "gemini-embedding-2" : "",
        searchTokens,
        matchKeys,
        publicUrl,
        imageStoragePath: storagePath,
        status: "active",
        source: "user_accepted",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      promoted++;
      console.log(`[promoteSerperResults] Saved "${en}" to product DB (id=${productId})`);
    } catch (err) {
      console.warn(`[promoteSerperResults] Failed to promote "${en}":`, err.message);
    }
  }

  if (promoted > 0) {
    invalidateEmbeddingCache();
    console.log(`[promoteSerperResults] Promoted ${promoted}/${items.length} Serper result(s) to DB`);
  }
}
