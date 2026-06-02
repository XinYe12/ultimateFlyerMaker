// apps/desktop/src/main/jobs/JobProcessor.js
// Sequential job processor with progress events

import { EventEmitter } from "events";
import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { ingestPhoto } from "../ingestion/ingestPhoto.js";
import { parseDiscountText } from "../ipc/parseDiscountText.js";
import { parseDiscountXlsx } from "../ipc/parseDiscountXlsx.js";
import { exportDiscountImages } from "../ipc/exportDiscountImages.js";
import { serperImageSearch, serperKeysPresent } from "../ingestion/serperImageSearchService.js";
import { buildSerperQuery } from "../ingestion/buildSerperQuery.js";
import { rerankSerperResults } from "../ingestion/serperScorer.js";
import { recordSerperSignal } from "../ingestion/serperSignalService.js";
import { getDomain } from "../ingestion/braveSearchService.js";
import { runCutout, waitForCutoutReady } from "../cutoutClient.js";
import { addShadowToCutout } from "../ingestion/addShadow.js";
import sizeOf from "image-size";
import sharp from "sharp";
import { decideSizeFromAspectRatio } from "../../../../shared/flyer/layout/sizeFromImage.js";
import { getResourceProfile, getDiscountSearchTimeoutMs } from "../resourceProfile.js";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.google.com/",
};

// Session-level blocklist: domains confirmed to reject all connections.
// Automatically populated on first connection failure — no manual maintenance needed.
const blockedDomains = new Set();

/** Never skip or auto-block these hosts — they carry our own DB/product images (Firebase/GCS). */
function isTrustedProductImageHost(hostname) {
  return (
    hostname === "firebasestorage.googleapis.com" ||
    hostname === "storage.googleapis.com" ||
    hostname.endsWith(".firebasestorage.app")
  );
}

function isBlockedUrl(url) {
  try {
    const { hostname } = new URL(url);
    if (isTrustedProductImageHost(hostname)) return false;
    return [...blockedDomains].some(d => hostname === d || hostname.endsWith("." + d));
  } catch { return false; }
}

function blockDomain(url) {
  try {
    const { hostname } = new URL(url);
    if (isTrustedProductImageHost(hostname)) return;
    if (!blockedDomains.has(hostname)) {
      blockedDomains.add(hostname);
      console.warn(`[fetchImage] Added to session blocklist: ${hostname}`);
    }
  } catch { /* ignore */ }
}

/**
 * Download image from url to destPath.
 * Skips known-blocked domains immediately.
 * On connection failure (not HTTP error), adds the domain to the session blocklist
 * so future URLs from the same host are skipped without waiting for a timeout.
 */
async function fetchImageToFile(url, destPath) {
  if (isBlockedUrl(url)) throw new Error(`Skipped blocked domain: ${new URL(url).hostname}`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: BROWSER_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    await fs.promises.writeFile(destPath, Buffer.from(ab));
  } catch (fetchErr) {
    const isConnectionError = fetchErr.message === "fetch failed" || fetchErr.name === "TimeoutError";
    if (isConnectionError) {
      blockDomain(url);
      throw new Error(`Connection blocked for ${new URL(url).hostname}`);
    }
    throw fetchErr;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Same EXPORT_ROOT as cutoutClient.js
// cutoutClient is at apps/desktop/src/main/cutoutClient.js and uses path.resolve(__dirname, "../../../exports/cutouts")
// which resolves to apps/exports/cutouts. We are in apps/desktop/src/main/jobs/ so need ../../../../
const EXPORT_ROOT = path.resolve(__dirname, "../../../../exports/cutouts");

function sleep(ms) {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

function roundMs(ms) {
  return Math.round(Number(ms) || 0);
}

function formatMetric(n) {
  return Number.isFinite(n) ? n.toFixed(3) : "n/a";
}

async function inspectSerperSourceImage(imagePath, sr) {
  let meta;
  try {
    meta = await sharp(imagePath).metadata();
  } catch {
    return { ok: true, reason: null, metrics: {} };
  }

  const width = meta.width || 0;
  const height = meta.height || 0;
  if (width < 120 || height < 120) {
    return { ok: false, reason: "source-too-small", metrics: { width, height } };
  }

  const aspect = width && height ? width / height : 1;
  if (aspect > 4.5 || aspect < 0.22) {
    return { ok: false, reason: "source-extreme-aspect", metrics: { width, height, aspect } };
  }

  let sample;
  let info;
  try {
    const out = await sharp(imagePath)
      .resize({ width: 96, height: 96, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    sample = out.data;
    info = out.info;
  } catch {
    return { ok: true, reason: null, metrics: { width, height, aspect } };
  }

  const sw = info.width;
  const sh = info.height;
  const channels = info.channels || 3;
  const borderPx = Math.max(2, Math.round(Math.min(sw, sh) * 0.08));
  let borderCount = 0;
  let borderWhite = 0;
  let edgeCount = 0;
  let edgeTotal = 0;

  function lumAt(x, y) {
    const i = (y * sw + x) * channels;
    return sample[i] * 0.299 + sample[i + 1] * 0.587 + sample[i + 2] * 0.114;
  }

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * channels;
      const isBorder = y < borderPx || y >= sh - borderPx || x < borderPx || x >= sw - borderPx;
      if (isBorder) {
        borderCount++;
        if (sample[i] > 235 && sample[i + 1] > 235 && sample[i + 2] > 235) borderWhite++;
      }
      if (x > 0 && y > 0) {
        const l = lumAt(x, y);
        const grad = Math.abs(l - lumAt(x - 1, y)) + Math.abs(l - lumAt(x, y - 1));
        edgeTotal++;
        if (grad > 55) edgeCount++;
      }
    }
  }

  const borderWhiteFraction = borderCount ? borderWhite / borderCount : 0;
  const edgeDensity = edgeTotal ? edgeCount / edgeTotal : 0;
  const text = `${sr?.title || ""} ${sr?.source || ""} ${sr?.url || ""}`.toLowerCase();
  const shelfKeyword = /\b(shelf|shelves|aisle|display|rack|warehouse|inventory|storefront|store photo|retail)\b/.test(text);
  const metrics = { width, height, aspect, borderWhiteFraction, edgeDensity };

  if (shelfKeyword && edgeDensity > 0.20 && borderWhiteFraction < 0.55) {
    return { ok: false, reason: "source-shelf-photo", metrics };
  }
  if (edgeDensity > 0.34 && borderWhiteFraction < 0.20 && aspect > 1.5) {
    return { ok: false, reason: "source-busy-scene", metrics };
  }
  if (edgeDensity > 0.42 && borderWhiteFraction < 0.08) {
    return { ok: false, reason: "source-busy-background", metrics };
  }

  return { ok: true, reason: null, metrics };
}

function getCutoutFallbackModel(primaryModel) {
  const explicit = String(process.env.UFM_CUTOUT_FALLBACK_MODEL || "").trim();
  const disabled = explicit === "0" || /^none$/i.test(explicit);
  if (disabled) return null;
  if (explicit && explicit !== primaryModel) return explicit;

  const current = primaryModel || getResourceProfile().rembgModel || "u2net";
  if (current === "u2net" || current === "briaai-rmbg" || current === "bria" || current === "briaai-rmbg-1.4") {
    return "isnet-general-use";
  }
  if (current === "isnet-general-use") {
    return "birefnet-general-lite";
  }
  if (current === "birefnet-general-lite") {
    return "birefnet-general";
  }
  return null;
}

/** Mutable per-item pipeline timing (ms) for flyer automation jobs. */
function emptyPipelineSteps() {
  return {
    discountSearchInitialMs: 0,
    dbBuildInitialMs: 0,
    discountSearchTextOnlyMs: 0,
    dbBuildTextOnlyMs: 0,
    serperApiMs: 0,
    serperFetchMs: 0,
    serperRembgMs: 0,
    serperShadowMs: 0,
    serperLastResortMs: 0,
    ingestPhotoMs: 0,
    totalMs: 0,
  };
}

/** rembg + shadow with per-phase accumulation on `ps` (includes time on failure/abort). */
async function runCutoutWithShadowMs(tempPath, signal, ps) {
  const t0 = performance.now();
  let cutoutResult;
  try {
    cutoutResult = await runCutout(tempPath, signal);
    const fallbackModel = cutoutResult.lowConfidence ? getCutoutFallbackModel(cutoutResult.model) : null;
    if (fallbackModel) {
      console.log(
        `[JobProcessor] Cutout low-confidence (${cutoutResult.qualityReason || "unknown"}) — ` +
        `retrying with ${fallbackModel}`
      );
      try {
        const fallbackResult = await runCutout(tempPath, signal, { model: fallbackModel });
        if (!fallbackResult.lowConfidence) {
          cutoutResult = fallbackResult;
        } else {
          console.log(
            `[JobProcessor] Fallback cutout still low-confidence ` +
            `(${fallbackResult.qualityReason || "unknown"}); keeping first result as review fallback`
          );
        }
      } catch (fallbackErr) {
        console.warn(`[JobProcessor] Fallback cutout failed (${fallbackModel}):`, fallbackErr.message);
      }
    }
  } finally {
    ps.serperRembgMs += roundMs(performance.now() - t0);
  }
  const t1 = performance.now();
  try {
    const shadowPath = await addShadowToCutout(cutoutResult.path, {
      lowConfidence: cutoutResult.lowConfidence,
      qualityReason: cutoutResult.qualityReason,
      borderAlpha: cutoutResult.borderAlpha,
      bboxAreaRatio: cutoutResult.bboxAreaRatio,
    });
    return { ...cutoutResult, path: shadowPath };
  } finally {
    ps.serperShadowMs += roundMs(performance.now() - t1);
  }
}

async function ensureExportRoot() {
  await fs.promises.mkdir(EXPORT_ROOT, { recursive: true });
}

/** Download a URL directly into EXPORT_ROOT (no rembg). Returns localPath. */
async function downloadToCutoutsDir(url, suffix) {
  await ensureExportRoot();
  let ext;
  try { ext = path.extname(new URL(url).pathname) || ".png"; } catch { ext = ".png"; }
  const safeExt = /^\.(jpg|jpeg|png|gif|webp)$/i.test(ext) ? ext : ".png";
  const fileName = `ufm-db-${Date.now()}-${suffix}${safeExt}`;
  const localPath = path.join(EXPORT_ROOT, fileName);
  await fetchImageToFile(url, localPath);
  return localPath;
}

/** Get layout size from a cutout image path. */
function getLayoutFromPath(cutoutPath) {
  let layout = { size: "SMALL" };
  try {
    let { width, height } = sizeOf(cutoutPath);
    // Shadow PNGs have 100px padding on each side (addShadow.js PADDING=100).
    // Subtract to recover true product dimensions before computing aspect ratio.
    if (cutoutPath.includes(".shadow.png") && width > 200 && height > 200) {
      width -= 200;
      height -= 200;
    }
    const aspectRatio = typeof width === "number" && typeof height === "number" ? width / height : null;
    layout.size = decideSizeFromAspectRatio(aspectRatio);
  } catch {}
  return layout;
}

/** Build a result object from discount item data (no OCR/LLM). */
function buildResultFromDi(di, cutoutPath, cutoutPaths, matchScore, matchSource, lowConfidence, sourceUrl = null, quality = {}, originalPath = null) {
  const layout = cutoutPath ? getLayoutFromPath(cutoutPath) : { size: "SMALL" };
  const seriesImages = cutoutPaths?.length > 1 && di.isSeries === true;
  return {
    // originalPath is the unprocessed source image used for future cutout reruns.
    // Falls back to cutoutPath for DB images (which are already the un-cutout originals).
    inputPath: originalPath || cutoutPath || null,
    cutoutPath: cutoutPath || null,
    cutoutPaths: seriesImages ? cutoutPaths : undefined,
    allFlavorPaths: seriesImages ? cutoutPaths : undefined,
    pendingFlavorSelection: seriesImages ? true : undefined,
    layout,
    title: { en: di.en || "", zh: di.zh || "", size: di.size || "", confidence: "high", source: "xlsx" },
    aiTitle: { en: di.en || "", zh: di.zh || "", size: di.size || "", confidence: "high", source: "xlsx" },
    ocr: [],
    llmResult: { items: [{ english_name: di.en, chinese_name: di.zh, size: di.size, sale_price: di.salePrice }] },
    matchScore,
    matchSource,
    lowConfidence,
    sourceUrl: sourceUrl || null,
    qualityReason: quality.qualityReason || null,
    cutoutDiagnostics: quality.cutoutDiagnostics || undefined,
  };
}

export class JobProcessor extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.isProcessing = false;
    this.currentJobId = null;
    this.abortedJobs = new Set();
    this._abortResolvers = new Map(); // jobId → resolve fn for mid-item abort
  }

  cancelJob(jobId) {
    this.abortedJobs.add(jobId);
    this._abortResolvers.get(jobId)?.(); // wake any in-flight Promise.race immediately
  }

  enqueue(job) {
    this.queue.push(job);
    this.emit("queued", job.id);
    this.processNext();
  }

  getQueueLength() {
    return this.queue.length;
  }

  isJobQueued(jobId) {
    return this.queue.some(j => j.id === jobId);
  }

  async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const job = this.queue.shift();
    this.currentJobId = job.id;

    try {
      await this.processJob(job);
    } catch (err) {
      console.error(`[JobProcessor] Job ${job.id} failed:`, err);
      this.emit("error", job.id, err);
    } finally {
      this.isProcessing = false;
      this.currentJobId = null;
      this.processNext();
    }
  }

  async processJob(job) {
    const rp = getResourceProfile();
    const totalImages = job.images?.length || 0;
    let discountItems = [];

    // Abort promise — resolves to this sentinel when cancelJob() is called mid-item.
    // Allows Promise.race to break out of ingestPhoto() without waiting for it to finish.
    const _ABORTED = {};
    let _abortResolve;
    const _abortPromise = new Promise(res => { _abortResolve = () => res(_ABORTED); });
    this._abortResolvers.set(job.id, _abortResolve);

    // 1. Parse discounts if provided
    if (job.discount && job.discount.source) {
      this.emitProgress(job.id, "Parsing discounts...", 0, totalImages);
      console.log("[JobProcessor] Parsing discount:", job.discount.type, "source length:", job.discount.source?.length);

      try {
        if (job.discount.type === "xlsx") {
          if (job.discount.parsedItems?.length > 0) {
            discountItems = job.discount.parsedItems;
            console.log(`[JobProcessor] Using ${discountItems.length} pre-parsed discount items`);
          } else {
            discountItems = await parseDiscountXlsx(null, job.discount.source, job.department);
          }
        } else {
          discountItems = await parseDiscountText(null, job.discount.source);
        }
        if (process.env.UFM_DEBUG_DISCOUNTS === "1" && discountItems.length > 0) {
          console.log(
            `[JobProcessor] Parsed ${discountItems.length} discount items (UFM_DEBUG_DISCOUNTS sample):`,
            discountItems.slice(0, 3)
          );
        } else {
          console.log(`[JobProcessor] Parsed ${discountItems.length} discount items`);
        }
      } catch (err) {
        console.error("[JobProcessor] Discount parsing failed:", err);
        // For xlsx-only jobs, this is fatal — surface the error
        if (totalImages === 0) {
          this.emit("error", job.id, err);
          return;
        }
        // For jobs with images, continue without discounts
      }
    } else {
      console.log("[JobProcessor] No discount info provided for job");
    }

    // 2. Process images sequentially
    const processedImages = [];
    const allDiscountLabels = [];

    // Watchdog: if the job is somehow still running after 10 minutes, force-complete it.
    // This is a last-resort safety net for hangs caused by blocked native code or dead async
    // operations that escape individual item timeouts (e.g. stale gRPC, stuck canvas call).
    let jobCompleted = false;
    const JOB_WATCHDOG_MS = 10 * 60 * 1000;
    const watchdogTimer = setTimeout(() => {
      if (!jobCompleted) {
        jobCompleted = true;
        console.warn(`[JobProcessor] Watchdog fired for job ${job.id} — force-completing with ${processedImages.length} items`);
        this.emit("complete", job.id, { processedImages, discountLabels: allDiscountLabels });
      }
    }, JOB_WATCHDOG_MS);

    // XLSX-only mode: no images provided, search DB for each discount item
    if (totalImages === 0 && discountItems.length > 0) {
      const { searchForDiscountItem } = await import("../ingestion/searchService.js");

      const bulkXlsxLite =
        job.discount?.type === "xlsx" && discountItems.length >= rp.bulkXlsxRowThreshold;
      if (bulkXlsxLite) {
        console.log(
          `[JobProcessor] Bulk xlsx (${discountItems.length} rows, threshold ${rp.bulkXlsxRowThreshold}): ` +
            "skipping Serper/rembg and semantic embed (text + exact DB match only). " +
            "Adjust UFM_BULK_XLSX_ROW_THRESHOLD or use a smaller sheet for full matching."
        );
      }

      // Emit "started" for UI only — do NOT send full discountItems over IPC (large .xlsx can be MBs
      // and breaks or stalls structured clone, leaving the job stuck on "Queued" in the renderer).
      this.emit("started", job.id, { itemCount: discountItems.length });

      for (let i = 0; i < discountItems.length; i++) {
        if (this.abortedJobs.has(job.id)) {
          this.abortedJobs.delete(job.id);
          clearTimeout(watchdogTimer);
          this.emit("aborted", job.id);
          return;
        }

        const di = discountItems[i];
        const queryDisplay = [di.en, di.zh, di.size].filter(Boolean).join(" ");
        const isSeries = di.isSeries === true;
        const limit = isSeries ? Math.min(12, Math.max(2, di.flavorCount || 6)) : 1;

        console.log(`[JobProcessor] Item ${i + 1}/${discountItems.length}: "${queryDisplay}" (isSeries=${isSeries}, limit=${limit})`);
        this.emitProgress(
          job.id,
          isSeries ? `Matching ${limit} products: "${queryDisplay}"...` : `Matching product: "${queryDisplay}"...`,
          i,
          discountItems.length
        );

        const SEARCH_TIMEOUT_MS = getDiscountSearchTimeoutMs();
        // Initial budget covers DB search + early work; Serper/rembg gets a fresh budget when entered.
        const ITEM_TIMEOUT_MS = 90_000;
        const ITEM_SERPER_PHASE_MS = 120_000;

        const runItem = async (signal, armDeadline, serperPhaseMs) => {
          let result = null;
          let lowConfidenceSerperFallback = null;
          const ps = emptyPipelineSteps();
          const itemBegin = performance.now();

          const runSearchWithTimeout = async (searchOpts) => {
            let timeoutId;
            const searchP = searchForDiscountItem(di, limit, searchOpts);
            try {
              return await Promise.race([
                searchP.then((rows) => {
                  clearTimeout(timeoutId);
                  return rows;
                }),
                new Promise((_, reject) => {
                  timeoutId = setTimeout(
                    () => reject(new Error(`TIMEOUT:${SEARCH_TIMEOUT_MS}`)),
                    SEARCH_TIMEOUT_MS
                  );
                }),
              ]);
            } catch (e) {
              clearTimeout(timeoutId);
              throw e;
            }
          };

          const tryBuildDbResult = async (matches) => {
            if (!matches?.length) return null;
            const matchScore = matches[0].score ?? 0;
            const cutoutPaths = [];
            for (let j = 0; j < matches.length; j++) {
              const m = matches[j];
              if (!m?.publicUrl) continue;
              try {
                const localPath = await downloadToCutoutsDir(m.publicUrl, `${i}-${j}`);
                cutoutPaths.push(localPath);
              } catch (err) {
                console.warn(`[JobProcessor] DB image download failed for "${queryDisplay}" j=${j}:`, err.message);
              }
            }
            if (cutoutPaths.length === 0) return null;
            const lowConfidence = matchScore < 0.50;
            return buildResultFromDi(di, cutoutPaths[0], cutoutPaths, matchScore, "db", lowConfidence, matches[0]?.publicUrl ?? null);
          };

          let searchTimedOut = false;
          let matches = [];

          {
            const tSearch = performance.now();
            try {
              matches = await runSearchWithTimeout({ skipSemanticEmbed: bulkXlsxLite });
            } catch (err) {
              const msg = err?.message || String(err);
              if (msg.startsWith("TIMEOUT:")) {
                searchTimedOut = true;
                console.warn(`[JobProcessor] Discount search timed out (${SEARCH_TIMEOUT_MS}ms) for "${queryDisplay}"`);
              } else {
                console.warn(`[JobProcessor] Discount search failed for "${queryDisplay}":`, msg);
              }
            } finally {
              ps.discountSearchInitialMs = roundMs(performance.now() - tSearch);
            }
          }
          if (matches?.length) {
            const tBuild = performance.now();
            try {
              result = await tryBuildDbResult(matches);
            } finally {
              ps.dbBuildInitialMs = roundMs(performance.now() - tBuild);
            }
          }

          if (!result?.cutoutPath && !bulkXlsxLite) {
            // Only retry text-only when the search returned EARLY with no results (true DB miss).
            // If it timed out the network is degraded — a text-only retry hits the same connection and wastes another full timeout.
            const needTextOnlyFallback = !searchTimedOut && !matches?.length;
            if (needTextOnlyFallback) {
              let matchesText = [];
              {
                const tSearch2 = performance.now();
                try {
                  console.log(`[JobProcessor] Retrying discount match (text-only, no semantic embed) for "${queryDisplay}"`);
                  matchesText = await runSearchWithTimeout({ skipSemanticEmbed: true });
                } catch (err2) {
                  const msg2 = err2?.message || String(err2);
                  if (msg2.startsWith("TIMEOUT:")) {
                    console.warn(
                      `[JobProcessor] Text-only discount search timed out (${SEARCH_TIMEOUT_MS}ms) for "${queryDisplay}"`
                    );
                  } else {
                    console.warn(`[JobProcessor] Text-only discount search failed for "${queryDisplay}":`, msg2);
                  }
                } finally {
                  ps.discountSearchTextOnlyMs = roundMs(performance.now() - tSearch2);
                }
              }
              if (matchesText?.length) {
                const tBuild2 = performance.now();
                try {
                  const r2 = await tryBuildDbResult(matchesText);
                  if (r2) result = r2;
                } finally {
                  ps.dbBuildTextOnlyMs = roundMs(performance.now() - tBuild2);
                }
              }
            }
          }

          // Bulk xlsx: never hit Serper/rembg (keeps Python memory/CPU predictable).
          const needsSerper =
            !bulkXlsxLite && (!result?.cutoutPath || result?.lowConfidence);

          if (needsSerper) {
            if (!serperKeysPresent()) {
              console.log(`[JobProcessor] Serper skipped (no SERPER_API_KEY): "${queryDisplay}"`);
            } else {
              armDeadline(serperPhaseMs);
              this.emitProgress(job.id, `Google image search: "${queryDisplay}"...`, i, discountItems.length);
              console.log(`[JobProcessor] Trying Serper (no DB result): "${queryDisplay}"`);
              try {
                const tSerp = performance.now();
                let serperResults = [];
                let serperQuery = "";
                let serperQueryUsed = "";
                try {
                  const { primary, fallback: serperQueryFallback } = buildSerperQuery(di);
                  serperQuery = primary;
                  serperQueryUsed = primary;
                  console.log(`[JobProcessor] Serper query: "${serperQuery}"`);
                  serperResults = await serperImageSearch(serperQuery, 10);
                  if (serperResults.length === 0 && serperQueryFallback && serperQueryFallback !== serperQuery) {
                    console.log(`[JobProcessor] Serper zero results — retrying with fallback: "${serperQueryFallback}"`);
                    serperResults = await serperImageSearch(serperQueryFallback, 10);
                    serperQueryUsed = serperQueryFallback;
                  }
                } finally {
                  ps.serperApiMs = roundMs(performance.now() - tSerp);
                }
                console.log(`[JobProcessor] Serper returned ${serperResults.length} results for "${queryDisplay}"`);
                if (serperResults.length > 0) {
                  serperResults = rerankSerperResults(serperResults, di);
                  console.log(`[JobProcessor] Top result confidence: ${serperResults[0]._confidence?.toFixed(3)} (${serperResults[0].url})`);
                }
                const cutoutReady = await waitForCutoutReady({ maxWaitMs: 20000, intervalMs: 400 });
                if (!cutoutReady) {
                  console.warn(`[JobProcessor] Cutout backend not ready after wait — proceeding; cutouts may fail until Python is up`);
                }
                let backendDown = false;
                for (const [srIdx, sr] of serperResults.entries()) {
                  if (!sr.url || backendDown) continue;
                  let ext;
                  try { ext = path.extname(new URL(sr.url).pathname) || ".jpg"; } catch { ext = ".jpg"; }
                  const safeExt = /^\.(jpg|jpeg|png|gif|webp)$/i.test(ext) ? ext : ".jpg";
                  // Store in EXPORT_ROOT (not tmpdir) so the original persists for cutout reruns.
                  const tempPath = path.join(EXPORT_ROOT, `ufm-serper-src-${Date.now()}-${i}${safeExt}`);
                  console.log(`[JobProcessor] Serper [${srIdx + 1}/${serperResults.length}]: ${sr.url}`);
                  let serperOriginalKept = false;
                  try {
                    sr._cutoutAttempted = true;
                    const tFetch = performance.now();
                    await fetchImageToFile(sr.url, tempPath);
                    ps.serperFetchMs += roundMs(performance.now() - tFetch);
                    const fileSize = (await fs.promises.stat(tempPath)).size;
                    if (fileSize < 5000) {
                      if (rp.serperStepDelayMs > 0) await sleep(rp.serperStepDelayMs);
                      continue;
                    }
                    const sourceCheck = await inspectSerperSourceImage(tempPath, sr);
                    sr._sourceCheck = sourceCheck;
                    if (!sourceCheck.ok) {
                      sr._sourceRejected = true;
                      console.log(
                        `[JobProcessor] Serper source rejected (${sourceCheck.reason}) for "${queryDisplay}" ` +
                        `(edge=${formatMetric(sourceCheck.metrics.edgeDensity)}, ` +
                        `borderWhite=${formatMetric(sourceCheck.metrics.borderWhiteFraction)}, ` +
                        `aspect=${formatMetric(sourceCheck.metrics.aspect)})`
                      );
                      if (rp.serperStepDelayMs > 0) await sleep(rp.serperStepDelayMs);
                      continue;
                    }
                    let serperOk = false;
                    const srConfidence = sr._confidence ?? 0;
                    try {
                      const cutout = await runCutoutWithShadowMs(tempPath, signal, ps);
                      if (cutout.path) {
                        const cutoutLow = cutout.lowConfidence;
                        const candidate = buildResultFromDi(
                          di,
                          cutout.path,
                          null,
                          srConfidence,
                          "serper",
                          srConfidence < 0.5 || cutoutLow,
                          sr.url,
                          {
                            qualityReason: cutout.qualityReason,
                            cutoutDiagnostics: {
                              alphaCoverage: cutout.alphaCoverage,
                              borderAlpha: cutout.borderAlpha,
                              componentCount: cutout.componentCount,
                              bboxAreaRatio: cutout.bboxAreaRatio,
                              bboxFillRatio: cutout.bboxFillRatio,
                              lightHalo: cutout.lightHalo,
                              model: cutout.model,
                            },
                          },
                          tempPath, // originalPath — preserved so reruns use the real source image
                        );
                        serperOriginalKept = true;
                        candidate._serperSignalCtx = { rank: srIdx, url: sr.url, domain: getDomain(sr.url), confidence: srConfidence };
                        if (cutoutLow) {
                          if (!lowConfidenceSerperFallback) lowConfidenceSerperFallback = candidate;
                          console.log(`[JobProcessor] Low-quality cutout for "${queryDisplay}" (rank ${srIdx}, reason=${cutout.qualityReason || "unknown"}) — trying next result`);
                        } else {
                          result = candidate;
                          serperOk = true;
                        }
                      }
                    } catch (ingestErr) {
                      const isConnErr = ingestErr.message?.includes("ECONNREFUSED") || ingestErr.message?.includes("ECONNRESET");
                      if (isConnErr) {
                        console.warn(`[JobProcessor] Python backend not ready — waiting 5s then retrying…`);
                        await new Promise(r => setTimeout(r, 5000));
                        await waitForCutoutReady({ maxWaitMs: 15000, intervalMs: 500 });
                        try {
                          const cutout = await runCutoutWithShadowMs(tempPath, signal, ps);
                          if (cutout.path) {
                            const cutoutLow = cutout.lowConfidence;
                            const candidate = buildResultFromDi(
                              di,
                              cutout.path,
                              null,
                              srConfidence,
                              "serper",
                              srConfidence < 0.5 || cutoutLow,
                              sr.url,
                              {
                                qualityReason: cutout.qualityReason,
                                cutoutDiagnostics: {
                                  alphaCoverage: cutout.alphaCoverage,
                                  borderAlpha: cutout.borderAlpha,
                                  componentCount: cutout.componentCount,
                                  bboxAreaRatio: cutout.bboxAreaRatio,
                                  bboxFillRatio: cutout.bboxFillRatio,
                                  lightHalo: cutout.lightHalo,
                                  model: cutout.model,
                                },
                              },
                              tempPath, // originalPath
                            );
                            serperOriginalKept = true;
                            candidate._serperSignalCtx = { rank: srIdx, url: sr.url, domain: getDomain(sr.url), confidence: srConfidence };
                            if (cutoutLow) {
                              if (!lowConfidenceSerperFallback) lowConfidenceSerperFallback = candidate;
                            } else {
                              result = candidate;
                              serperOk = true;
                            }
                          }
                        } catch (retryErr) {
                          console.warn(`[JobProcessor] Retry also failed — skipping remaining Serper results: ${retryErr.message}`);
                          backendDown = true;
                        }
                      } else {
                        console.warn(`[JobProcessor] Background removal failed for Serper image: ${ingestErr.message}`);
                      }
                    } finally {
                      // Only delete the original if no cutout was produced — if it was used,
                      // keep it in EXPORT_ROOT so reruns can access the unprocessed source image.
                      if (!serperOriginalKept) fs.promises.unlink(tempPath).catch(() => {});
                    }
                    if (serperOk) break;
                  } catch (dlErr) {
                    console.warn(`[JobProcessor] Serper download failed: ${dlErr.message}`);
                    fs.promises.unlink(tempPath).catch(() => {});
                  }
                  if (rp.serperStepDelayMs > 0) await sleep(rp.serperStepDelayMs);
                }

                // Last resort: if every result was skipped due to a blocked domain,
                // force-try the first URL ignoring the session blocklist.
                if (!result?.cutoutPath && !backendDown && serperResults.length > 0) {
                  const firstSr = serperResults[0];
                  if (firstSr?.url) {
                    let lrExt; try { lrExt = path.extname(new URL(firstSr.url).pathname) || ".jpg"; } catch { lrExt = ".jpg"; }
                    const lrSafeExt = /^\.(jpg|jpeg|png|gif|webp)$/i.test(lrExt) ? lrExt : ".jpg";
                    const lrTempPath = path.join(EXPORT_ROOT, `ufm-serper-src-last-${Date.now()}${lrSafeExt}`);
                    console.log(`[JobProcessor] Last-resort Serper attempt: ${firstSr.url}`);
                    const tLast = performance.now();
                    let lrOriginalKept = false;
                    try {
                      const lrRes = await fetch(firstSr.url, { signal: AbortSignal.timeout(15000), headers: BROWSER_HEADERS });
                      if (lrRes.ok) {
                        const ab = await lrRes.arrayBuffer();
                        await fs.promises.writeFile(lrTempPath, Buffer.from(ab));
                        const lrSize = (await fs.promises.stat(lrTempPath)).size;
                        if (lrSize >= 5000) {
                          const cutout = await runCutoutWithShadowMs(lrTempPath, signal, ps);
                          if (cutout.path) {
                            const lrLow = cutout.lowConfidence;
                            const lrConf = firstSr._confidence ?? 0;
                            const candidate = buildResultFromDi(
                              di,
                              cutout.path,
                              null,
                              lrConf,
                              "serper",
                              lrConf < 0.5 || lrLow,
                              firstSr.url,
                              {
                                qualityReason: cutout.qualityReason,
                                cutoutDiagnostics: {
                                  alphaCoverage: cutout.alphaCoverage,
                                  borderAlpha: cutout.borderAlpha,
                                  componentCount: cutout.componentCount,
                                  bboxAreaRatio: cutout.bboxAreaRatio,
                                  bboxFillRatio: cutout.bboxFillRatio,
                                  lightHalo: cutout.lightHalo,
                                  model: cutout.model,
                                },
                              },
                              lrTempPath, // originalPath
                            );
                            lrOriginalKept = true;
                            candidate._serperSignalCtx = { rank: 0, url: firstSr.url, domain: getDomain(firstSr.url), confidence: lrConf };
                            if (lrLow) {
                              if (!lowConfidenceSerperFallback) lowConfidenceSerperFallback = candidate;
                            } else {
                              result = candidate;
                            }
                          }
                        }
                      }
                    } catch (lastErr) {
                      console.warn(`[JobProcessor] Last-resort Serper attempt failed: ${lastErr.message}`);
                    } finally {
                      ps.serperLastResortMs += roundMs(performance.now() - tLast);
                      if (!lrOriginalKept) fs.promises.unlink(lrTempPath).catch(() => {});
                    }
                  }
                }
                // Phase 2: fire-and-forget outcome signal for the learning loop
                if (serperResults.length > 0) {
                  const signalResults = serperResults.map((sr, idx) => ({
                    rank: idx,
                    url: sr.url,
                    domain: getDomain(sr.url),
                    title: sr.title,
                    confidence: sr._confidence ?? 0,
                    outcome: result?._serperSignalCtx?.url === sr.url
                      ? "accepted"
                      : sr._sourceRejected
                        ? "rejected_source_quality"
                      : sr._cutoutAttempted
                        ? "rejected_cutout_fail"
                        : "skipped",
                  }));
                  recordSerperSignal({
                    query: serperQueryUsed,
                    queryType: serperQueryUsed === serperQuery ? "primary" : "fallback",
                    productEn: di.en || "",
                    productZh: di.zh || "",
                    department: di.department || job.department || "",
                    timestamp: Date.now(),
                    results: signalResults,
                    acceptedRank: result?._serperSignalCtx?.rank ?? null,
                    acceptedDomain: result?._serperSignalCtx?.domain ?? null,
                    finalSource: result?.matchSource ?? "none",
                  }).catch(() => {});
                }
              } catch (err) {
                console.warn(`[JobProcessor] Serper fallback failed for "${queryDisplay}":`, err.message);
              }
            }
          }

          if (!result && lowConfidenceSerperFallback) {
            result = lowConfidenceSerperFallback;
          }
          if (!result) {
            result = buildResultFromDi(di, null, null, 0, "none", true);
          }
          result.discount = di;

          ps.totalMs = roundMs(performance.now() - itemBegin);
          console.log(`[JobProcessor] Pipeline timing (ms) "${queryDisplay}":`, ps);

          const itemId = uuidv4();
          const processedImage = {
            id: itemId,
            path: result.inputPath || "",
            status: "done",
            result,
            slotIndex: i,
            pipelineStepMs: { ...ps },
            queryLabel: queryDisplay,
          };

          // Label generation moved outside runItem — canvas rendering blocks the event loop
          // and would prevent the timeout from firing if included here.
          return { processedImage };
        };

        const timerState = { id: null };
        const itemAbort = new AbortController();
        function armItemDeadline(ms) {
          if (timerState.id != null) clearTimeout(timerState.id);
          timerState.id = setTimeout(() => {
            itemAbort.abort(new Error(`Item ${i + 1} timed out after ${ms}ms`));
          }, ms);
        }
        armItemDeadline(ITEM_TIMEOUT_MS);

        const itemWallStart = performance.now();
        let itemOutput;
        try {
          itemOutput = await runItem(itemAbort.signal, armItemDeadline, ITEM_SERPER_PHASE_MS);
        } catch (err) {
          const msg = itemAbort.signal.reason?.message || err.message;
          console.warn(`[JobProcessor] Item ${i + 1} failed/timed out:`, msg);
          const fallbackResult = buildResultFromDi(di, null, null, 0, "none", true);
          fallbackResult.discount = di;
          const itemId = uuidv4();
          itemOutput = {
            processedImage: {
              id: itemId,
              path: "",
              status: "done",
              result: fallbackResult,
              slotIndex: i,
              pipelineStepMs: {
                ...emptyPipelineSteps(),
                totalMs: roundMs(performance.now() - itemWallStart),
                itemFailed: true,
              },
              queryLabel: queryDisplay,
            },
          };
        } finally {
          if (timerState.id != null) clearTimeout(timerState.id);
        }

        processedImages.push(itemOutput.processedImage);

        console.log(`[JobProcessor] Item ${i + 1}/${discountItems.length} done: source=${itemOutput.processedImage.result?.matchSource ?? "none"} score=${itemOutput.processedImage.result?.matchScore?.toFixed(3) ?? "0"} hasImage=${!!itemOutput.processedImage.result?.cutoutPath}`);
        // Emit per-item without label — labels are generated in the batch pass below
        this.emit("itemComplete", job.id, {
          processedImage: itemOutput.processedImage,
          discountLabel: null,
          index: i,
          total: discountItems.length,
        });
        await sleep(rp.discountRowDelayMs);
      }

      // Generate labels for all XLSX items in one batch pass after the loop.
      // Done here (not inline) because @napi-rs/canvas drawing is synchronous and
      // blocks the event loop — if done inside runItem it prevents the 20s timeout from firing.
      if (processedImages.length > 0) {
        this.emitProgress(job.id, "Generating labels...", processedImages.length, discountItems.length);
        try {
          const itemsForExport = processedImages
            .filter(img => img.status === "done" && img.result)
            .map(img => ({ id: img.id, result: img.result }));
          if (itemsForExport.length > 0) {
            const labels = await exportDiscountImages(itemsForExport);
            allDiscountLabels.push(...labels);
          }
        } catch (err) {
          console.error("[JobProcessor] XLSX label generation failed:", err);
        }
      }
    }

    for (let i = 0; i < totalImages; i++) {
      if (this.abortedJobs.has(job.id)) {
        this.abortedJobs.delete(job.id);
        clearTimeout(watchdogTimer);
        this.emit("aborted", job.id);
        return;
      }

      if (i > 0 && rp.batchDelayMs > 0) {
        await sleep(rp.batchDelayMs);
      }

      const imageTask = job.images[i];
      this.emitProgress(
        job.id,
        `Processing image ${i + 1}/${totalImages}`,
        i,
        totalImages
      );

      const INGEST_TIMEOUT_MS = 60_000;
      const ingestWallStart = performance.now();
      const queryLabel = path.basename(imageTask.path || "") || imageTask.path || `image-${i + 1}`;
      try {
        const result = await Promise.race([
          ingestPhoto(imageTask.path),
          _abortPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`ingestPhoto timed out after ${INGEST_TIMEOUT_MS}ms`)), INGEST_TIMEOUT_MS)
          ),
        ]);
        if (result === _ABORTED) break;

        // Attach discount info if available and matches by index
        if (discountItems[i]) {
          result.discount = discountItems[i];
        }

        const ingestPhotoMs = roundMs(performance.now() - ingestWallStart);
        const doneImg = {
          ...imageTask,
          status: "done",
          result,
          pipelineStepMs: { ...emptyPipelineSteps(), ingestPhotoMs, totalMs: ingestPhotoMs },
          queryLabel,
        };
        processedImages.push(doneImg);
        this.emit("itemComplete", job.id, {
          processedImage: doneImg,
          discountLabel: null,
          index: i,
          total: totalImages,
        });
      } catch (err) {
        console.error(`[JobProcessor] Image ${i + 1} failed:`, err);
        const errImg = {
          ...imageTask,
          status: "error",
          error: err.message || String(err),
          pipelineStepMs: {
            ...emptyPipelineSteps(),
            totalMs: roundMs(performance.now() - ingestWallStart),
            itemFailed: true,
          },
          queryLabel,
        };
        processedImages.push(errImg);
        this.emit("itemComplete", job.id, {
          processedImage: errImg,
          discountLabel: null,
          index: i,
          total: totalImages,
        });
      }
    }

    // Clean up abort resolver — job is no longer in the per-item loop
    this._abortResolvers.delete(job.id);

    // If abort was signalled mid-item (broke out of loop), handle it now
    if (this.abortedJobs.has(job.id)) {
      this.abortedJobs.delete(job.id);
      clearTimeout(watchdogTimer);
      this.emit("aborted", job.id);
      return;
    }

    // 3. For image-based jobs: generate labels in batch (streaming isn't used for image jobs)
    if (totalImages > 0) {
      this.emitProgress(job.id, "Generating labels...", totalImages, totalImages);
      try {
        const itemsForExport = processedImages
          .filter(img => img.status === "done" && img.result)
          .map(img => ({ id: img.id, result: img.result }));

        console.log("[JobProcessor] Items for export:", itemsForExport.length);
        if (itemsForExport.length > 0) {
          const labels = await exportDiscountImages(itemsForExport);
          allDiscountLabels.push(...labels);
        }
      } catch (err) {
        console.error("[JobProcessor] Label generation failed:", err);
      }
    }

    // 4. Complete — always emit at natural end so the full result (including labels generated
    // after the loop) reaches the renderer, even if the watchdog already fired a partial emit.
    clearTimeout(watchdogTimer);
    if (jobCompleted) {
      console.log(`[JobProcessor] Watchdog-complete correction: ${processedImages.length} items, ${allDiscountLabels.length} labels`);
    } else {
      jobCompleted = true;
      console.log("[JobProcessor] Job complete:", job.id, {
        processedImages: processedImages.length,
        discountLabels: allDiscountLabels.length,
      });
    }
    this.emit("complete", job.id, {
      processedImages,
      discountLabels: allDiscountLabels,
    });
  }

  emitProgress(jobId, step, processed, total) {
    this.emit("progress", jobId, {
      currentStep: step,
      processedImages: processed,
      totalImages: total,
    });
  }

}

// Singleton instance
let instance = null;

export function getJobProcessor() {
  if (!instance) {
    instance = new JobProcessor();
  }
  return instance;
}
