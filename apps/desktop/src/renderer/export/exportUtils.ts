// apps/desktop/src/renderer/export/exportUtils.ts
// Utilities for checking export readiness and department status

import { FlyerJob, DepartmentId } from "../types";
import { FlyerTemplateConfig } from "../editor/loadFlyerTemplateConfig";

export type DepartmentExportStatus = {
  department: DepartmentId;
  label: string;
  status: "not-started" | "in-progress" | "ready";
  job?: FlyerJob;
  imageCount: number;
};

export type ExportReadinessCheck = {
  canExport: boolean;
  allReady: boolean;
  departments: DepartmentExportStatus[];
  notStartedCount: number;
  inProgressCount: number;
  readyCount: number;
};

const DEPARTMENT_LABELS: Record<string, string> = {
  grocery: "Grocery",
  frozen: "Frozen",
  hot_food: "Hot Food",
  sushi: "Sushi",
  meat: "Meat",
  seafood: "Seafood",
  fruit: "Fruit",
  vegetable: "Vegetable",
  hot_sale: "Hot Sale",
  produce: "Produce",
};

/**
 * Check export readiness for all departments in template
 */
export function checkExportReadiness(
  templateConfig: FlyerTemplateConfig,
  jobs: FlyerJob[]
): ExportReadinessCheck {
  // Extract all departments from template
  const allDepartments = new Set<string>();
  templateConfig.pages.forEach((page) => {
    Object.keys(page.departments).forEach((dept) => allDepartments.add(dept));
  });

  const departmentStatuses: DepartmentExportStatus[] = [];
  let notStartedCount = 0;
  let inProgressCount = 0;
  let readyCount = 0;

  // Check status of each department
  allDepartments.forEach((dept) => {
    const deptJobs = jobs.filter((j) => j.department === dept);

    // Find the most relevant job (prefer completed, then processing, then drafting)
    const completedJob = deptJobs.find((j) => j.status === "completed");
    const processingJob = deptJobs.find(
      (j) => j.status === "processing" || j.status === "queued"
    );
    const draftingJob = deptJobs.find((j) => j.status === "drafting");

    const job = completedJob || processingJob || draftingJob;

    let status: "not-started" | "in-progress" | "ready";
    let imageCount = 0;

    if (!job || job.images.length === 0) {
      status = "not-started";
      notStartedCount++;
    } else if (job.status === "completed") {
      status = "ready";
      readyCount++;
      imageCount = job.images.filter((img) => img.status === "done").length;
    } else {
      status = "in-progress";
      inProgressCount++;
      imageCount = job.images.length;
    }

    departmentStatuses.push({
      department: dept as DepartmentId,
      label: DEPARTMENT_LABELS[dept] || dept,
      status,
      job,
      imageCount,
    });
  });

  // Sort departments: not-started first, then in-progress, then ready
  departmentStatuses.sort((a, b) => {
    const statusOrder = { "not-started": 0, "in-progress": 1, ready: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  const allReady = notStartedCount === 0 && inProgressCount === 0;
  const canExport = readyCount > 0; // Can export if at least one department is ready

  return {
    canExport,
    allReady,
    departments: departmentStatuses,
    notStartedCount,
    inProgressCount,
    readyCount,
  };
}
