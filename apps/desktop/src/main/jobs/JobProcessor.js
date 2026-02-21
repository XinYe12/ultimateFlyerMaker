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
        try {
          const matches = await searchForDiscountItem(di, limit);
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
            }

            if (baseResult && cutoutPaths.length > 0) {
              result = {
                ...baseResult,
                cutoutPath: cutoutPaths[0],
                cutoutPaths: cutoutPaths.length > 1 ? cutoutPaths : undefined,
                // Permanent record of every staged flavor — never overwritten by selection
                allFlavorPaths: cutoutPaths.length > 1 ? cutoutPaths : undefined,
                // Stage series items — user must choose which flavors to include
                pendingFlavorSelection: cutoutPaths.length > 1 ? true : undefined,
              };
            } else if (baseResult) {
              result = baseResult;
            }
          }
        } catch (err) {
          console.warn(`[JobProcessor] DB search/download failed for "${queryDisplay}":`, err.message);
        }

        if (!result) {
          result = {
            inputPath: null,
            cutoutPath: null,
            cutoutPaths: undefined,
            layout: { size: "SMALL" },
            title: { en: di.en, zh: di.zh, size: di.size },
            llmResult: { items: [] },
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
