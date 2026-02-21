/**
 * Daily usage tracker — keeps the app under free-tier limits for:
 *   Firestore (Blaze free, resets midnight Pacific):
 *     Reads:   50,000 / day
 *     Writes:  20,000 / day
 *     Deletes: 20,000 / day
 *   Gemini API (free tier, resets midnight Pacific):
 *     Requests: 1,500 / day  (Gemini 2.0 Flash RPD)
 *   Firebase Storage (Blaze free, not daily — total stored):
 *     Bytes uploaded today tracked as an informational metric.
 *     Hard limit set at 200 MB/day to stay well below 5 GB total.
 *
 * Warn at 90%, hard-stop at 98% for Firestore + Gemini.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { fetchFirestoreUsageToday, fetchStorageTotalBytes } from "../ingestion/cloudMonitoring.js";

const QUOTA_FILE = path.join(os.homedir(), ".ufm-quota.json");

export const FREE_LIMITS = {
  reads:              50_000,
  writes:             20_000,
  deletes:            20_000,
  geminiRequests:      1_500,              // Gemini 2.0 Flash RPD
  storageUploadBytes: 200 * 1024 * 1024,  // 200 MB/day soft cap (local tracking)
  storageTotalBytes:  5 * 1024 * 1024 * 1024, // 5 GB Firebase Storage free tier (live)
};

const WARN_PCT  = 0.90;
const BLOCK_PCT = 0.98;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC
}

function loadQuota() {
  try {
    const raw = fs.readFileSync(QUOTA_FILE, "utf8");
    const data = JSON.parse(raw);
    if (data.day === todayKey()) return data;
  } catch {
    // file missing or corrupt — start fresh
  }
  return {
    day: todayKey(),
    reads: 0,
    writes: 0,
    deletes: 0,
    geminiRequests: 0,
    storageUploadBytes: 0,
  };
}

function saveQuota(data) {
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.warn("[quotaTracker] Could not save quota file:", err.message);
  }
}

function warnIfNear(key, used) {
  const limit = FREE_LIMITS[key];
  const pct = used / limit;
  if (pct >= WARN_PCT) {
    console.warn(
      `[quotaTracker] ⚠️  ${key}: ${used.toLocaleString()}/${limit.toLocaleString()} (${Math.round(pct * 100)}%)`
    );
  }
}

// ─── Firestore ────────────────────────────────────────────────────────────────

export function trackReads(n = 1) {
  const data = loadQuota();
  data.reads += n;
  saveQuota(data);
  warnIfNear("reads", data.reads);
  return data.reads;
}

export function trackWrites(n = 1) {
  const data = loadQuota();
  data.writes += n;
  saveQuota(data);
  warnIfNear("writes", data.writes);
  return data.writes;
}

export function trackDeletes(n = 1) {
  const data = loadQuota();
  data.deletes += n;
  saveQuota(data);
  return data.deletes;
}

export function assertCanRead(n = 1) {
  const data = loadQuota();
  if (data.reads + n >= FREE_LIMITS.reads * BLOCK_PCT) {
    throw new Error(
      `Daily Firestore read quota nearly exhausted (${data.reads}/${FREE_LIMITS.reads}). ` +
      `Stopping to avoid charges. Resets midnight UTC.`
    );
  }
}

export function assertCanWrite(n = 1) {
  const data = loadQuota();
  if (data.writes + n >= FREE_LIMITS.writes * BLOCK_PCT) {
    throw new Error(
      `Daily Firestore write quota nearly exhausted (${data.writes}/${FREE_LIMITS.writes}). ` +
      `Stopping to avoid charges. Resets midnight UTC.`
    );
  }
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

/** Call after each successful Gemini API request. */
export function trackGeminiRequest() {
  const data = loadQuota();
  data.geminiRequests = (data.geminiRequests || 0) + 1;
  saveQuota(data);
  warnIfNear("geminiRequests", data.geminiRequests);
  return data.geminiRequests;
}

export function assertCanCallGemini() {
  const data = loadQuota();
  const used = data.geminiRequests || 0;
  if (used + 1 >= FREE_LIMITS.geminiRequests * BLOCK_PCT) {
    throw new Error(
      `Daily Gemini request quota nearly exhausted (${used}/${FREE_LIMITS.geminiRequests}). ` +
      `Stopping to avoid charges. Resets midnight UTC.`
    );
  }
}

// ─── Firebase Storage ─────────────────────────────────────────────────────────

/** Call with the file size in bytes before/after each Storage upload. */
export function trackStorageUpload(bytes = 0) {
  const data = loadQuota();
  data.storageUploadBytes = (data.storageUploadBytes || 0) + bytes;
  saveQuota(data);
  warnIfNear("storageUploadBytes", data.storageUploadBytes);
  return data.storageUploadBytes;
}

// ─── Status snapshot ──────────────────────────────────────────────────────────

function makeEntry(data, key) {
  const used  = data[key] || 0;
  const limit = FREE_LIMITS[key];
  const pct   = Math.min(100, Math.round((used / limit) * 100));
  return {
    used,
    limit,
    pct,
    nearLimit: used / limit >= WARN_PCT,
    atLimit:   used / limit >= BLOCK_PCT,
  };
}

export function getQuotaStatus() {
  const data = loadQuota();
  return {
    day:               data.day,
    reads:             makeEntry(data, "reads"),
    writes:            makeEntry(data, "writes"),
    deletes:           makeEntry(data, "deletes"),
    geminiRequests:    makeEntry(data, "geminiRequests"),
    storageTotalBytes: makeEntry(data, "storageUploadBytes"),
  };
}

// ─── Live quota status (Cloud Monitoring API) ─────────────────────────────────

function makeEntryLive(used, key, source) {
  const limit = FREE_LIMITS[key];
  const pct   = Math.min(100, Math.round((used / limit) * 100));
  return {
    used,
    limit,
    pct,
    nearLimit: used / limit >= WARN_PCT,
    atLimit:   used / limit >= BLOCK_PCT,
    source,
  };
}

/**
 * Fetches live usage from Google Cloud Monitoring API, falling back to the
 * local file for any metric that fails (403, network timeout, etc.).
 *
 * @param {string} projectId   - GCP project ID (from service account JSON)
 * @param {string} bucketName  - Firebase Storage bucket name
 * @param {string} credPath    - Absolute path to the service account JSON
 * @returns {Promise<object>}  - Same shape as getQuotaStatus(), with `source` on each entry
 */
export async function getLiveQuotaStatus(projectId, bucketName, credPath) {
  const localData = loadQuota();

  const [firestoreResult, storageResult] = await Promise.allSettled([
    fetchFirestoreUsageToday(projectId, credPath),
    fetchStorageTotalBytes(projectId, bucketName, credPath),
  ]);

  // Firestore reads + writes
  let reads, writes, firestoreSource;
  if (firestoreResult.status === "fulfilled") {
    reads          = firestoreResult.value.reads;
    writes         = firestoreResult.value.writes;
    firestoreSource = "live";
  } else {
    const msg = firestoreResult.reason?.message || String(firestoreResult.reason);
    console.warn("[quotaTracker] Firestore live fetch failed — using local estimates:", msg);
    reads          = localData.reads  || 0;
    writes         = localData.writes || 0;
    firestoreSource = "local";
  }

  // Storage total bytes
  let storageTotalBytes, storageSource;
  if (storageResult.status === "fulfilled") {
    storageTotalBytes = storageResult.value;
    storageSource     = "live";
  } else {
    const msg = storageResult.reason?.message || String(storageResult.reason);
    console.warn("[quotaTracker] Storage live fetch failed — using local estimates:", msg);
    storageTotalBytes = localData.storageUploadBytes || 0;
    storageSource     = "local";
  }

  return {
    day:               localData.day,
    reads:             makeEntryLive(reads,          "reads",             firestoreSource),
    writes:            makeEntryLive(writes,         "writes",            firestoreSource),
    deletes:           { ...makeEntry(localData, "deletes"),        source: "local" },
    geminiRequests:    { ...makeEntry(localData, "geminiRequests"), source: "local" },
    storageTotalBytes: makeEntryLive(storageTotalBytes, "storageTotalBytes", storageSource),
  };
}
