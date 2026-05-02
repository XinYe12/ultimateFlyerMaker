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
import { runCutout } from "../cutoutClient.js";
import { addShadowToCutout } from "../ingestion/addShadow.js";
import sizeOf from "image-size";
import { decideSizeFromAspectRatio } from "../../../../shared/flyer/layout/sizeFromImage.js";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.google.com/",
};

// Session-level blocklist: domains confirmed to reject all connections.
// Automatically populated on first connection failure — no manual maintenance needed.
const blockedDomains = new Set(["weeecdn.com"]);

function isBlockedUrl(url) {
  try {
    const { hostname } = new URL(url);
    return [...blockedDomains].some(d => hostname === d || hostname.endsWith("." + d));
  } catch { return false; }
}

function blockDomain(url) {
  try {
    const { hostname } = new URL(url);
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

/** Run only cutout+shadow (no OCR, no DeepSeek). Returns cutoutPath. */
async function ingestCutoutOnly(tempPath) {
  const baseCutoutPath = await runCutout(tempPath);
  const cutoutPath = await addShadowToCutout(baseCutoutPath);
  return cutoutPath;
}

/** Get layout size from a cutout image path. */
function getLayoutFromPath(cutoutPath) {
  let layout = { size: "SMALL" };
  try {
    const { width, height } = sizeOf(cutoutPath);
    const aspectRatio = typeof width === "number" && typeof height === "number" ? width / height : null;
    layout.size = decideSizeFromAspectRatio(aspectRatio);
  } catch {}
  return layout;
}

/** Build a result object from discount item data (no OCR/LLM). */
function buildResultFromDi(di, cutoutPath, cutoutPaths, matchScore, matchSource, lowConfidence) {
  const layout = cutoutPath ? getLayoutFromPath(cutoutPath) : { size: "SMALL" };
  return {
    inputPath: cutoutPath || null,
    cutoutPath: cutoutPath || null,
    cutoutPaths: cutoutPaths?.length > 1 ? cutoutPaths : undefined,
    allFlavorPaths: cutoutPaths?.length > 1 ? cutoutPaths : undefined,
    pendingFlavorSelection: cutoutPaths?.length > 1 ? true : undefined,
    layout,
    title: { en: di.en || "", zh: di.zh || "", size: di.size || "", confidence: "high", source: "xlsx" },
    aiTitle: { en: di.en || "", zh: di.zh || "", size: di.size || "", confidence: "high", source: "xlsx" },
    ocr: [],
    llmResult: { items: [{ english_name: di.en, chinese_name: di.zh, size: di.size, sale_price: di.salePrice }] },
    matchScore,
    matchSource,
    lowConfidence,
  };
}

export class JobProcessor extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.isProcessing = false;
    this.currentJobId = null;
    this.abortedJobs = new Set();
  }

  cancelJob(jobId) {
    this.abortedJobs.add(jobId);
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
    const totalImages = job.images?.length || 0;
    let discountItems = [];

    // 1. Parse discounts if provided
    if (job.discount && job.discount.source) {
      this.emitProgress(job.id, "Parsing discounts...", 0, totalImages);
      console.log("[JobProcessor] Parsing discount:", job.discount.type, "source length:", job.discount.source?.length);

      try {
        if (job.discount.type === "xlsx") {
          discountItems = await parseDiscountXlsx(null, job.discount.source, job.department);
        } else {
          discountItems = await parseDiscountText(null, job.discount.source);
        }
        console.log(`[JobProcessor] Parsed ${discountItems.length} discount items:`, JSON.stringify(discountItems, null, 2));
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

      // Emit "started" so renderer can create skeleton cards
      this.emit("started", job.id, { itemCount: discountItems.length, discountItems });

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

        const DB_CONFIDENCE_THRESHOLD = 0.60;
        const SEARCH_TIMEOUT_MS = 8_000;
        // Pipeline budget: 8s DB search + 7s Serper API + 3s download + 8s cutout+shadow = ~26s worst case.
        // 20s was too tight — Serper cutout completed but the timeout fired first, discarding the result.
        const ITEM_TIMEOUT_MS = 45_000;

        const runItem = async () => {
          let result = null;
          let matchScore = 0;
          let matchSource = "none";

          try {
            const searchPromise = searchForDiscountItem(di, limit);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`searchForDiscountItem timed out after ${SEARCH_TIMEOUT_MS}ms`)), SEARCH_TIMEOUT_MS)
            );
            const matches = await Promise.race([searchPromise, timeoutPromise]);
            matchScore = matches.length > 0 ? (matches[0].score ?? 0) : 0;

            if (matches.length > 0) {
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

              if (cutoutPaths.length > 0) {
                matchSource = "db";
                const lowConfidence = matchScore < 0.50;
                result = buildResultFromDi(di, cutoutPaths[0], cutoutPaths, matchScore, matchSource, lowConfidence);
              }
            }
          } catch (err) {
            console.warn(`[JobProcessor] DB search/download failed for "${queryDisplay}":`, err.message);
          }

          // Fall back to Serper if: (a) no DB result at all, or (b) DB score is below threshold
          const dbIsPoor = result?.matchSource === "db" && matchScore < DB_CONFIDENCE_THRESHOLD;
          const needsSerper = !result?.cutoutPath || dbIsPoor;

          if (needsSerper) {
            const dbFallback = dbIsPoor ? result : null;
            if (dbIsPoor) result = null;

            if (!serperKeysPresent()) {
              console.log(`[JobProcessor] Serper skipped (no SERPER_API_KEY): "${queryDisplay}"`);
              if (dbFallback) result = dbFallback;
            } else {
              const reason = !result?.cutoutPath ? "no DB result" : `DB score too low (${matchScore.toFixed(3)})`;
              this.emitProgress(job.id, `Google image search: "${queryDisplay}"...`, i, discountItems.length);
              console.log(`[JobProcessor] Trying Serper (${reason}): "${queryDisplay}"`);
              try {
                const serperResults = await serperImageSearch(queryDisplay, 10);
                console.log(`[JobProcessor] Serper returned ${serperResults.length} results for "${queryDisplay}"`);
                for (const sr of serperResults) {
                  if (!sr.url) continue;
                  let ext;
                  try { ext = path.extname(new URL(sr.url).pathname) || ".jpg"; } catch { ext = ".jpg"; }
                  const safeExt = /^\.(jpg|jpeg|png|gif|webp)$/i.test(ext) ? ext : ".jpg";
                  const tempPath = path.join(os.tmpdir(), `ufm-serper-${Date.now()}-${i}${safeExt}`);
                  try {
                    await fetchImageToFile(sr.url, tempPath);
                    const fileSize = (await fs.promises.stat(tempPath)).size;
                    if (fileSize < 5000) continue;
                    let serperOk = false;
                    try {
                      const cutoutPath = await ingestCutoutOnly(tempPath);
                      console.log(`[JobProcessor] Serper cutout result: cutoutPath=${cutoutPath ? 'YES' : 'NO'}`);
                      if (cutoutPath) {
                        result = buildResultFromDi(di, cutoutPath, null, 0, "serper", true);
                        serperOk = true;
                      }
                    } catch (ingestErr) {
                      console.warn(`[JobProcessor] Serper cutout failed: ${ingestErr.message}`);
                    } finally {
                      fs.promises.unlink(tempPath).catch(() => {});
                    }
                    if (serperOk) break;
                  } catch (dlErr) {
                    console.warn(`[JobProcessor] Serper download failed: ${dlErr.message}`);
                    fs.promises.unlink(tempPath).catch(() => {});
                  }
                }
              } catch (err) {
                console.warn(`[JobProcessor] Serper fallback failed for "${queryDisplay}":`, err.message);
              }

              // If Serper failed, restore DB result as last resort
              if (!result?.cutoutPath && dbFallback?.cutoutPath) {
                console.log(`[JobProcessor] Serper failed; restoring DB result (score=${matchScore.toFixed(3)}) for "${queryDisplay}"`);
                result = dbFallback;
              }
            }
          }

          if (!result) {
            result = buildResultFromDi(di, null, null, 0, "none", true);
          }
          result.discount = di;

          const itemId = uuidv4();
          const processedImage = {
            id: itemId,
            path: result.inputPath || "",
            status: "done",
            result,
            slotIndex: i,
          };

          // Label generation moved outside runItem — canvas rendering blocks the event loop
          // and would prevent the timeout from firing if included here.
          return { processedImage };
        };

        let itemOutput;
        try {
          itemOutput = await Promise.race([
            runItem(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Item ${i + 1} timed out after ${ITEM_TIMEOUT_MS}ms`)), ITEM_TIMEOUT_MS)
            ),
          ]);
        } catch (err) {
          console.warn(`[JobProcessor] Item ${i + 1} failed/timed out:`, err.message);
          const fallbackResult = buildResultFromDi(di, null, null, 0, "none", true);
          fallbackResult.discount = di;
          const itemId = uuidv4();
          itemOutput = {
            processedImage: { id: itemId, path: "", status: "done", result: fallbackResult, slotIndex: i },
          };
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
      }

      // Generate labels for all XLSX items in one batch pass after the loop.
      // Done here (not inline) because @napi-rs/canvas drawing is synchronous and
      // blocks the event loop — if done inside runItem it prevents the 20s timeout from firing.
      if (processedImages.length > 0) {
        this.emitProgress(job.id, "Generating labels...", processedImages.length, processedImages.length);
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

      const imageTask = job.images[i];
      this.emitProgress(
        job.id,
        `Processing image ${i + 1}/${totalImages}`,
        i,
        totalImages
      );

      const INGEST_TIMEOUT_MS = 60_000;
      try {
        const result = await Promise.race([
          ingestPhoto(imageTask.path),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`ingestPhoto timed out after ${INGEST_TIMEOUT_MS}ms`)), INGEST_TIMEOUT_MS)
          ),
        ]);

        // Attach discount info if available and matches by index
        if (discountItems[i]) {
          result.discount = discountItems[i];
        }

        processedImages.push({
          ...imageTask,
          status: "done",
          result,
        });
      } catch (err) {
        console.error(`[JobProcessor] Image ${i + 1} failed:`, err);
        processedImages.push({
          ...imageTask,
          status: "error",
          error: err.message || String(err),
        });
      }
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

    // 4. Complete
    clearTimeout(watchdogTimer);
    if (!jobCompleted) {
      jobCompleted = true;
      console.log("[JobProcessor] Job complete:", job.id, {
        processedImages: processedImages.length,
        discountLabels: allDiscountLabels.length,
      });
      this.emit("complete", job.id, {
        processedImages,
        discountLabels: allDiscountLabels,
      });
    }
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
