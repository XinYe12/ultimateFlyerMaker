// apps/desktop/src/renderer/services/jobPersistence.ts
// localStorage persistence for flyer jobs

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

export function saveJobs(jobs: FlyerJob[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
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
