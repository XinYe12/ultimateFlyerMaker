// apps/desktop/src/main/jobs/JobProcessor.js
// Sequential job processor with progress events

import { EventEmitter } from "events";
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
          discountItems = await parseDiscountXlsx(null, job.discount.source);
        } else {
          discountItems = await parseDiscountText(null, job.discount.source);
        }
        console.log(`[JobProcessor] Parsed ${discountItems.length} discount items:`, JSON.stringify(discountItems, null, 2));
      } catch (err) {
        console.error("[JobProcessor] Discount parsing failed:", err);
        // Continue without discounts
      }
    } else {
      console.log("[JobProcessor] No discount info provided for job");
    }

    // 2. Process images sequentially
    const processedImages = [];

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
