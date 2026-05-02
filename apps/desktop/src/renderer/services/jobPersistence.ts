// apps/desktop/src/renderer/services/jobPersistence.ts
// File-based persistence for flyer jobs (via IPC), with localStorage fallback.

import { FlyerJob } from "../types";

const STORAGE_KEY = "ufm:flyerJobs";

export function loadJobs(): FlyerJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const jobs = JSON.parse(raw) as FlyerJob[];

    // If the app was closed while jobs were queued/processing,
    // treat them as cancelled instead of silently resuming them.
    return jobs.map(job => {
      if (job.status === "processing" || job.status === "queued") {
        return {
          ...job,
          status: "failed" as const,
          error: job.error || "Cancelled when app was closed",
          progress: {
            ...job.progress,
            currentStep: "Cancelled",
          },
        };
      }
      return job;
    });
  } catch (err) {
    console.error("[jobPersistence] Failed to load jobs:", err);
    return [];
  }
}

function slimIngestResult(result: any): any {
  if (!result) return result;
  // Strip large fields that are only needed during processing, not for display.
  // ocr: raw PaddleOCR arrays (2-5 KB/image); dbMatches/webMatches: search result blobs.
  // Keeping these causes localStorage quota overflow (~5 MB) with 15+ images, silently
  // dropping the save and losing all images on restart.
  const { ocr: _ocr, dbMatches: _db, webMatches: _web, ...slim } = result;
  return slim;
}

function slimImageTask(img: any): any {
  return img.result ? { ...img, result: slimIngestResult(img.result) } : img;
}

export function saveJobs(jobs: FlyerJob[]): void {
  try {
    const slimJobs = jobs.map(job => ({
      ...job,
      images: job.images.map(slimImageTask),
      result: job.result
        ? { ...job.result, processedImages: job.result.processedImages.map(slimImageTask) }
        : job.result,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slimJobs));
  } catch (err) {
    console.error("[jobPersistence] Failed to save jobs:", err);
  }
}

export function clearJobs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("[jobPersistence] Failed to clear jobs:", err);
  }
}

function processRawJobs(jobs: FlyerJob[]): FlyerJob[] {
  return jobs.map(job => {
    if (job.status === "processing" || job.status === "queued") {
      return {
        ...job,
        status: "failed" as const,
        error: job.error || "Cancelled when app was closed",
        progress: { ...job.progress, currentStep: "Cancelled" },
      };
    }
    return job;
  });
}

function slimForSave(jobs: FlyerJob[]): any[] {
  return jobs.map(job => ({
    ...job,
    images: job.images.map(slimImageTask),
    result: job.result
      ? { ...job.result, processedImages: job.result.processedImages.map(slimImageTask) }
      : job.result,
  }));
}

/** Load from file (IPC) with localStorage as fallback. */
export async function loadJobsFromFile(): Promise<FlyerJob[]> {
  try {
    const raw: FlyerJob[] = await (window as any).ufm.loadJobsFromFile();
    if (Array.isArray(raw) && raw.length > 0) {
      return processRawJobs(raw);
    }
  } catch (err) {
    console.warn("[jobPersistence] File load failed, falling back to localStorage:", err);
  }
  // Fallback: localStorage (may be empty in Electron dev mode across restarts)
  return loadJobs();
}

/** Save to file (IPC) — called whenever jobs state changes. */
export async function saveJobsToFile(jobs: FlyerJob[]): Promise<void> {
  try {
    const slim = slimForSave(jobs);
    await (window as any).ufm.saveJobsToFile(slim);
  } catch (err) {
    console.error("[jobPersistence] File save failed:", err);
    // Fall back to localStorage
    saveJobs(jobs);
  }
}
