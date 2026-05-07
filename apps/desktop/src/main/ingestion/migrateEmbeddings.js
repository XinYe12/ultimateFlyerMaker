/**
 * Background migration: re-embed all existing product_vectors docs using Gemini.
 * Runs once on app startup, silently. Docs already tagged with embeddingModel=gemini are skipped.
 */

import { db } from "./firebase.js";
import { embedText } from "./imageEmbeddingService.js";
import { FIRESTORE_COLLECTION } from "../config/vectorConfig.js";
import { invalidateEmbeddingCache } from "./searchService.js";

const GEMINI_EMBED_MODEL = "gemini-embedding-2";
const INTER_REQUEST_DELAY_MS = 50;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Called once from main.js after Firebase initializes.
 * Fire-and-forget — does not block app startup.
 */
export async function migrateEmbeddingsIfNeeded() {
  let snap;
  try {
    snap = await db
      .collection(FIRESTORE_COLLECTION)
      .where("status", "==", "active")
      .where("embeddingModel", "not-in", [GEMINI_EMBED_MODEL])
      .select(
        "englishTitle", "chineseTitle", "brand", "size",
        "category", "cleanTitle", "ocrText"
      )
      .get();
  } catch (err) {
    // Firestore may not support 'not-in' on a field that doesn't exist on old docs.
    // Fall back to fetching all active docs and filtering client-side.
    console.warn("[migrateEmbeddings] not-in query failed, falling back to full scan:", err?.message?.slice(0, 80));
    try {
      snap = await db
        .collection(FIRESTORE_COLLECTION)
        .where("status", "==", "active")
        .select(
          "englishTitle", "chineseTitle", "brand", "size",
          "category", "cleanTitle", "ocrText", "embeddingModel"
        )
        .get();
    } catch (err2) {
      console.error("[migrateEmbeddings] Firestore query failed:", err2?.message);
      return;
    }
  }

  const docs = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => d.embeddingModel !== GEMINI_EMBED_MODEL);

  if (docs.length === 0) {
    console.log("[migrateEmbeddings] All products up to date — skipping");
    return;
  }

  console.log(`[migrateEmbeddings] Re-embedding ${docs.length} product(s) with Gemini...`);

  let updated = 0;
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const label = doc.englishTitle || doc.cleanTitle || doc.chineseTitle || doc.id;

    try {
      const embeddingText = [
        doc.englishTitle,
        doc.chineseTitle,
        doc.brand,
        doc.size,
        doc.category,
        doc.cleanTitle,
        doc.ocrText,
      ].filter(Boolean).join(" | ") || "product";

      const embedding = await embedText(embeddingText);

      if (Array.isArray(embedding) && embedding.length > 0) {
        await db.collection(FIRESTORE_COLLECTION).doc(doc.id).update({
          embedding,
          embeddingModel: GEMINI_EMBED_MODEL,
          updatedAt: Date.now(),
        });
        updated++;
        console.log(`[migrateEmbeddings] [${i + 1}/${docs.length}] ${label}`);
      } else {
        console.warn(`[migrateEmbeddings] [${i + 1}/${docs.length}] Embed returned empty for: ${label}`);
      }
    } catch (err) {
      console.error(`[migrateEmbeddings] [${i + 1}/${docs.length}] Failed for ${label}:`, err?.message?.slice(0, 80));
    }

    if (i < docs.length - 1) await sleep(INTER_REQUEST_DELAY_MS);
  }

  console.log(`[migrateEmbeddings] Done — updated ${updated}/${docs.length} products`);
  if (updated > 0) invalidateEmbeddingCache();
}

/**
 * On-demand re-embed: same logic as migrateEmbeddingsIfNeeded but streams
 * progress back via a callback and returns a result summary.
 * @param {(data: { current: number; total: number; label: string }) => void} emitProgress
 * @returns {Promise<{ updated: number; total: number; errors: number }>}
 */
export async function reembedAllProducts(emitProgress) {
  let snap;
  try {
    snap = await db
      .collection(FIRESTORE_COLLECTION)
      .where("status", "==", "active")
      .where("embeddingModel", "not-in", [GEMINI_EMBED_MODEL])
      .select(
        "englishTitle", "chineseTitle", "brand", "size",
        "category", "cleanTitle", "ocrText"
      )
      .get();
  } catch {
    try {
      snap = await db
        .collection(FIRESTORE_COLLECTION)
        .where("status", "==", "active")
        .select(
          "englishTitle", "chineseTitle", "brand", "size",
          "category", "cleanTitle", "ocrText", "embeddingModel"
        )
        .get();
    } catch (err2) {
      console.error("[reembedAllProducts] Firestore query failed:", err2?.message);
      return { updated: 0, total: 0, errors: 1 };
    }
  }

  const docs = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => d.embeddingModel !== GEMINI_EMBED_MODEL);

  const total = docs.length;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const label = doc.englishTitle || doc.cleanTitle || doc.chineseTitle || doc.id;
    emitProgress({ current: i + 1, total, label });

    try {
      const embeddingText = [
        doc.englishTitle, doc.chineseTitle, doc.brand,
        doc.size, doc.category, doc.cleanTitle, doc.ocrText,
      ].filter(Boolean).join(" | ") || "product";

      const embedding = await embedText(embeddingText);
      if (Array.isArray(embedding) && embedding.length > 0) {
        await db.collection(FIRESTORE_COLLECTION).doc(doc.id).update({
          embedding,
          embeddingModel: GEMINI_EMBED_MODEL,
          updatedAt: Date.now(),
        });
        updated++;
      } else {
        errors++;
      }
    } catch {
      errors++;
    }

    if (i < docs.length - 1) await sleep(INTER_REQUEST_DELAY_MS);
  }

  if (updated > 0) invalidateEmbeddingCache();
  return { updated, total, errors };
}
