import path from "path";
import fs from "fs";
import crypto from "crypto";
import { getStorage } from "firebase-admin/storage";
import { db } from "../ingestion/firebase.js";
import { getImageEmbedding, classifyImageAsProduct } from "../ingestion/imageEmbeddingService.js";
import { computePHash, hammingDistance } from "../ingestion/pHashService.js";
import { buildSearchTokens, invalidateEmbeddingCache } from "../ingestion/searchService.js";
import { FIRESTORE_COLLECTION } from "../config/vectorConfig.js";
import { assertCanRead, assertCanWrite, trackReads, trackWrites, trackDeletes, trackStorageUpload, getQuotaStatus } from "./quotaTracker.js";

const PHASH_THRESHOLD = 10;

/** Optional delay (ms) between images to reduce Ollama CPU spikes. Set UFM_BATCH_DELAY_MS=2000 for 2s pause. */
const BATCH_DELAY_MS = Math.max(0, parseInt(process.env.UFM_BATCH_DELAY_MS || "0", 10) || 0);

function sleep(ms) {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

/**
 * Normalise a string into a Firestore-safe document ID segment.
 * Matches the Java buildProductId logic.
 */
function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

/**
 * Build a deterministic product ID from parsed vision data or the filename.
 * Priority: cleanTitle → englishTitle → filename stem.
 */
function buildProductId(parsed, imagePath) {
  const base =
    slugify(parsed?.cleanTitle) ||
    slugify(parsed?.englishTitle) ||
    slugify(path.basename(imagePath, path.extname(imagePath)));
  // Append a short hash of the path for uniqueness
  const shortHash = crypto
    .createHash("md5")
    .update(imagePath)
    .digest("hex")
    .slice(0, 8);
  return `${base || "product"}_${shortHash}`;
}

/**
 * Upload an image to Firebase Storage at products/{productId}/original.{ext}.
 * Generates a UUID download token so the public URL is accessible.
 */
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
 * Process a batch of image paths — pHash dedup → vision/embed → Storage → Firestore.
 *
 * @param {string[]} paths          Absolute image paths to process.
 * @param {(data: object) => void} emitProgress  Called for each step/image.
 * @param {(data: object) => void} emitComplete  Called once when batch finishes.
 */
export async function processDbBatch(paths, emitProgress, emitComplete) {
  const bucket = getStorage().bucket();
  let added = 0;
  let duplicates = 0;
  let skipped = 0;
  let errors = 0;

  // Load all existing pHashes once (efficient: select only pHash field)
  // Each document returned counts as 1 Firestore read — check quota first.
  let existingHashes = [];
  try {
    console.log("[batchIngestToDB] Loading pHashes from Firestore...");
    // We don't know the collection size yet; do a count first (costs 1 read).
    assertCanRead(1);
    const countSnap = await db.collection(FIRESTORE_COLLECTION).count().get();
    trackReads(1);
    const collectionSize = countSnap.data().count;

    // Now check if we have quota for the full pHash read.
    assertCanRead(collectionSize);
    const phashSnap = await db
      .collection(FIRESTORE_COLLECTION)
      .select("pHash")
      .get();
    trackReads(phashSnap.docs.length);

    existingHashes = phashSnap.docs
      .map((d) => d.data().pHash)
      .filter(Boolean);
    console.log("[batchIngestToDB] Loaded", existingHashes.length, "pHashes for dedup");
    const q = getQuotaStatus();
    console.log(`[batchIngestToDB] Quota after pHash load — reads: ${q.reads.used}/${q.reads.limit}, writes: ${q.writes.used}/${q.writes.limit}`);
  } catch (err) {
    if (err.message?.includes("quota")) {
      // Quota hard-stop — abort the whole batch
      emitComplete({ added: 0, duplicates: 0, skipped: paths.length, errors: 0, error: err.message });
      return;
    }
    console.warn("[batchIngestToDB] Firestore unreachable, skipping dedup:", err?.message?.slice(0, 80));
  }

  for (let i = 0; i < paths.length; i++) {
    const imagePath = paths[i];
    if (i > 0 && BATCH_DELAY_MS > 0) {
      await sleep(BATCH_DELAY_MS);
    }
    try {
      // --- 1. Hash ---
      emitProgress({ path: imagePath, status: "hashing" });
      const pHash = await computePHash(imagePath);

      // --- 2. Dedup ---
      emitProgress({ path: imagePath, status: "dedup" });
      const isDuplicate = existingHashes.some(
        (h) => hammingDistance(h, pHash) <= PHASH_THRESHOLD
      );
      if (isDuplicate) {
        emitProgress({ path: imagePath, status: "duplicate" });
        duplicates++;
        continue;
      }

      // --- 3. OCR + Metadata + Embedding ---
      emitProgress({ path: imagePath, status: "analyzing" });
      const { embedding, parsed } = await getImageEmbedding(imagePath);

      // Skip non-product images (title cards, banners, text labels, etc.)
      if (parsed.isProduct === false) {
        console.log("[batchIngestToDB] Skipping non-product image:", imagePath);
        emitProgress({ path: imagePath, status: "skipped", error: "Not a product image" });
        skipped++;
        continue;
      }

      // Only hard-fail if the embedding vector is missing (Ollama down).
      if (!Array.isArray(embedding) || embedding.length === 0) {
        emitProgress({ path: imagePath, status: "error", error: "Embedding failed — is Ollama running? Not saved to DB." });
        errors++;
        continue;
      }

      // When Gemini (+ DeepSeek fallback) could not return usable parsed data, pause for user confirmation
      const hasMeaningfulParsed =
        (parsed.englishTitle || parsed.cleanTitle || parsed.chineseTitle || parsed.brand || "").trim().length > 0;
      if (!hasMeaningfulParsed) {
        console.log("[batchIngestToDB] No parsed data from Gemini — awaiting user confirmation:", imagePath);
        emitProgress({
          path: imagePath,
          status: "needs_confirmation",
          parsed: {
            englishTitle: parsed.englishTitle,
            chineseTitle: parsed.chineseTitle,
            brand: parsed.brand,
            size: parsed.size,
            category: parsed.category,
            cleanTitle: parsed.cleanTitle,
            isProduct: parsed.isProduct,
            ocrText: parsed.ocrText,
          },
          embedding,
        });
        continue;
      }

      // Emit parsed metadata so the UI can display what Gemini extracted
      console.log("[batchIngestToDB] Gemini parsed:", JSON.stringify(parsed));
      emitProgress({
        path: imagePath,
        status: "analyzed",
        parsed: {
          englishTitle: parsed.englishTitle,
          chineseTitle: parsed.chineseTitle,
          brand: parsed.brand,
          size: parsed.size,
          category: parsed.category,
          cleanTitle: parsed.cleanTitle,
        },
      });

      const productId = buildProductId(parsed, imagePath);
      const searchTokens = buildSearchTokens(parsed);

      // --- 4a. Write pending doc BEFORE Storage upload ---
      // Each image costs 2 writes: set (pending) + update (active).
      assertCanWrite(2);
      emitProgress({ path: imagePath, status: "saving" });
      await db.collection(FIRESTORE_COLLECTION).doc(productId).set({
        id: productId,
        ...parsed,
        embedding,
        pHash,
        searchTokens,
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      trackWrites(1);

      // --- 4b. Upload to Storage ---
      emitProgress({ path: imagePath, status: "uploading" });
      const fileSizeBytes = fs.statSync(imagePath).size;
      const imageInfo = await uploadToStorage(bucket, productId, imagePath);
      trackStorageUpload(fileSizeBytes);

      // --- 4c. Flip to active ---
      await db.collection(FIRESTORE_COLLECTION).doc(productId).update({
        imageStoragePath: imageInfo.storagePath,
        publicUrl: imageInfo.publicUrl,
        imageGsUri: imageInfo.gsUri,
        status: "active",
        updatedAt: Date.now(),
      });
      trackWrites(1);

      invalidateEmbeddingCache();

      // Prevent intra-batch duplicates
      existingHashes.push(pHash);

      emitProgress({
        path: imagePath,
        status: "done",
        productId,
        title: parsed.englishTitle || parsed.cleanTitle || "",
        publicUrl: imageInfo.publicUrl,
      });
      added++;
    } catch (err) {
      console.error("[batchIngestToDB] Error processing", imagePath, err);
      emitProgress({ path: imagePath, status: "error", error: err.message });
      errors++;
    }
  }

  emitComplete({ added, duplicates, skipped, errors });
}

/**
 * Save a single image to DB after user confirms (Gemini failed to parse).
 * Uses provided parsed metadata and embedding from the earlier getImageEmbedding call.
 *
 * @param {string} imagePath - Absolute path to the image
 * @param {object} parsed - Parsed metadata (may have empty fields)
 * @param {number[]} embedding - Precomputed embedding vector
 * @returns {Promise<{ ok: boolean; productId?: string; title?: string; publicUrl?: string; duplicate?: boolean; error?: string }>}
 */
export async function confirmSingleImageToDb(imagePath, parsed, embedding) {
  const bucket = getStorage().bucket();

  // Normalize parsed shape
  const normalized = {
    isProduct: parsed?.isProduct !== false,
    englishTitle: String(parsed?.englishTitle ?? "").trim(),
    chineseTitle: String(parsed?.chineseTitle ?? "").trim(),
    brand: String(parsed?.brand ?? "").trim(),
    size: String(parsed?.size ?? "").trim(),
    category: String(parsed?.category ?? "").trim(),
    cleanTitle: String(parsed?.cleanTitle ?? "").trim(),
    ocrText: String(parsed?.ocrText ?? "").trim(),
  };

  if (!Array.isArray(embedding) || embedding.length === 0) {
    return { ok: false, error: "Embedding missing — cannot save." };
  }

  let pHash = null;
  // Optional: check pHash for duplicate
  try {
    pHash = await computePHash(imagePath);
    assertCanRead(1);
    const countSnap = await db.collection(FIRESTORE_COLLECTION).count().get();
    trackReads(1);
    const collectionSize = countSnap.data().count;

    if (collectionSize > 0) {
      assertCanRead(collectionSize);
      const phashSnap = await db.collection(FIRESTORE_COLLECTION).select("pHash").get();
      trackReads(phashSnap.docs.length);
      const existingHashes = phashSnap.docs.map((d) => d.data().pHash).filter(Boolean);
      const isDuplicate = existingHashes.some((h) => hammingDistance(h, pHash) <= PHASH_THRESHOLD);
      if (isDuplicate) {
        return { ok: false, duplicate: true, error: "Image already in database (duplicate)." };
      }
    }
  } catch (err) {
    console.warn("[confirmSingleImageToDb] Dedup check skipped:", err?.message?.slice(0, 80));
  }

  try {
    const productId = buildProductId(normalized, imagePath);
    const searchTokens = buildSearchTokens(normalized);

    assertCanWrite(2);
    await db.collection(FIRESTORE_COLLECTION).doc(productId).set({
      id: productId,
      ...normalized,
      embedding,
      pHash: pHash ?? null,
      searchTokens,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    trackWrites(1);

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

    const title = normalized.englishTitle || normalized.cleanTitle || path.basename(imagePath, path.extname(imagePath));
    return {
      ok: true,
      productId,
      title,
      publicUrl: imageInfo.publicUrl,
    };
  } catch (err) {
    console.error("[confirmSingleImageToDb] Error:", err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Scan all active products in the DB: send each image to Gemini.
 * If classified as non-product, delete the Firestore doc and Storage files.
 *
 * @param {(data: { productId: string; title?: string; status: string; deleted?: boolean; error?: string }) => void} emitProgress
 * @param {(data: { scanned: number; deleted: number; errors: number }) => void} emitComplete
 */
export async function scanAndRemoveNonProducts(emitProgress, emitComplete) {
  const bucket = getStorage().bucket();
  let scanned = 0;
  let deleted = 0;
  let errors = 0;

  try {
    // Pre-flight: Gemini API key must be present or every image will fail
    const geminiKey = String(process.env.GEMINI_API_KEY || "").trim();
    if (!geminiKey) {
      throw new Error("GEMINI_API_KEY is not configured in .env. Set it to use Scan Non-Products.");
    }

    assertCanRead(1);
    const countSnap = await db.collection(FIRESTORE_COLLECTION).count().get();
    trackReads(1);
    const totalDocs = countSnap.data().count;

    assertCanRead(totalDocs);
    const snap = await db
      .collection(FIRESTORE_COLLECTION)
      .select("id", "englishTitle", "cleanTitle", "publicUrl", "imageStoragePath")
      .get();
    trackReads(snap.docs.length);

    const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const title = p.englishTitle || p.cleanTitle || p.id;

      if (!p.publicUrl) {
        emitProgress({ productId: p.id, title, status: "skipped", error: "No publicUrl" });
        errors++;
        continue;
      }

      emitProgress({ productId: p.id, title, status: "scanning" });

      try {
        const { isProduct } = await classifyImageAsProduct(p.publicUrl);
        scanned++;

        if (!isProduct) {
          // Delete Firestore doc
          await db.collection(FIRESTORE_COLLECTION).doc(p.id).delete();
          trackDeletes(1);
          invalidateEmbeddingCache();

          // Delete Storage files
          try {
            const [files] = await bucket.getFiles({ prefix: `products/${p.id}/` });
            await Promise.all(files.map((f) => f.delete()));
          } catch (storageErr) {
            console.warn("[scanNonProducts] Storage delete failed for", p.id, storageErr?.message);
          }

          deleted++;
          emitProgress({ productId: p.id, title, status: "deleted", deleted: true });
        } else {
          emitProgress({ productId: p.id, title, status: "product" });
        }
      } catch (err) {
        console.error("[scanNonProducts] Error for", p.id, err);
        emitProgress({ productId: p.id, title, status: "error", error: err?.message });
        errors++;
        // Quota exhaustion affects all remaining items — stop immediately
        if (err?.message?.includes("quota")) {
          console.warn("[scanNonProducts] Quota exhausted — stopping scan early");
          break;
        }
      }
    }

    emitComplete({ scanned, deleted, errors });
  } catch (err) {
    console.error("[scanNonProducts] Fatal error:", err);
    emitComplete({ scanned, deleted, errors: errors + 1, error: err?.message });
  }
}

/**
 * Permanently delete a single product from Firestore and Firebase Storage.
 */
export async function deleteProductFromDb(productId) {
  const bucket = getStorage().bucket();

  // Delete Firestore doc
  await db.collection(FIRESTORE_COLLECTION).doc(productId).delete();
  trackDeletes(1);
  invalidateEmbeddingCache();

  // Delete Storage files (non-fatal if already gone)
  try {
    const [files] = await bucket.getFiles({ prefix: `products/${productId}/` });
    await Promise.all(files.map((f) => f.delete()));
  } catch (storageErr) {
    console.warn("[deleteProductFromDb] Storage delete failed for", productId, storageErr?.message);
  }
}

/**
 * Check consistency between Firestore and Firebase Storage.
 *
 * Returns three categories of issues:
 *  - stuck:            docs with status="pending" (upload started, never completed)
 *  - missingInStorage: docs with status="active" whose Storage file is gone
 *  - orphanedInStorage: Storage product folders with no corresponding Firestore doc
 */
export async function checkDbStorageConsistency() {
  const bucket = getStorage().bucket();

  // 1. Load all Firestore docs (lightweight select)
  assertCanRead(1);
  const countSnap = await db.collection(FIRESTORE_COLLECTION).count().get();
  trackReads(1);
  const totalDocs = countSnap.data().count;

  assertCanRead(totalDocs);
  const snap = await db
    .collection(FIRESTORE_COLLECTION)
    .select("status", "imageStoragePath")
    .get();
  trackReads(snap.docs.length);

  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const firestoreIds = new Set(docs.map((d) => d.id));

  // 2. List all Storage product folders (products/{productId}/...)
  const [files] = await bucket.getFiles({ prefix: "products/" });
  const storageProductIds = new Set();
  for (const file of files) {
    const parts = file.name.split("/");
    if (parts.length >= 2 && parts[1]) storageProductIds.add(parts[1]);
  }

  // 3. Classify
  const stuck = docs
    .filter((d) => d.status === "pending")
    .map((d) => d.id);

  // Orphaned docs: active Firestore docs with no image in Storage (or no imageStoragePath)
  const missingInStorage = docs
    .filter(
      (d) =>
        d.status === "active" &&
        (!d.imageStoragePath || !storageProductIds.has(d.id))
    )
    .map((d) => d.id);

  const orphanedInStorage = [...storageProductIds].filter((id) => !firestoreIds.has(id));

  console.log(
    `[dbSync] Check complete — stuck: ${stuck.length}, missingInStorage: ${missingInStorage.length}, orphanedInStorage: ${orphanedInStorage.length}`
  );

  return {
    totalDocs,
    totalStorageFiles: storageProductIds.size,
    stuck,
    missingInStorage,
    orphanedInStorage,
  };
}

/**
 * Delete broken entries identified by checkDbStorageConsistency.
 *  - stuck + missingInStorage → delete Firestore doc
 *  - orphanedInStorage        → delete Storage folder
 */
export async function fixDbStorageConsistency(report) {
  const bucket = getStorage().bucket();
  let fixed = 0;
  const errors = [];

  // Delete broken Firestore docs
  const fsToDelete = [...(report.stuck || []), ...(report.missingInStorage || [])];
  for (const productId of fsToDelete) {
    try {
      await db.collection(FIRESTORE_COLLECTION).doc(productId).delete();
      trackDeletes(1);
      invalidateEmbeddingCache();
      fixed++;
    } catch (err) {
      console.error("[dbSync] Failed to delete Firestore doc", productId, err.message);
      errors.push({ productId, error: err.message });
    }
  }

  // Delete orphaned Storage folders
  for (const productId of (report.orphanedInStorage || [])) {
    try {
      const [orphanFiles] = await bucket.getFiles({ prefix: `products/${productId}/` });
      await Promise.all(orphanFiles.map((f) => f.delete()));
      fixed++;
    } catch (err) {
      console.error("[dbSync] Failed to delete Storage folder", productId, err.message);
      errors.push({ productId, error: err.message });
    }
  }

  console.log(`[dbSync] Fix complete — fixed: ${fixed}, errors: ${errors.length}`);
  return { fixed, errors };
}

/**
 * Get the total count of documents in the product_vectors collection.
 * @returns {Promise<{ count: number }>}
 */
export async function getDbStats() {
  const LOG = (step, msg) => console.log(`[getDbStats] [${step}]`, msg);
  LOG("A", "Called. Using db from ingestion/firebase.js");
  LOG("B", "Building query: db.collection('" + FIRESTORE_COLLECTION + "').count().get()");
  // count() aggregation costs 1 read regardless of collection size.
  assertCanRead(1);
  const snap = await db
    .collection(FIRESTORE_COLLECTION)
    .count()
    .get();
  trackReads(1);
  LOG("C", "Query succeeded. count=" + snap.data().count);
  return { count: snap.data().count, quota: getQuotaStatus() };
}
