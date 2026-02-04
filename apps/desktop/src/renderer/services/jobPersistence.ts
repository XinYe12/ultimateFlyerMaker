// apps/desktop/src/renderer/services/jobPersistence.ts
// localStorage persistence for flyer jobs

import { FlyerJob } from "../types";

const STORAGE_KEY = "ufm:flyerJobs";

export function loadJobs(): FlyerJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const jobs = JSON.parse(raw) as FlyerJob[];

    // Reset any jobs that were processing when the app closed
    return jobs.map(job => {
      if (job.status === "processing") {
        return {
          ...job,
          status: "queued" as const,
          progress: {
            ...job.progress,
            currentStep: "Resuming...",
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
