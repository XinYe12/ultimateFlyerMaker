/**
 * saveCombinationToDB.js
 *
 * Saves flyer editor product cards into product_vectors (Firestore + Storage).
 * Unlike batchIngestToDB, metadata is already known (titles, sizes, prices),
 * so Gemini/OCR is skipped.
 *
 * The saved documents include a `matchKeys` array for O(1) exact-match lookup when
 * a future XLSX upload contains the same product names (via the searchForDiscountItem
 * fast-path in searchService.js).
 */

import path from "path";
import fs from "fs";
import crypto from "crypto";
import { getStorage } from "firebase-admin/storage";
import { db } from "../ingestion/firebase.js";
import { embedText } from "../ingestion/imageEmbeddingService.js";
import { normalize, buildSearchTokens, invalidateEmbeddingCache } from "../ingestion/searchService.js";
import { FIRESTORE_COLLECTION } from "../config/vectorConfig.js";
import { assertCanWrite, trackWrites, trackStorageUpload } from "./quotaTracker.js";

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function buildProductId(en, zh, imagePath) {
  const base = slugify(en) || slugify(zh) || "product";
  const shortHash = crypto
    .createHash("md5")
    .update(String(imagePath || base))
    .digest("hex")
    .slice(0, 8);
  return `${base}_${shortHash}`;
}

/**
 * Build a canonical set of match keys for fast exact lookup.
 * Stored in Firestore `matchKeys` array field; queried via array-contains.
 */
function buildMatchKeys(en, zh, size) {
  const candidates = [
    normalize(en),
    normalize(zh),
    normalize(`${en} ${size}`),
    normalize(`${zh} ${size}`),
    en ? en.toLowerCase().trim() : "",
    zh ? zh.trim() : "",
  ];
  return [...new Set(candidates.filter(Boolean))];
}

async function uploadToStorage(bucket, productId, imagePath) {
  const ext = path.extname(imagePath).replace(".", "") || "jpg";
  const storagePath = `products/${productId}/original.${ext}`;
  const token = crypto.randomUUID();

  await bucket.upload(imagePath, {
    destination: storagePath,
    metadata: {
      contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const bucketName = bucket.name;
  const encodedPath = encodeURIComponent(storagePath);
  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
  const gsUri = `gs://${bucketName}/${storagePath}`;
  return { storagePath, publicUrl, gsUri };
}

/**
 * Save a batch of editor items to Firestore + Storage.
 *
 * @param {Array<{id,imagePath,en,zh,size,salePrice,regularPrice,unit,quantity,department}>} items
 * @param {(data: object) => void} emitProgress  Per-item status events
 * @param {(data: object) => void} emitComplete  Final summary event
 */
export async function saveCombinationToDb(items, emitProgress, emitComplete) {
  const bucket = getStorage().bucket();
  let saved = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < items.length; i++) {
    const { id, imagePath, en, zh, size, salePrice, regularPrice, unit, quantity, department } = items[i];

    if (!imagePath || !fs.existsSync(imagePath)) {
      emitProgress({ id, index: i, total: items.length, status: "skipped", reason: "no image" });
      skipped++;
      continue;
    }

    if (!en && !zh) {
      emitProgress({ id, index: i, total: items.length, status: "skipped", reason: "no title" });
      skipped++;
      continue;
    }

    try {
      emitProgress({ id, index: i, total: items.length, status: "embedding" });
      const embeddingText = [en, zh, size].filter(Boolean).join(" | ") || "product";
      const embedding = await embedText(embeddingText);

      const matchKeys = buildMatchKeys(en, zh, size);
      const searchTokens = buildSearchTokens({ englishTitle: en, chineseTitle: zh, size, brand: "" });
      const productId = buildProductId(en, zh, imagePath);
      const cleanTitle = (en || zh || "").split(/\s+/).slice(0, 4).join(" ");

      emitProgress({ id, index: i, total: items.length, status: "saving" });

      assertCanWrite(2);
      await db.collection(FIRESTORE_COLLECTION).doc(productId).set({
        id: productId,
        englishTitle: en || "",
        chineseTitle: zh || "",
        brand: "",
        size: size || "",
        category: department || "other",
        cleanTitle,
        embedding: Array.isArray(embedding) && embedding.length > 0 ? embedding : [],
        embeddingModel: Array.isArray(embedding) && embedding.length > 0 ? "gemini-embedding-2" : "",
        searchTokens,
        matchKeys,
        pHash: "",
        salePrice: salePrice || "",
        regularPrice: regularPrice || "",
        unit: unit || "",
        quantity: quantity ?? null,
        department: department || "",
        source: "flyer_editor",
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      trackWrites(1);

      emitProgress({ id, index: i, total: items.length, status: "uploading" });
      const fileSizeBytes = fs.statSync(imagePath).size;
      const imageInfo = await uploadToStorage(bucket, productId, imagePath);
      trackStorageUpload(fileSizeBytes);

      await db.collection(FIRESTORE_COLLECTION).doc(productId).update({
        imageStoragePath: imageInfo.storagePath,
        publicUrl: imageInfo.publicUrl,
        imageGsUri: imageInfo.gsUri,
        status: "active",
        updatedAt: Date.now(),
      });
      trackWrites(1);

      invalidateEmbeddingCache();

      emitProgress({ id, index: i, total: items.length, status: "done", productId, publicUrl: imageInfo.publicUrl });
      saved++;
    } catch (err) {
      console.error("[saveCombinationToDB] item failed:", id, err?.message);
      emitProgress({ id, index: i, total: items.length, status: "error", error: err?.message ?? "unknown error" });
      errors++;
    }
  }

  emitComplete({ saved, skipped, errors });
}
