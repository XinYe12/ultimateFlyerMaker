// apps/desktop/src/main/resourceProfile.js
// Presets for office / low-resource PCs. Explicit UFM_* env vars override preset defaults.

import os from "os";

const DEFAULT_DISCOUNT_SEARCH_TIMEOUT_MS = 22_000;

const PRESETS = {
  normal: {
    batchDelayMs: 0,
    bulkXlsxRowThreshold: 40,
    discountSearchTimeoutMs: 10_000,
    discountRowDelayMs: 0,
    /** Max Firestore docs read per discount text query (caps RAM + CPU scoring). */
    discountFirestoreScanCap: 140,
    /** Pause after each Serper URL attempt (rembg cooldown). 0 = off. */
    serperStepDelayMs: 0,
    /** HTTP POST /cutout client timeout (ms); must cover slow rembg on large images. */
    cutoutFetchTimeoutMs: 120_000,
    embedTextCandidateCap: 150,
    serializeDiscountTextSearch: false,
    pythonSingleThread: false,
    /** Pause batch when main-process RSS exceeds this MB. 0 = off. */
    batchPauseIfRssMb: 0,
    /** Max pHash docs loaded from Firestore for dedup. 0 = no cap (load all). */
    pHashDedupMaxDocs: 0,
    /** rembg background-removal model passed to the Python backend. */
    rembgModel: "birefnet-general",
    /** Max image edge (px) before sending to rembg. 0 = no cap. */
    cutoutMaxEdgePx: 1024,
  },
  office: {
    batchDelayMs: 400,
    bulkXlsxRowThreshold: 28,
    discountSearchTimeoutMs: 10_000,
    discountRowDelayMs: 50,
    discountFirestoreScanCap: 100,
    serperStepDelayMs: 350,
    cutoutFetchTimeoutMs: 120_000,
    embedTextCandidateCap: 80,
    serializeDiscountTextSearch: true,
    pythonSingleThread: true,
    batchPauseIfRssMb: 1800,
    pHashDedupMaxDocs: 3000,
    rembgModel: "u2net",
    cutoutMaxEdgePx: 1024,
  },
  low: {
    batchDelayMs: 1200,
    bulkXlsxRowThreshold: 20,
    discountSearchTimeoutMs: 10_000,
    discountRowDelayMs: 150,
    discountFirestoreScanCap: 80,
    serperStepDelayMs: 700,
    cutoutFetchTimeoutMs: 120_000,
    embedTextCandidateCap: 55,
    serializeDiscountTextSearch: true,
    pythonSingleThread: true,
    batchPauseIfRssMb: 1200,
    pHashDedupMaxDocs: 2000,
    rembgModel: "u2net",
    cutoutMaxEdgePx: 800,
  },
};

function normalizeProfileName(raw) {
  const p = String(raw || "").trim().toLowerCase();
  if (PRESETS[p]) return p;
  // Auto-downgrade on machines with ≤12 GB RAM when no profile is explicitly set.
  if (!p) {
    const totalGb = os.totalmem() / (1024 ** 3);
    if (totalGb <= 12) {
      console.log(
        `[ufm] auto-selected 'office' profile (total RAM: ${totalGb.toFixed(1)} GB ≤ 12 GB; ` +
        `set UFM_RESOURCE_PROFILE=normal to override)`
      );
      return "office";
    }
  }
  return "normal";
}

function readIntEnv(name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const v = parseInt(String(raw), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function readBoolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "1" || /^true$/i.test(raw)) return true;
  if (raw === "0" || /^false$/i.test(raw)) return false;
  return fallback;
}

let _cache = null;

/**
 * Resolved resource-tuning values for the main process.
 * Call after loadEnv / dotenv. Cached for the lifetime of the process.
 */
export function getResourceProfile() {
  if (_cache) return _cache;

  const name = normalizeProfileName(process.env.UFM_RESOURCE_PROFILE);
  const preset = PRESETS[name];

  _cache = Object.freeze({
    name,
    batchDelayMs: readIntEnv("UFM_BATCH_DELAY_MS", preset.batchDelayMs, { min: 0 }),
    bulkXlsxRowThreshold: readIntEnv("UFM_BULK_XLSX_ROW_THRESHOLD", preset.bulkXlsxRowThreshold, { min: 1 }),
    discountSearchTimeoutMs: (() => {
      const raw = process.env.UFM_DISCOUNT_SEARCH_TIMEOUT_MS;
      if (raw !== undefined && raw !== "") {
        const v = parseInt(String(raw), 10);
        return Number.isFinite(v) && v >= 5000 ? v : preset.discountSearchTimeoutMs;
      }
      return preset.discountSearchTimeoutMs;
    })(),
    discountRowDelayMs: readIntEnv("UFM_DISCOUNT_ROW_DELAY_MS", preset.discountRowDelayMs, { min: 0 }),
    discountFirestoreScanCap: readIntEnv(
      "UFM_DISCOUNT_FIRESTORE_SCAN_CAP",
      preset.discountFirestoreScanCap,
      { min: 30, max: 400 }
    ),
    serperStepDelayMs: readIntEnv("UFM_SERPER_STEP_DELAY_MS", preset.serperStepDelayMs, { min: 0, max: 5000 }),
    cutoutFetchTimeoutMs: readIntEnv("UFM_CUTOUT_FETCH_TIMEOUT_MS", preset.cutoutFetchTimeoutMs, {
      min: 15_000,
      max: 300_000,
    }),
    embedTextCandidateCap: readIntEnv("UFM_EMBED_TEXT_CANDIDATE_CAP", preset.embedTextCandidateCap, {
      min: 40,
      max: 250,
    }),
    serializeDiscountTextSearch: readBoolEnv("UFM_SERIALIZE_DISCOUNT_TEXT_SEARCH", preset.serializeDiscountTextSearch),
    pythonSingleThread: readBoolEnv("UFM_PYTHON_SINGLE_THREAD", preset.pythonSingleThread),
    batchPauseIfRssMb: readIntEnv("UFM_BATCH_PAUSE_RSS_MB", preset.batchPauseIfRssMb, { min: 0 }),
    pHashDedupMaxDocs: readIntEnv("UFM_PHASH_DEDUP_MAX_DOCS", preset.pHashDedupMaxDocs, { min: 0 }),
    rembgModel: process.env.UFM_REMBG_MODEL || preset.rembgModel,
    cutoutMaxEdgePx: readIntEnv("UFM_CUTOUT_MAX_EDGE_PX", preset.cutoutMaxEdgePx, { min: 0, max: 4096 }),
  });

  console.log(
    `[ufm] resource profile: ${_cache.name} (batchDelayMs=${_cache.batchDelayMs}, bulkXlsx≥${_cache.bulkXlsxRowThreshold}→lite, ` +
      `fsScanCap=${_cache.discountFirestoreScanCap}, serperStepDelay=${_cache.serperStepDelayMs}ms, ` +
      `cutoutHttpTimeout=${_cache.cutoutFetchTimeoutMs}ms, embedCap=${_cache.embedTextCandidateCap}, ` +
      `pythonSingleThread=${_cache.pythonSingleThread}, rssLimit=${_cache.batchPauseIfRssMb}MB, ` +
      `pHashDedupCap=${_cache.pHashDedupMaxDocs || "unlimited"}, rembgModel=${_cache.rembgModel}, cutoutMaxEdge=${_cache.cutoutMaxEdgePx}px)`
  );
  return _cache;
}

export function getDiscountSearchTimeoutMs() {
  return getResourceProfile().discountSearchTimeoutMs;
}

/** Merge into Python / packaged backend spawn env to cap BLAS-style thread explosion. */
export function getPythonThreadLimitEnv() {
  if (!getResourceProfile().pythonSingleThread) return {};
  return {
    OMP_NUM_THREADS: "1",
    MKL_NUM_THREADS: "1",
    OPENBLAS_NUM_THREADS: "1",
    NUMEXPR_NUM_THREADS: "1",
    VECLIB_MAXIMUM_THREADS: "1",
    ORT_NUM_THREADS: "1",  // ONNX Runtime's own pool — Windows ignores OMP_NUM_THREADS
  };
}

/** Merge into Python spawn env to select the rembg model and image cap for the current profile. */
export function getPythonModelEnv() {
  const rp = getResourceProfile();
  return {
    UFM_REMBG_MODEL: rp.rembgModel,
    UFM_CUTOUT_MAX_EDGE_PX: String(rp.cutoutMaxEdgePx),
  };
}
