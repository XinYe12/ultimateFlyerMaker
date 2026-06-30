import { db, debugFirestoreInFlight, runFirestoreTimed, debugFirestoreTrack } from "./firebase.js";
import { FIRESTORE_COLLECTION } from "../config/vectorConfig.js";
import { getImageEmbedding, embedText } from "./imageEmbeddingService.js";
import { computePHash, hammingDistance } from "./pHashService.js";
import { cosineUnitToRaw, normalizeL2 } from "./vectorUtils.js";
import { getResourceProfile } from "../resourceProfile.js";
import { debugIngest } from "../debugIngest.js";

const FIRESTORE_RETRY_ATTEMPTS = 3;
const FIRESTORE_RETRY_BASE_MS = 250;

// ── Firestore circuit breaker ─────────────────────────────────────────────────
// gRPC channels can go stale (NAT timeout, proxy drop). When this happens every
// query hangs for up to 300 s before failing. After CIRCUIT_OPEN_AFTER consecutive
// timeouts we skip DB lookups entirely for CIRCUIT_COOLDOWN_MS, then allow one
// probe to check whether the channel recovered.
const CIRCUIT_OPEN_AFTER  = 2;
const CIRCUIT_COOLDOWN_MS = 5 * 60_000; // 5 min

let _circuitFails  = 0;
let _circuitOpenAt = 0;

function _circuitOpen() {
  if (_circuitFails < CIRCUIT_OPEN_AFTER) return false;
  if (Date.now() - _circuitOpenAt > CIRCUIT_COOLDOWN_MS) {
    _circuitFails = CIRCUIT_OPEN_AFTER - 1; // allow one probe
    return false;
  }
  return true;
}

function _onFirestoreOk() {
  if (_circuitFails > 0) {
    console.log("[searchService] Firestore circuit CLOSED — connection recovered");
    _circuitFails = 0;
    _circuitOpenAt = 0;
  }
}

function _onFirestoreTimeout() {
  _circuitFails++;
  // #region agent log
  debugIngest({
      location: "searchService.js:_onFirestoreTimeout",
      message: "Firestore query timeout",
      data: { circuitFails: _circuitFails, firestoreInFlight: debugFirestoreInFlight },
      hypothesisId: "C",
      });
  // #endregion
  if (_circuitFails === CIRCUIT_OPEN_AFTER) {
    _circuitOpenAt = Date.now();
    console.warn(`[searchService] Firestore circuit OPEN (${CIRCUIT_OPEN_AFTER} consecutive timeouts) — skipping DB for ${CIRCUIT_COOLDOWN_MS / 60_000} min`);
  }
}

/** Reset the circuit breaker (call after re-initialising Firebase or on app resume). */
export function resetFirestoreCircuit() {
  _circuitFails = 0;
  _circuitOpenAt = 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True for gRPC/network flakes worth a short bounded retry. */
function isTransientFirestoreError(err) {
  if (!err) return false;
  const code = err.code;
  const msg = String(err.message || err.reason || err.details || "");
  if (code === 14 || code === 4 || code === "14" || code === "4") return true;
  const c = String(code || "").toLowerCase();
  if (c === "unavailable" || c === "deadline-exceeded" || c === "aborted") return true;
  return /UNAVAILABLE|DEADLINE_EXCEEDED|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|socket hang up|RST_STREAM|Internal error/i.test(
    msg
  );
}

/**
 * Run a Firestore read with bounded exponential backoff on transient errors.
 * @template T
 * @param {() => Promise<T>} operation
 * @param {{ maxAttempts?: number; baseDelayMs?: number }} [opts]
 * @returns {Promise<T>}
 */
export async function withFirestoreRetry(operation, opts = {}) {
  return withFirestoreRetryInner(operation, opts);
}

/** Firestore read: serialized queue + timeout starts when the op actually runs. */
async function firestoreRead(opName, operation, timeoutMs, onTimeout) {
  const callId = `${opName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const t0 = Date.now();
  // #region agent log
  debugFirestoreTrack(opName, "start", { callId });
  // #endregion
  try {
    const res = await runFirestoreTimed(() => withFirestoreRetryInner(operation), timeoutMs, () => {
      onTimeout?.();
      // #region agent log
      debugIngest({
          location: "searchService.js:firestoreRead",
          message: "firestoreRead timeout",
          data: { opName, callId, ms: Date.now() - t0, firestoreInFlight: debugFirestoreInFlight },
          hypothesisId: "C",
          });
      // #endregion
    });
    // #region agent log
    debugIngest({
        location: "searchService.js:firestoreRead",
        message: "firestoreRead ok",
        data: { opName, callId, ms: Date.now() - t0 },
        hypothesisId: "C",
        });
    // #endregion
    return res;
  } finally {
    // #region agent log
    debugFirestoreTrack(opName, "end", { callId, ms: Date.now() - t0 });
    // #endregion
  }
}

async function withFirestoreRetryInner(operation, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? FIRESTORE_RETRY_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? FIRESTORE_RETRY_BASE_MS;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      if (!isTransientFirestoreError(err) || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        `[searchService] Firestore transient error (attempt ${attempt}/${maxAttempts}), retry in ${delay}ms:`,
        err?.message?.slice(0, 120)
      );
      await sleep(Math.min(delay, 4000));
    }
  }
  throw lastErr;
}

/* ---------- Shared response shape (no embeddings) ---------- */
function pickPublicFields(p) {
  return {
    id: p.id,
    englishTitle: p.englishTitle,
    chineseTitle: p.chineseTitle,
    brand: p.brand,
    size: p.size,
    category: p.category,
    publicUrl: p.publicUrl,
    score: Number((p.score != null ? p.score : 0).toFixed(4)),
    // Optional: price + provenance for flyer_editor combination entries
    ...(p.salePrice != null    ? { salePrice: p.salePrice }       : {}),
    ...(p.regularPrice != null ? { regularPrice: p.regularPrice } : {}),
    ...(p.unit != null         ? { unit: p.unit }                 : {}),
    ...(p.quantity != null     ? { quantity: p.quantity }         : {}),
    ...(p.source != null       ? { source: p.source }             : {}),
  };
}

/* ---------- Text search (for product title → DB images) ---------- */
export function normalize(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/(\d+)(kg|g|克|ml|l)/g, "$1")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCjkNgrams(text, minN = 2, maxN = 3) {
  const cjk = (text.match(/[\p{Script=Han}]+/gu) || []).join("");
  const grams = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i + n <= cjk.length; i++) {
      grams.push(cjk.slice(i, i + n));
    }
  }
  return grams;
}

function tokenize(text) {
  const norm = normalize(text);
  const spaceTokens = norm.split(" ").filter((t) => t.length >= 2);
  const cjkTokens = extractCjkNgrams(norm, 2, 3);
  return Array.from(new Set([...spaceTokens, ...cjkTokens]));
}

function buildHaystack(p) {
  return normalize(
    [p.englishTitle, p.chineseTitle, p.brand, p.cleanTitle, p.size, p.category]
      .filter(Boolean)
      .join(" ")
  );
}

function scoreTextMatch(queryTokens, hayTokens, p) {
  // 1. Full-haystack coverage (includes brand, category, size)
  const haySet = new Set(hayTokens);
  let hit = 0;
  for (const t of queryTokens) if (haySet.has(t)) hit++;
  const haystackScore = queryTokens.length ? hit / queryTokens.length : 0;

  // 2. Title-only coverage — product name must match (high signal)
  const titleTokens = tokenize(
    normalize([p.englishTitle, p.chineseTitle].filter(Boolean).join(" "))
  );
  const titleSet = new Set(titleTokens);
  let titleHit = 0;
  for (const t of queryTokens) if (titleSet.has(t)) titleHit++;
  const titleScore = queryTokens.length ? titleHit / queryTokens.length : 0;

  // 3. Bidirectional: how much of the product title is covered by the query
  //    Low coverage = different product type → should score lower
  const querySet = new Set(queryTokens);
  let productHit = 0;
  for (const t of titleTokens) if (querySet.has(t)) productHit++;
  const productCoverage = titleTokens.length ? productHit / titleTokens.length : 0;

  // Weighted blend: title match is primary signal
  let score = 0.55 * titleScore + 0.25 * haystackScore + 0.20 * productCoverage;

  if (p.brand && queryTokens.includes(normalize(p.brand))) score += 0.07;
  if (p.size && queryTokens.includes(normalize(p.size))) score += 0.05;

  return Math.min(score, 1);
}

/**
 * Build search token array from parsed vision data.
 * Exported so batchIngestToDB can store tokens at ingest time.
 */
export function buildSearchTokens(parsed) {
  return tokenize(buildHaystack(parsed));
}

/**
 * Build canonical match keys for O(1) exact lookup via Firestore array-contains.
 * Written by all three save paths (bulk upload, single confirm, editor lock).
 */
export function buildMatchKeys(en, zh, size) {
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

/* ---------- Embedding cache ---------- */
const GEMINI_EMBED_MODEL = "gemini-embedding-2";

let _embeddingCache = null;
let _embeddingCacheLoad = null;

export function invalidateEmbeddingCache() {
  _embeddingCache = null;
  _embeddingCacheLoad = null;
}

const EMBEDDING_CACHE_TIMEOUT_MS = 45_000;
const EMBED_SELECT_FIELDS = [
  "id",
  "englishTitle",
  "chineseTitle",
  "brand",
  "size",
  "category",
  "publicUrl",
  "embedding",
  "pHash",
];

async function fetchEmbeddingsForIds(ids) {
  const unique = [...new Set([...ids].filter(Boolean))];
  if (!unique.length) return [];
  const coll = db.collection(FIRESTORE_COLLECTION);
  const rows = [];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const snaps = await firestoreRead(
      "fetchEmbeddingsForIds",
      () => db.getAll(...chunk.map((id) => coll.doc(id))),
      12_000,
      _onFirestoreTimeout
    );
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const d = snap.data();
      if (d.status !== "active" || d.embeddingModel !== GEMINI_EMBED_MODEL || !Array.isArray(d.embedding)) {
        continue;
      }
      rows.push({
        id: snap.id,
        englishTitle: d.englishTitle,
        chineseTitle: d.chineseTitle,
        brand: d.brand,
        size: d.size,
        category: d.category,
        publicUrl: d.publicUrl,
        embedding: d.embedding,
      });
    }
  }
  return rows;
}

async function getEmbeddingCache() {
  if (_embeddingCache) return _embeddingCache;
  if (!_embeddingCacheLoad) {
    // #region agent log
    const cacheT0 = Date.now();
    debugIngest({
        location: "searchService.js:getEmbeddingCache",
        message: "embedding cache load start",
        data: { firestoreInFlight: debugFirestoreInFlight },
        hypothesisId: "C",
        });
    // #endregion
    _embeddingCacheLoad = firestoreRead(
      "getEmbeddingCache",
      () =>
        db
          .collection(FIRESTORE_COLLECTION)
          .where("status", "==", "active")
          .where("embeddingModel", "==", GEMINI_EMBED_MODEL)
          .select(...EMBED_SELECT_FIELDS)
          .get(),
      EMBEDDING_CACHE_TIMEOUT_MS,
      () => {
        _embeddingCacheLoad = null;
      }
    )
      .then((snapshot) => {
        _embeddingCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        _embeddingCacheLoad = null;
        // #region agent log
        debugIngest({
            location: "searchService.js:getEmbeddingCache",
            message: "embedding cache load ok",
            data: { docCount: snapshot.size, ms: Date.now() - cacheT0 },
            hypothesisId: "C",
            });
        // #endregion
        return _embeddingCache;
      })
      .catch((err) => {
        _embeddingCacheLoad = null;
        // #region agent log
        debugIngest({
            location: "searchService.js:getEmbeddingCache",
            message: "embedding cache load fail",
            data: { ms: Date.now() - cacheT0, err: String(err?.message || err).slice(0, 120) },
            hypothesisId: "C",
            });
        // #endregion
        throw err;
      });
  }
  return _embeddingCacheLoad;
}

/**
 * Search product_vectors by title/text. Returns up to `limit` products with publicUrl for UI.
 * Uses array-contains-any index query — reads only matching docs, not all N.
 * @param {string} query - Product title or search text
 * @param {number} limit - Max results (default 6 for Replace UI)
 * @param {number} minScore - Minimum text match score (0–1)
 * @returns {Promise<Array<{ id, englishTitle, chineseTitle, brand, size, category, publicUrl, score }>>}
 */
export async function searchByText(query, limit = 6, minScore = 0.15) {
  if (!query || !String(query).trim()) return [];

  const queryTokens = tokenize(String(query).trim());
  if (!queryTokens.length) return [];

  const QUERY_TIMEOUT_MS = 12_000;
  const scanCap = getResourceProfile().discountFirestoreScanCap;
  const snapshot = await firestoreRead(
    "searchByText",
    () =>
      db
        .collection(FIRESTORE_COLLECTION)
        .where("searchTokens", "array-contains-any", queryTokens.slice(0, 10))
        .limit(scanCap)
        .get(),
    QUERY_TIMEOUT_MS,
    _onFirestoreTimeout
  ).then((r) => {
    _onFirestoreOk();
    return r;
  });

  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.status === "active")
    .map((p) => {
      const hayTokens = tokenize(buildHaystack(p));
      const score = scoreTextMatch(queryTokens, hayTokens, p);
      return { ...p, score };
    })
    .filter((p) => p.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(pickPublicFields);
}

/**
 * Semantic search using Gemini text-embedding vectors.
 * Only searches products tagged with embeddingModel === GEMINI_EMBED_MODEL.
 * @param {Set<string>|null} candidateIds - When set, scores only those ids (avoids O(catalog) work per query).
 */
export async function searchByTextEmbedding(query, limit = 6, minScore = 0.3, candidateIds = null) {
  if (!query || !String(query).trim()) return [];

  const queryEmbedding = await embedText(String(query).trim());
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return [];

  const forceFull =
    process.env.UFM_EMBED_FORCE_FULL_SCAN === "1" || process.env.UFM_EMBED_FORCE_FULL_SCAN === "true";
  const rows =
    candidateIds && candidateIds.size > 0 && !forceFull
      ? await fetchEmbeddingsForIds(candidateIds)
      : await getEmbeddingCache();
  if (!rows.length) return [];

  const queryUnit = normalizeL2(queryEmbedding);
  if (!queryUnit) return [];

  return rows
    .map((p) => ({
      ...p,
      score:
        Array.isArray(p.embedding) && p.embedding.length === queryEmbedding.length
          ? cosineUnitToRaw(queryUnit, p.embedding)
          : 0,
    }))
    .filter((p) => p.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(pickPublicFields);
}

/* ---------- Multi-query helpers ---------- */

function mergeByBestScore(results, limit) {
  const map = new Map();
  for (const r of results) {
    if (!map.has(r.id) || r.score > map.get(r.id).score) map.set(r.id, r);
  }
  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function hybridMerge(embedResults, textResults, limit) {
  const map = new Map();
  for (const r of embedResults) map.set(r.id, { ...r, _embedScore: r.score, _textScore: 0 });
  for (const r of textResults) {
    if (map.has(r.id)) {
      map.get(r.id)._textScore = r.score;
    } else {
      map.set(r.id, { ...r, _embedScore: 0, _textScore: r.score });
    }
  }
  for (const [, v] of map) {
    v.score = Number((0.55 * v._embedScore + 0.45 * v._textScore).toFixed(4));
  }
  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Best-effort search for discount item → DB products.
 * Runs multi-query text search (en / zh / combined) and Gemini semantic embedding,
 * then merges results with hybrid scoring. Embedding similarity is restricted to a
 * text-search candidate pool by default (resource profile `embedTextCandidateCap`) to avoid
 * O(catalog × rows) CPU during bulk .xlsx runs.
 * @param {{ skipSemanticEmbed?: boolean }} [options] - When skipSemanticEmbed, skips Gemini embed entirely (text + exact path only).
 */
export async function searchForDiscountItem(item, limit = 6, options = {}) {
  // Skip DB entirely when the gRPC channel is known stale
  if (_circuitOpen()) {
    console.log("[searchService] Firestore circuit open — skipping DB lookup");
    return [];
  }

  const skipSemanticEmbed = options.skipSemanticEmbed === true;
  const enQuery   = (item?.en   || "").trim();
  const zhQuery   = (item?.zh   || "").trim();
  const fullQuery = [item?.en, item?.zh, item?.size].filter(Boolean).map(String).map((s) => s.trim()).join(" ").trim();

  if (!fullQuery && !enQuery && !zhQuery) return [];

  // Fast-path: exact match against saved flyer_editor combinations via matchKeys index.
  // Capped at 4 s — previously had no timeout, causing 300 s background promise leaks.
  const FAST_PATH_TIMEOUT_MS = 4_000;
  try {
    const exactKey = normalize(enQuery) || normalize(zhQuery);
    if (exactKey) {
      const snap = await firestoreRead(
        "fastPathMatchKeys",
        () =>
          db
            .collection(FIRESTORE_COLLECTION)
            .where("matchKeys", "array-contains", exactKey)
            .limit(3)
            .get(),
        FAST_PATH_TIMEOUT_MS,
        _onFirestoreTimeout
      ).then((r) => {
        _onFirestoreOk();
        return r;
      });
      const hits = snap.docs
        .map(d => ({ ...d.data(), id: d.id }))
        .filter(d => d.status === "active");
      if (hits.length > 0) {
        console.log(`[searchService] Fast-path exact match (${hits.length}): "${exactKey}"`);
        return hits.map(p => ({ ...pickPublicFields(p), score: 0.98 }));
      }
    }
  } catch (err) {
    console.warn("[searchService] Fast-path matchKeys query failed:", err?.message?.slice(0, 80));
  }

  const queries = [...new Set([fullQuery, enQuery, zhQuery].filter(Boolean))];
  const profile = getResourceProfile();
  const textResultSets = [];
  for (const q of queries) {
    textResultSets.push(await searchByText(q, limit * 2, 0.15).catch(() => []));
  }
  const textFlat = textResultSets.flat();
  const textMerged = mergeByBestScore(textFlat, limit * 2);

  let embedResults = [];
  if (!skipSemanticEmbed) {
    try {
      const embedPool = mergeByBestScore(textFlat, profile.embedTextCandidateCap);
      const candidateIds = new Set(embedPool.map((r) => r.id));
      const forceFull =
        process.env.UFM_EMBED_FORCE_FULL_SCAN === "1" || process.env.UFM_EMBED_FORCE_FULL_SCAN === "true";
      const narrowIds = candidateIds.size > 0 && !forceFull ? candidateIds : null;
      embedResults = await searchByTextEmbedding(fullQuery || enQuery, limit * 2, 0.25, narrowIds);
    } catch {
      /* text search covers it */
    }
  }

  const finalResults = hybridMerge(embedResults, textMerged, limit);
  if (finalResults.length > 0) return finalResults;

  // Nothing passed the score threshold — return the single closest text match regardless.
  // JobProcessor sets lowConfidence based on the score.
  return searchByText(fullQuery || enQuery, 1, 0);
}

/* ---------- Image search ---------- */

/**
 * Two-track image-to-image search:
 *   Track 1 — pHash: perceptual hash comparison against all cached products (local, free)
 *   Track 2 — Semantic: Gemini vision extracts a product title → hybrid text+embedding search
 * pHash hits (exact/near-duplicate visuals) appear first; semantic hits fill the rest.
 */
export async function searchByImage(imagePath, limit = 6) {
  const [hashResult, embeddingResult] = await Promise.allSettled([
    computePHash(imagePath),
    getImageEmbedding(imagePath),
  ]);

  const byId = new Map();

  // Track 1: pHash — fast local comparison against cached products
  if (hashResult.status === "fulfilled") {
    const qHash = hashResult.value;
    const cache = await getEmbeddingCache();
    for (const doc of cache) {
      if (doc.pHash && hammingDistance(qHash, doc.pHash) <= 15) {
        byId.set(doc.id, { ...pickPublicFields(doc), score: 1.0 });
      }
    }
  }

  // Track 2: Gemini vision title → existing hybrid text+embedding search
  const parsed = embeddingResult.status === "fulfilled" ? embeddingResult.value?.parsed : null;
  const title = parsed?.englishTitle || parsed?.cleanTitle || "";
  if (title) {
    const hits = await searchForDiscountItem({ en: title }, limit);
    for (const hit of hits) {
      if (!byId.has(hit.id)) byId.set(hit.id, hit);
    }
  }

  return [...byId.values()].slice(0, limit);
}

/* ---------- Product update ---------- */

/**
 * Update the English title of a product in Firestore and invalidate the embedding cache.
 * @param {string} id - Firestore document ID
 * @param {string} englishTitle - New product name
 */
export async function updateProductTitle(id, englishTitle) {
  const title = String(englishTitle || "").trim();
  if (!id || !title) throw new Error("id and englishTitle are required");
  await db.collection(FIRESTORE_COLLECTION).doc(id).update({
    englishTitle: title,
    updatedAt: Date.now(),
  });
  invalidateEmbeddingCache();
}
