// apps/desktop/src/renderer/hooks/useJobQueue.ts
// Job queue state management with IPC events and persistence

import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { FlyerJob, ImageTask, DiscountInput, DepartmentId, JobStatus, IngestItem } from "../types";
import { loadJobs, saveJobs } from "../services/jobPersistence";

declare global {
  interface Window {
    ufm: {
      startJob: (job: FlyerJob) => Promise<{ queued: boolean; jobId: string }>;
      getJobQueueStatus: () => Promise<{ queueLength: number; isProcessing: boolean; currentJobId: string | null }>;
      onJobProgress: (callback: (data: { jobId: string; progress: { currentStep: string; processedImages: number; totalImages: number } }) => void) => () => void;
      onJobComplete: (callback: (data: { jobId: string; result: any }) => void) => () => void;
      onJobError: (callback: (data: { jobId: string; error: string }) => void) => () => void;
      [key: string]: any;
    };
  }
}

export function useJobQueue() {
  const [jobs, setJobs] = useState<FlyerJob[]>([]);
  const initialized = useRef(false);

  // Load jobs from localStorage on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const savedJobs = loadJobs();
    if (savedJobs.length > 0) {
      setJobs(savedJobs);

      // Resume any queued jobs
      const queuedJobs = savedJobs.filter(j => j.status === "queued");
      queuedJobs.forEach(job => {
        window.ufm.startJob(job).catch(err => {
          console.error("[useJobQueue] Failed to resume job:", job.id, err);
        });
      });
    }
  }, []);

  // Save jobs to localStorage on change
  useEffect(() => {
    if (!initialized.current) return;
    saveJobs(jobs);
  }, [jobs]);

  // Listen for IPC events
  useEffect(() => {
    const unsubProgress = window.ufm.onJobProgress(({ jobId, progress }) => {
      setJobs(prev =>
        prev.map(job =>
          job.id === jobId
            ? {
                ...job,
                status: "processing" as JobStatus,
                progress: {
                  currentStep: progress.currentStep,
                  processedImages: progress.processedImages,
                  totalImages: progress.totalImages,
                },
              }
            : job
        )
      );
    });

    const unsubComplete = window.ufm.onJobComplete(({ jobId, result }) => {
      setJobs(prev =>
        prev.map(job =>
          job.id === jobId
            ? {
                ...job,
                status: "completed" as JobStatus,
                completedAt: Date.now(),
                result,
                progress: {
                  ...job.progress,
                  currentStep: "Completed",
                  processedImages: job.progress.totalImages,
                },
              }
            : job
        )
      );
    });

    const unsubError = window.ufm.onJobError(({ jobId, error }) => {
      setJobs(prev =>
        prev.map(job =>
          job.id === jobId
            ? {
                ...job,
                status: "failed" as JobStatus,
                error,
                progress: {
                  ...job.progress,
                  currentStep: "Failed",
                },
              }
            : job
        )
      );
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, []);

  // Create a new drafting job
  const createJob = useCallback(
    (templateId: string, department: DepartmentId, name?: string): string => {
      // Check if there's already a drafting job for this department
      const existingDraft = jobs.find(
        j => j.department === department && j.status === "drafting"
      );

      if (existingDraft) {
        console.warn(`[useJobQueue] Draft already exists for department: ${department}`);
        return existingDraft.id;
      }

      const id = uuidv4();
      const job: FlyerJob = {
        id,
        name: name || `Flyer ${new Date().toLocaleDateString()}`,
        department,
        templateId,
        images: [],
        discount: null,
        status: "drafting",
        createdAt: Date.now(),
        progress: {
          totalImages: 0,
          processedImages: 0,
          currentStep: "Draft",
        },
      };

      setJobs(prev => [job, ...prev]);
      return id;
    },
    [jobs]
  );

  // Add images to a drafting job
  const addImagesToJob = useCallback((jobId: string, paths: string[]) => {
    setJobs(prev =>
      prev.map(job => {
        if (job.id !== jobId || job.status !== "drafting") return job;

        const newImages: ImageTask[] = paths.map(path => ({
          id: uuidv4(),
          path,
          status: "pending",
        }));

        return {
          ...job,
          images: [...job.images, ...newImages],
          progress: {
            ...job.progress,
            totalImages: job.images.length + newImages.length,
          },
        };
      })
    );
  }, []);

  // Remove an image from a drafting job
  const removeImageFromJob = useCallback((jobId: string, imageId: string) => {
    setJobs(prev =>
      prev.map(job => {
        if (job.id !== jobId || job.status !== "drafting") return job;

        const newImages = job.images.filter(img => img.id !== imageId);
        return {
          ...job,
          images: newImages,
          progress: {
            ...job.progress,
            totalImages: newImages.length,
          },
        };
      })
    );
  }, []);

  // Set discount input for a job
  const setJobDiscount = useCallback(
    (jobId: string, discount: DiscountInput | null) => {
      setJobs(prev =>
        prev.map(job => {
          if (job.id !== jobId || job.status !== "drafting") return job;
          return { ...job, discount };
        })
      );
    },
    []
  );

  // Update job name
  const setJobName = useCallback((jobId: string, name: string) => {
    setJobs(prev =>
      prev.map(job => {
        if (job.id !== jobId || job.status !== "drafting") return job;
        return { ...job, name };
      })
    );
  }, []);

  // Update job department
  const setJobDepartment = useCallback((jobId: string, department: DepartmentId) => {
    setJobs(prev =>
      prev.map(job => {
        if (job.id !== jobId || job.status !== "drafting") return job;
        return { ...job, department };
      })
    );
  }, []);

  // Queue a job for processing
  const startJob = useCallback(async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job || job.status !== "drafting") return;

    if (job.images.length === 0) {
      console.warn("[useJobQueue] Cannot start job with no images");
      return;
    }

    // Update status to queued
    setJobs(prev =>
      prev.map(j =>
        j.id === jobId
          ? {
              ...j,
              status: "queued" as JobStatus,
              startedAt: Date.now(),
              progress: {
                ...j.progress,
                currentStep: "Queued",
              },
            }
          : j
      )
    );

    // Send to main process
    try {
      const updatedJob = { ...job, status: "queued" as JobStatus, startedAt: Date.now() };
      await window.ufm.startJob(updatedJob);
    } catch (err) {
      console.error("[useJobQueue] Failed to start job:", err);
      setJobs(prev =>
        prev.map(j =>
          j.id === jobId
            ? {
                ...j,
                status: "failed" as JobStatus,
                error: String(err),
              }
            : j
        )
      );
    }
  }, [jobs]);

  // Delete a job
  const deleteJob = useCallback((jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId));
  }, []);

  // Sync current editor items + discount labels back to a drafting job (updates draft in job queue UI)
  const syncJobFromEditorItems = useCallback(
    (jobId: string, items: IngestItem[], discountLabels?: any[]) => {
      const images: ImageTask[] = items.map((item) => ({
        id: item.id,
        path: item.path,
        status: item.status === "done" ? "done" : item.status === "error" ? "error" : item.status === "running" ? "processing" : "pending",
        result: item.result,
        error: item.error,
      }));
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                images,
                progress: {
                  ...j.progress,
                  totalImages: images.length,
                  processedImages: images.filter((img) => img.status === "done").length,
                  currentStep: j.progress.currentStep,
                },
                result: {
                  processedImages: images,
                  discountLabels: discountLabels ?? j.result?.discountLabels ?? [],
                },
              }
            : j
        )
      );
    },
    []
  );

  // Get a specific job
  const getJob = useCallback(
    (jobId: string): FlyerJob | undefined => {
      return jobs.find(j => j.id === jobId);
    },
    [jobs]
  );

  return {
    jobs,
    createJob,
    addImagesToJob,
    removeImageFromJob,
    setJobDiscount,
    setJobName,
    setJobDepartment,
    startJob,
    deleteJob,
    getJob,
    syncJobFromEditorItems,
  };
}
