// apps/desktop/src/main/jobs/JobProcessor.js
// Sequential job processor with progress events

import { EventEmitter } from "events";
import path from "path";
import os from "os";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { ingestPhoto } from "../ingestion/ingestPhoto.js";
import { parseDiscountText } from "../ipc/parseDiscountText.js";
import { parseDiscountXlsx } from "../ipc/parseDiscountXlsx.js";
import { exportDiscountImages } from "../ipc/exportDiscountImages.js";
import { serperImageSearch, serperKeysPresent } from "../ingestion/serperImageSearchService.js";

/** Word-level overlap between two strings (0–1). Used to flag wrong-product downloads. */
function titleWordOverlap(a, b) {
  const tokA = new Set(String(a || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const tokB = new Set(String(b || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  if (!tokA.size || !tokB.size) return 0;
  let hits = 0;
  for (const t of tokA) if (tokB.has(t)) hits++;
  return hits / Math.max(tokA.size, tokB.size);
}

export class JobProcessor extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.isProcessing = false;
    this.currentJobId = null;
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

    // XLSX-only mode: no images provided, search DB for each discount item
    if (totalImages === 0 && discountItems.length > 0) {
      const { searchForDiscountItem } = await import("../ingestion/searchService.js");

      // PREFLIGHT: quick search (no download) to estimate DB coverage.
      // Run in batches of 5 to avoid overwhelming Firestore/Ollama with N parallel queries.
      let preflightMatched = 0;
      this.emitProgress(job.id, "Checking DB coverage...", 0, discountItems.length);
      const PREFLIGHT_BATCH = 5;
      for (let pi = 0; pi < discountItems.length; pi += PREFLIGHT_BATCH) {
        await Promise.all(
          discountItems.slice(pi, pi + PREFLIGHT_BATCH).map(async (di) => {
            try {
              const r = await searchForDiscountItem(di, 1);
              if (r.length > 0 && r[0].score >= 0.30) preflightMatched++;
            } catch { /* ignore */ }
          })
        );
      }
      const coverage = Math.round((preflightMatched / discountItems.length) * 100);
      console.log(`[JobProcessor] Pre-flight: ${preflightMatched}/${discountItems.length} (${coverage}%) estimated DB matches`);
      this.emit("preflight", job.id, { matched: preflightMatched, total: discountItems.length, coverage });

      for (let i = 0; i < discountItems.length; i++) {
        const di = discountItems[i];
        const queryDisplay = [di.en, di.zh, di.size].filter(Boolean).join(" ");
        const isSeries = di.isSeries === true;
        const limit = isSeries ? Math.min(12, Math.max(2, di.flavorCount || 6)) : 1;

        this.emitProgress(
          job.id,
          isSeries ? `Matching ${limit} products: "${queryDisplay}"...` : `Matching product: "${queryDisplay}"...`,
          i,
          discountItems.length
        );

        let result = null;
        let matchScore = 0;
        let matchSource = "none";
        const DB_CONFIDENCE_THRESHOLD = 0.60;

        try {
          const matches = await searchForDiscountItem(di, limit);
          matchScore = matches.length > 0 ? (matches[0].score ?? 0) : 0;

          if (matches.length > 0) {
            const cutoutPaths = [];
            let baseResult = null;

            for (let j = 0; j < matches.length; j++) {
              const m = matches[j];
              if (!m?.publicUrl) continue;
              const url = m.publicUrl;
              const ext = path.extname(new URL(url).pathname) || ".jpg";
              const safeExt = /^\.(jpg|jpeg|png|gif|webp)$/i.test(ext) ? ext : ".jpg";
              const tempPath = path.join(os.tmpdir(), `ufm-dbsearch-${Date.now()}-${i}-${j}${safeExt}`);

              try {
                const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
                if (res.ok) {
                  const ab = await res.arrayBuffer();
                  await fs.promises.writeFile(tempPath, Buffer.from(ab));
                  try {
                    const single = await ingestPhoto(tempPath);
                    if (single?.cutoutPath) cutoutPaths.push(single.cutoutPath);
                    if (!baseResult) baseResult = single;
                  } finally {
                    fs.promises.unlink(tempPath).catch(() => {});
                  }
                }
              } catch { /* try next match */ }
            }

            if (baseResult && cutoutPaths.length > 0) {
              matchSource = "db";
              // Title verification: flag low confidence if downloaded product looks wrong
              const dlTitle = [baseResult?.title?.en, baseResult?.aiTitle?.en].filter(Boolean).join(" ");
              const expectedTitle = queryDisplay;
              const overlap = titleWordOverlap(dlTitle, expectedTitle);
              const lowConfidence = matchScore < 0.40 || overlap < 0.25;

              result = {
                ...baseResult,
                cutoutPath: cutoutPaths[0],
                cutoutPaths: cutoutPaths.length > 1 ? cutoutPaths : undefined,
                allFlavorPaths: cutoutPaths.length > 1 ? cutoutPaths : undefined,
                pendingFlavorSelection: cutoutPaths.length > 1 ? true : undefined,
                matchScore,
                matchSource,
                lowConfidence,
              };
            } else if (baseResult) {
              matchSource = "db";
              result = { ...baseResult, matchScore, matchSource, lowConfidence: true };
            }
          }
        } catch (err) {
          console.warn(`[JobProcessor] DB search/download failed for "${queryDisplay}":`, err.message);
        }

        // Fall back to Serper if: (a) no DB result at all, or (b) DB score is below threshold
        const dbIsPoor = result?.matchSource === "db" && matchScore < DB_CONFIDENCE_THRESHOLD;
        const needsSerper = !result?.cutoutPath || dbIsPoor;

        if (needsSerper) {
          const dbFallback = dbIsPoor ? result : null; // preserve low-score DB result in case Serper fails
          if (dbIsPoor) result = null;                 // reset so Serper can replace

          if (!serperKeysPresent()) {
            console.log(`[JobProcessor] Serper skipped (no SERPER_API_KEY): "${queryDisplay}"`);
            if (dbFallback) result = dbFallback;       // restore DB result
          } else {
            const reason = !result?.cutoutPath ? "no DB result" : `DB score too low (${matchScore.toFixed(3)})`;
            this.emitProgress(job.id, `Google image search: "${queryDisplay}"...`, i, discountItems.length);
            console.log(`[JobProcessor] Trying Serper (${reason}): "${queryDisplay}"`);
            try {
              const serperResults = await serperImageSearch(queryDisplay, 4);
              console.log(`[JobProcessor] Serper returned ${serperResults.length} results for "${queryDisplay}"`);
              for (const sr of serperResults) {
                if (!sr.url) continue;
                let ext;
                try { ext = path.extname(new URL(sr.url).pathname) || ".jpg"; } catch { ext = ".jpg"; }
                const safeExt = /^\.(jpg|jpeg|png|gif|webp)$/i.test(ext) ? ext : ".jpg";
                const tempPath = path.join(os.tmpdir(), `ufm-serper-${Date.now()}-${i}${safeExt}`);
                try {
                  const res = await fetch(sr.url, { signal: AbortSignal.timeout(15000) });
                  if (!res.ok) {
                    console.log(`[JobProcessor] Serper image HTTP ${res.status}: ${sr.url}`);
                    continue;
                  }
                  const contentType = res.headers.get("content-type") || "";
                  // Accept image/* and octet-stream (some CDNs don't set correct type)
                  const isImageLike = contentType.startsWith("image/") || contentType.includes("octet-stream") || contentType === "";
                  if (!isImageLike) {
                    console.log(`[JobProcessor] Serper image skipped (content-type: ${contentType}): ${sr.url}`);
                    continue;
                  }
                  const ab = await res.arrayBuffer();
                  if (ab.byteLength < 5000) continue; // skip tiny files (< 5KB, probably not real images)
                  await fs.promises.writeFile(tempPath, Buffer.from(ab));
                  let serperIngestOk = false;
                  try {
                    const single = await ingestPhoto(tempPath);
                    console.log(`[JobProcessor] Serper ingest result: cutoutPath=${single?.cutoutPath ? 'YES' : 'NO'}`);
                    if (single?.cutoutPath) {
                      result = { ...single, matchScore: 0, matchSource: "serper", lowConfidence: true };
                      serperIngestOk = true;
                    }
                  } catch (ingestErr) {
                    console.warn(`[JobProcessor] Serper ingestPhoto failed: ${ingestErr.message}`);
                  } finally {
                    if (!serperIngestOk) fs.promises.unlink(tempPath).catch(() => {});
                  }
                  if (serperIngestOk) break;
                } catch (dlErr) {
                  console.warn(`[JobProcessor] Serper download failed: ${dlErr.message}`);
                  fs.promises.unlink(tempPath).catch(() => {});
                }
              }
            } catch (err) {
              console.warn(`[JobProcessor] Serper fallback failed for "${queryDisplay}":`, err.message);
            }

            // If Serper still failed, restore DB result as last resort
            if (!result?.cutoutPath && dbFallback?.cutoutPath) {
              console.log(`[JobProcessor] Serper failed; restoring DB result (score=${matchScore.toFixed(3)}) for "${queryDisplay}"`);
              result = dbFallback;
            }
          }
        }

        if (!result) {
          result = {
            inputPath: null,
            cutoutPath: null,
            cutoutPaths: undefined,
            layout: { size: "SMALL" },
            title: { en: di.en, zh: di.zh, size: di.size },
            llmResult: { items: [] },
            matchScore: 0,
            matchSource: "none",
            lowConfidence: true,
          };
        }
        result.discount = di;

        processedImages.push({
          id: uuidv4(),
          path: result.inputPath || "",
          status: "done",
          result,
        });
      }
    }

    for (let i = 0; i < totalImages; i++) {
      const imageTask = job.images[i];
      this.emitProgress(
        job.id,
        `Processing image ${i + 1}/${totalImages}`,
        i,
        totalImages
      );

      try {
        const result = await ingestPhoto(imageTask.path);

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

    // 3. Generate discount labels
    this.emitProgress(job.id, "Generating labels...", totalImages, totalImages);

    let discountLabels = [];
    try {
      // Build items for exportDiscountImages
      const itemsForExport = processedImages
        .filter(img => img.status === "done" && img.result)
        .map(img => ({
          id: img.id,
          result: img.result,
        }));

      console.log("[JobProcessor] Items for export:", itemsForExport.length);
      console.log("[JobProcessor] First item discount:", itemsForExport[0]?.result?.discount);

      if (itemsForExport.length > 0) {
        discountLabels = await exportDiscountImages(itemsForExport);
        console.log("[JobProcessor] Generated labels:", discountLabels.length, discountLabels);
      }
    } catch (err) {
      console.error("[JobProcessor] Label generation failed:", err);
    }

    // 4. Complete
    console.log("[JobProcessor] Job complete:", job.id, {
      processedImages: processedImages.length,
      discountLabels: discountLabels.length,
    });

    this.emit("complete", job.id, {
      processedImages,
      discountLabels,
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
