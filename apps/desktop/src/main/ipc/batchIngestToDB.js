import path from "path";
import fs from "fs";
import crypto from "crypto";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import { getStorage } from "firebase-admin/storage";
import { db, debugFirestoreTrack, runFirestoreTimed } from "../ingestion/firebase.js";

const GET_DB_STATS_TIMEOUT_MS = 20_000;
import { getImageEmbedding, embedText, classifyImageAsProduct } from "../ingestion/imageEmbeddingService.js";
import { hammingDistance } from "../ingestion/pHashService.js";
import { buildSearchTokens, invalidateEmbeddingCache, buildMatchKeys } from "../ingestion/searchService.js";
import { FIRESTORE_COLLECTION } from "../config/vectorConfig.js";
import { assertCanRead, assertCanWrite, trackReads, trackWrites, trackDeletes, trackStorageUpload, getQuotaStatus } from "./quotaTracker.js";
import { getResourceProfile } from "../resourceProfile.js";
import { debugIngest } from "../debugIngest.js";

const _workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../ingestion/pHashWorker.js");

let _pHashWorker = null;

function getPHashWorker() {
  if (_pHashWorker) return _pHashWorker;
  const w = new Worker(_workerPath);
  w.once("exit", () => { if (_pHashWorker === w) _pHashWorker = null; });
  _pHashWorker = w;
  return w;
}

function computePHashInWorker(imagePath) {
  return new Promise((resolve, reject) => {
    const w = getPHashWorker();
    const onMsg = (msg) => {
      w.off("message", onMsg);
      w.off("error", onErr);
      msg.error ? reject(new Error(msg.error)) : resolve(msg.hash);
    };
    const onErr = (err) => {
      w.off("message", onMsg);
      w.off("error", onErr);
      if (_pHashWorker === w) _pHashWorker = null;
      reject(err);
    };
    w.on("message", onMsg);
    w.on("error", onErr);
    w.postMessage({ imagePath });
  });
}

const PHASH_THRESHOLD = 10;

let _stopRequested = false;

/** Signal the running batch to stop after the current image finishes. */
export function requestBatchStop() {
  _stopRequested = true;
}

function sleep(ms) {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

/** High-resolution elapsed ms between calls (Node performance.now). */
function createLapTimer() {
  let t = performance.now();
  return () => {
    const n = performance.now();
    const d = n - t;
    t = n;
    return d;
  };
}

function roundMs(ms) {
  return Math.round(Number(ms) || 0);
}

async function maybePauseForRss() {
  const mb = getResourceProfile().batchPauseIfRssMb;
  if (!mb) return;
  const rssMb = process.memoryUsage().rss / (1024 * 1024);
  if (rssMb > mb) {
    console.warn(
      `[batchIngestToDB] Main RSS ~${rssMb.toFixed(0)}MB exceeds UFM_BATCH_PAUSE_RSS_MB=${mb} — pausing 2.5s`
    );
    await sleep(2500);
  }
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
  _stopRequested = false;
  const batchDelayMs = getResourceProfile().batchDelayMs;
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

    const dedupCap = getResourceProfile().pHashDedupMaxDocs;
    const effectiveLoad = (dedupCap > 0 && collectionSize > dedupCap) ? dedupCap : collectionSize;
    if (dedupCap > 0 && collectionSize > dedupCap) {
      console.warn(
        `[batchIngestToDB] Collection has ${collectionSize} docs; loading only ${dedupCap} recent pHashes ` +
        `for dedup (UFM_PHASH_DEDUP_MAX_DOCS=${dedupCap}). Set to 0 on normal profile for full dedup.`
      );
    }
    assertCanRead(effectiveLoad);
    let pHashQuery = db.collection(FIRESTORE_COLLECTION).select("pHash");
    if (dedupCap > 0 && collectionSize > dedupCap) {
      pHashQuery = pHashQuery.orderBy("createdAt", "desc").limit(dedupCap);
    }
    const phashSnap = await pHashQuery.get();
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
    if (_stopRequested) break;
    const imagePath = paths[i];
    if (i > 0 && batchDelayMs > 0) {
      await sleep(batchDelayMs);
    }
    await maybePauseForRss();
    let parsed = null;
    let pHash = null;
    const iterationStarted = performance.now();
    let hashingMs = 0;
    let dedupMs = 0;
    let analyzingMs = 0;
    let savingSetMs = 0;
    let uploadingMs = 0;
    let savingUpdateMs = 0;
    try {
      const lap = createLapTimer();

      // --- 1. Hash ---
      emitProgress({ path: imagePath, status: "hashing" });
      pHash = await computePHashInWorker(imagePath);
      hashingMs = roundMs(lap());

      // --- 2. Dedup ---
      emitProgress({ path: imagePath, status: "dedup" });
      const isDuplicate = existingHashes.some(
        (h) => hammingDistance(h, pHash) <= PHASH_THRESHOLD
      );
      dedupMs = roundMs(lap());
      if (isDuplicate) {
        emitProgress({
          path: imagePath,
          status: "duplicate",
          pipelineTimingMs: {
            hashing: hashingMs,
            dedup: dedupMs,
            total: hashingMs + dedupMs,
          },
        });
        duplicates++;
        continue;
      }

      // --- 3. OCR + Metadata + Embedding ---
      emitProgress({ path: imagePath, status: "analyzing" });
      const result = await getImageEmbedding(imagePath);
      parsed = result.parsed;
      const embedding = result.embedding;
      analyzingMs = roundMs(lap());

      // Skip non-product images (title cards, banners, text labels, etc.)
      if (parsed.isProduct === false) {
        console.log("[batchIngestToDB] Skipping non-product image:", imagePath);
        emitProgress({
          path: imagePath,
          status: "skipped",
          error: "Not a product image",
          pipelineTimingMs: {
            hashing: hashingMs,
            dedup: dedupMs,
            analyzing: analyzingMs,
            total: hashingMs + dedupMs + analyzingMs,
          },
        });
        skipped++;
        continue;
      }

      const hasMeaningfulParsed =
        (parsed.englishTitle || parsed.cleanTitle || parsed.chineseTitle || parsed.brand || "").trim().length > 0;
      if (!hasMeaningfulParsed) {
        console.log("[batchIngestToDB] Could not identify product — flagging for user review:", imagePath);
        emitProgress({
          path: imagePath,
          status: "needs_confirmation",
          parsed,
          pipelineTimingMs: {
            hashing: hashingMs,
            dedup: dedupMs,
            analyzing: analyzingMs,
            total: hashingMs + dedupMs + analyzingMs,
          },
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
      const matchKeys = buildMatchKeys(parsed.englishTitle, parsed.chineseTitle, parsed.size);

      // --- 4a. Write pending doc BEFORE Storage upload ---
      // Each image costs 2 writes: set (pending) + update (active).
      assertCanWrite(2);
      emitProgress({ path: imagePath, status: "saving" });
      await db.collection(FIRESTORE_COLLECTION).doc(productId).set({
        id: productId,
        ...parsed,
        embedding: Array.isArray(embedding) && embedding.length > 0 ? embedding : [],
        embeddingModel: Array.isArray(embedding) && embedding.length > 0 ? "gemini-embedding-2" : "",
        pHash,
        searchTokens,
        matchKeys,
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      trackWrites(1);
      savingSetMs = roundMs(lap());

      // --- 4b. Upload to Storage ---
      emitProgress({ path: imagePath, status: "uploading" });
      const fileSizeBytes = fs.statSync(imagePath).size;
      const imageInfo = await uploadToStorage(bucket, productId, imagePath);
      trackStorageUpload(fileSizeBytes);
      uploadingMs = roundMs(lap());

      // --- 4c. Flip to active ---
      await db.collection(FIRESTORE_COLLECTION).doc(productId).update({
        imageStoragePath: imageInfo.storagePath,
        publicUrl: imageInfo.publicUrl,
        imageGsUri: imageInfo.gsUri,
        status: "active",
        updatedAt: Date.now(),
      });
      trackWrites(1);
      savingUpdateMs = roundMs(lap());

      invalidateEmbeddingCache();

      // Prevent intra-batch duplicates
      existingHashes.push(pHash);

      const totalMs =
        hashingMs + dedupMs + analyzingMs + savingSetMs + uploadingMs + savingUpdateMs;
      emitProgress({
        path: imagePath,
        status: "done",
        productId,
        title: parsed.englishTitle || parsed.cleanTitle || "",
        publicUrl: imageInfo.publicUrl,
        pipelineTimingMs: {
          hashing: hashingMs,
          dedup: dedupMs,
          analyzing: analyzingMs,
          savingSet: savingSetMs,
          uploading: uploadingMs,
          savingUpdate: savingUpdateMs,
          total: totalMs,
        },
      });
      added++;
    } catch (err) {
      console.error("[batchIngestToDB] Error processing", imagePath, err);
      const wallTotal = roundMs(performance.now() - iterationStarted);
      const partial = {
        hashing: hashingMs,
        dedup: dedupMs,
        ...(analyzingMs > 0 ? { analyzing: analyzingMs } : {}),
        ...(savingSetMs > 0 ? { savingSet: savingSetMs } : {}),
        ...(uploadingMs > 0 ? { uploading: uploadingMs } : {}),
        ...(savingUpdateMs > 0 ? { savingUpdate: savingUpdateMs } : {}),
        total: wallTotal,
      };
      const isQuotaError = err.message?.includes("quota");
      if (isQuotaError) {
        emitProgress({ path: imagePath, status: "error", error: err.message, pipelineTimingMs: partial });
        errors++;
      } else {
        emitProgress({
          path: imagePath,
          status: "needs_confirmation",
          parsed,
          error: err.message,
          pipelineTimingMs: partial,
        });
      }
    }
  }

  emitComplete({ added, duplicates, skipped, errors, stopped: _stopRequested });
}

/**
 * Save a single image to DB after user confirms (Gemini failed to parse).
 *
 * @param {string} imagePath - Absolute path to the image
 * @param {object} parsed - Parsed metadata (may have empty fields)
 * @returns {Promise<{ ok: boolean; productId?: string; title?: string; publicUrl?: string; duplicate?: boolean; error?: string }>}
 */
export async function confirmSingleImageToDb(imagePath, parsed) {
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

  let pHash = null;
  // Optional: check pHash for duplicate
  try {
    pHash = await computePHashInWorker(imagePath);
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
    const matchKeys = buildMatchKeys(normalized.englishTitle, normalized.chineseTitle, normalized.size);

    const embeddingText = [
      normalized.englishTitle,
      normalized.chineseTitle,
      normalized.brand,
      normalized.size,
      normalized.category,
      normalized.cleanTitle,
      normalized.ocrText,
    ].filter(Boolean).join(" | ") || "product";
    const embedding = await embedText(embeddingText);

    assertCanWrite(2);
    await db.collection(FIRESTORE_COLLECTION).doc(productId).set({
      id: productId,
      ...normalized,
      embedding: Array.isArray(embedding) && embedding.length > 0 ? embedding : [],
      embeddingModel: Array.isArray(embedding) && embedding.length > 0 ? "gemini-embedding-2" : "",
      pHash: pHash ?? null,
      searchTokens,
      matchKeys,
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

function isMessyTitle(t) {
  return !t || /^[a-f0-9_\-\.]{16,}$/i.test(t.trim());
}

/**
 * Delete all active products whose englishTitle AND chineseTitle are both
 * hash-like strings (no real human-readable name).
 */
export async function cleanMessyTitleProducts(emitProgress, emitComplete) {
  try {
    const snap = await db
      .collection(FIRESTORE_COLLECTION)
      .where("status", "==", "active")
      .select("englishTitle", "chineseTitle")
      .get();
    trackReads(snap.size);

    const messy = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((d) => isMessyTitle(d.englishTitle) && isMessyTitle(d.chineseTitle));

    const total = messy.length;
    let deleted = 0;
    let errors = 0;

    if (total === 0) {
      emitComplete({ deleted: 0, total: 0, errors: 0 });
      return;
    }

    for (let i = 0; i < messy.length; i++) {
      const doc = messy[i];
      emitProgress({ current: i + 1, total, title: doc.id });
      try {
        await deleteProductFromDb(doc.id);
        deleted++;
      } catch (err) {
        console.error("[cleanMessyTitles] Failed to delete", doc.id, err?.message);
        errors++;
      }
    }

    emitComplete({ deleted, total, errors });
  } catch (err) {
    console.error("[cleanMessyTitles] Query failed:", err?.message);
    emitComplete({ deleted: 0, total: 0, errors: 1, error: err?.message });
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
  const callId = `getDbStats-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const t0 = Date.now();
  LOG("A", "Called. Using db from ingestion/firebase.js");
  // #region agent log
  debugFirestoreTrack("getDbStats", "start", { callId });
  debugIngest({
      location: "batchIngestToDB.js:getDbStats",
      message: "getDbStats entry",
      data: { callId },
      hypothesisId: "B",
      });
  // #endregion
  LOG("B", "Building query: db.collection('" + FIRESTORE_COLLECTION + "').count().get()");
  // count() aggregation costs 1 read regardless of collection size.
  assertCanRead(1);
  try {
    const snap = await runFirestoreTimed(
      () =>
        db
          .collection(FIRESTORE_COLLECTION)
          .count()
          .get(),
      GET_DB_STATS_TIMEOUT_MS
    );
    trackReads(1);
    LOG("C", "Query succeeded. count=" + snap.data().count);
    // #region agent log
    debugIngest({
        location: "batchIngestToDB.js:getDbStats",
        message: "getDbStats ok",
        data: { callId, ms: Date.now() - t0, count: snap.data().count },
        hypothesisId: "B",
        });
    // #endregion
    return { count: snap.data().count, quota: getQuotaStatus() };
  } finally {
    // #region agent log
    debugFirestoreTrack("getDbStats", "end", { callId, ms: Date.now() - t0 });
    // #endregion
  }
}

export async function getTodaysSaves() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon…
  const daysToMonday = (dayOfWeek + 6) % 7; // days since last Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  const todayMs = monday.getTime();
  const snap = await db.collection(FIRESTORE_COLLECTION)
    .where("createdAt", ">=", todayMs)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  return snap.docs
    .map(d => d.data())
    .filter(d => d.source === "flyer_editor")
    .map(d => ({
      id: d.id,
      englishTitle: d.englishTitle ?? "",
      chineseTitle: d.chineseTitle ?? "",
      publicUrl: d.publicUrl ?? "",
      salePrice: d.salePrice ?? "",
      department: d.department ?? "",
      createdAt: d.createdAt,
      status: d.status ?? "active",
    }));
}

