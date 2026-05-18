// apps/desktop/src/renderer/hooks/useJobQueue.ts
// Job queue state management with IPC events and persistence

import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { FlyerJob, ImageTask, DiscountInput, DepartmentId, JobStatus, IngestItem, CardLayout } from "../types";
import { loadJobsFromFile, saveJobsToFile } from "../services/jobPersistence";
import { getCycleStartFriday } from "../utils/flyerCycle";

declare global {
  interface Window {
    ufm: {
      startJob: (job: FlyerJob) => Promise<{ queued: boolean; jobId: string }>;
      getJobQueueStatus: () => Promise<{ queueLength: number; isProcessing: boolean; currentJobId: string | null }>;
      onJobProgress: (callback: (data: { jobId: string; progress: { currentStep: string; processedImages: number; totalImages: number } }) => void) => () => void;
      onJobComplete: (callback: (data: { jobId: string; result: any }) => void) => () => void;
      onJobError: (callback: (data: { jobId: string; error: string }) => void) => () => void;
      onJobStarted: (callback: (data: { jobId: string; itemCount: number }) => void) => () => void;
      onJobItemComplete: (callback: (data: { jobId: string; processedImage: any; discountLabel: any; index: number; total: number }) => void) => () => void;
      [key: string]: any;
    };
  }
}

export function useJobQueue() {
  // Jobs loaded async from file; start empty to avoid overwriting file before load completes
  const [jobs, setJobs] = useState<FlyerJob[]>([]);
  const initialized = useRef(false);

  // Load from userData file on mount, then resume any queued jobs
  useEffect(() => {
    loadJobsFromFile().then(loaded => {
      initialized.current = true;
      if (loaded.length > 0) setJobs(loaded);
      const queuedJobs = loaded.filter(j => j.status === "queued");
      queuedJobs.forEach(job => {
        window.ufm.startJob(job).catch((err: unknown) => {
          console.error("[useJobQueue] Failed to resume job:", job.id, err);
        });
      });
    });
  }, []);

  // Persist to file whenever jobs change (guard prevents overwriting before initial load)
  useEffect(() => {
    if (!initialized.current) return;
    saveJobsToFile(jobs);
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

    const unsubStarted = window.ufm.onJobStarted(({ jobId, itemCount }) => {
      setJobs(prev =>
        prev.map(job =>
          job.id === jobId
            ? {
                ...job,
                status: "processing" as JobStatus,
                progress: {
                  ...job.progress,
                  totalImages: itemCount,
                  processedImages: 0,
                  currentStep: "Processing…",
                },
              }
            : job
        )
      );
    });

    const unsubAborted = window.ufm.onJobAborted(({ jobId }: { jobId: string }) => {
      setJobs(prev =>
        prev.map(job =>
          job.id === jobId
            ? {
                ...job,
                status: "drafting" as JobStatus,
                progress: {
                  ...job.progress,
                  currentStep: "Draft",
                },
              }
            : job
        )
      );
    });

    const unsubItemComplete = window.ufm.onJobItemComplete(({ jobId, processedImage, discountLabel, index, total }) => {
      setJobs(prev =>
        prev.map(job => {
          if (job.id !== jobId) return job;
          const existingImages = job.result?.processedImages ?? [];
          const existingLabels = job.result?.discountLabels ?? [];
          return {
            ...job,
            progress: {
              ...job.progress,
              processedImages: index + 1,
              totalImages: total,
            },
            result: {
              ...job.result,
              processedImages: [...existingImages, processedImage],
              discountLabels: discountLabel ? [...existingLabels, discountLabel] : existingLabels,
              verificationDone: job.result?.verificationDone ?? false,
              departmentLocked: job.result?.departmentLocked ?? false,
            },
          };
        })
      );
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
      unsubStarted();
      unsubAborted();
      unsubItemComplete();
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
        flyerWeekStart: getCycleStartFriday(new Date()).toISOString().slice(0, 10),
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

    if (job.images.length === 0 && !job.discount?.source) {
      console.warn("[useJobQueue] Cannot start job with no images and no discount");
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

  // Create/update jobs for all departments at once and immediately start each one.
  // Uses a single setJobs call to avoid stale-closure issues with per-job startJob.
  const bulkApplyAndStart = useCallback(
    async (opts: {
      templateId: string;
      discountsByDept: Record<string, DiscountInput>;
      availableDepts: string[];
      flyerWeekStart?: string;
    }) => {
      const { templateId: tplId, discountsByDept, availableDepts, flyerWeekStart } = opts;
      const weekStart = flyerWeekStart ?? getCycleStartFriday(new Date()).toISOString().slice(0, 10);
      const jobsToStart: FlyerJob[] = [];

      setJobs(prev => {
        const next = [...prev];
        for (const [dept, discount] of Object.entries(discountsByDept)) {
          if (!availableDepts.includes(dept)) continue;

          const existing = next.find(
            j => j.department === dept && j.templateId === tplId &&
                 (j.status === "drafting" || j.status === "failed")
          );

          let jobObj: FlyerJob;
          if (existing) {
            jobObj = {
              ...existing,
              discount,
              status: "queued" as JobStatus,
              startedAt: Date.now(),
              flyerWeekStart: weekStart,
              progress: { ...existing.progress, currentStep: "Queued" },
            };
            const idx = next.findIndex(j => j.id === existing.id);
            next[idx] = jobObj;
          } else {
            jobObj = {
              id: uuidv4(),
              name: `Flyer ${new Date().toLocaleDateString()}`,
              department: dept as DepartmentId,
              templateId: tplId,
              images: [],
              discount,
              status: "queued" as JobStatus,
              createdAt: Date.now(),
              startedAt: Date.now(),
              flyerWeekStart: weekStart,
              progress: { totalImages: 0, processedImages: 0, currentStep: "Queued" },
            };
            next.unshift(jobObj);
          }
          jobsToStart.push(jobObj);
        }
        return next;
      });

      // Start each job — we pass the constructed objects directly to avoid
      // re-reading from a potentially stale jobs closure.
      await Promise.all(
        jobsToStart.map(job =>
          window.ufm.startJob(job).catch((err: unknown) => {
            console.error("[bulkApplyAndStart] Failed to start job:", job.id, err);
          })
        )
      );

      return jobsToStart.map(j => j.id);
    },
    []
  );

  // Delete a job
  const deleteJob = useCallback((jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId));
  }, []);

  // Update flyerWeekStart for all jobs on a given template
  const setAllJobsWeekStart = useCallback((tplId: string, dateStr: string) => {
    setJobs(prev => prev.map(j => j.templateId === tplId ? { ...j, flyerWeekStart: dateStr } : j));
  }, []);

  // Cancel all queued or processing jobs
  const cancelAllJobs = useCallback(() => {
    const active = jobs.filter(j => j.status === "queued" || j.status === "processing");
    active.forEach(job => {
      window.ufm.cancelJob(job.id).catch((err: unknown) => {
        console.error("[useJobQueue] Failed to cancel job:", job.id, err);
      });
    });
  }, [jobs]);

  // Sync current editor items + discount labels back to a drafting job (updates draft in job queue UI)
  const syncJobFromEditorItems = useCallback(
    (jobId: string, items: IngestItem[], discountLabels?: any[], slotOverrides?: Record<number, { x: number; y: number; width: number; height: number }>, cardLayouts?: Record<string, CardLayout>, verificationDone?: boolean, verificationProgress?: any, departmentLocked?: boolean) => {
      // Exclude skeleton placeholder items (status "pending" with no result) from job persistence
      const images: ImageTask[] = items
        .filter(item => !(item.status === "pending" && !item.result))
        .map((item) => ({
          id: item.id,
          path: item.path,
          status: item.status === "done" ? "done" : item.status === "error" ? "error" : item.status === "running" ? "processing" : "pending",
          result: item.result,
          error: item.error,
          slotIndex: item.slotIndex,
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
                  verificationDone: verificationDone ?? j.result?.verificationDone ?? false,
                  verificationProgress: verificationProgress !== undefined ? verificationProgress : j.result?.verificationProgress,
                  departmentLocked: departmentLocked ?? j.result?.departmentLocked ?? false,
                },
                slotOverrides: slotOverrides ?? j.slotOverrides,
                cardLayouts: cardLayouts ?? j.cardLayouts,
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
    bulkApplyAndStart,
    setAllJobsWeekStart,
    cancelAllJobs,
    deleteJob,
    getJob,
    syncJobFromEditorItems,
  };
}
