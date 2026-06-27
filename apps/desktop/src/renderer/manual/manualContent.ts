export type DiagramKey =
  | "overview"
  | "template"
  | "queue"
  | "upload"
  | "processing"
  | "editor"
  | "verify"
  | "lock"
  | "export";

export type ManualChapter = {
  id: DiagramKey;
  title: string;
  summary: string;
  steps: string[];
  tip?: string;
  warning?: string;
  diagram: DiagramKey;
};

export const MANUAL_CHAPTERS: ManualChapter[] = [
  {
    id: "overview",
    title: "Welcome & Overview",
    summary:
      "Ultimate Flyer Maker helps you produce weekly store flyers. You upload discount lists and product photos, review automated layouts, verify each product, lock every department, then export a PDF.",
    steps: [
      "From the Home screen, click **Make a Flyer** to start a new weekly flyer.",
      "Follow the progress bar at the top: **Choose Template → Upload Discounts → All Verified → Export PDF**.",
      "Work one **department** at a time (e.g. Grocery, Meat, Produce). Each department is a separate draft job.",
      "When all departments are locked, export the complete flyer as a PDF.",
    ],
    tip: "Your drafts are saved automatically. You can close the app and resume later from the Job Queue.",
    diagram: "overview",
  },
  {
    id: "template",
    title: "Choose a Template",
    summary:
      "Pick the flyer layout for this week. Built-in templates **Weekly v1** and **Weekly v2** are ready to use for training and production.",
    steps: [
      "After clicking **Make a Flyer**, you arrive at the template picker.",
      "Click a template thumbnail (**Weekly v1** or **Weekly v2**) to select it.",
      "If you see an **Unfinished draft** badge, you can resume work on that template.",
      "You are taken to the **Job Queue** for the selected template.",
    ],
    tip: "Stick to one template per flyer week. Switching templates starts a separate set of department jobs.",
    diagram: "template",
  },
  {
    id: "queue",
    title: "Job Queue & Departments",
    summary:
      "The Job Queue shows every department in your template and its status. Set the flyer week, then open each department to upload discounts.",
    steps: [
      "Confirm the **flyer week** date at the top (defaults to the current cycle's Friday).",
      "Review the department cards — statuses include **Not started**, **In progress**, **Done**, and **Locked**.",
      "Click a department card (e.g. **Grocery**) to open its upload panel.",
      "Repeat for each department you need to fill this week.",
    ],
    tip: "Complete departments in any order, but every department on the template must be locked before you can export.",
    diagram: "queue",
  },
  {
    id: "upload",
    title: "Upload Discounts & Images",
    summary:
      "For each department, provide the discount list and optionally product photos. The app parses prices and titles, then queues automation.",
    steps: [
      "In the job panel, give the job a name if needed and confirm the department.",
      "Add discounts by pasting text **or** uploading an `.xlsx` spreadsheet (use **Export Example** if you need the format).",
      "Drag and drop product photos (JPG/PNG), or click to browse. Photos help the matcher find the right cutout.",
      "Click **Queue Job** (or **Start**) to begin processing.",
    ],
    tip: "You can upload discounts only — the pipeline will search for product images automatically when photos are missing.",
    warning: "Do not open the editor while a job shows **Processing** or **Queued**. Wait for automation to finish, or click **Abort** to cancel.",
    diagram: "upload",
  },
  {
    id: "processing",
    title: "Wait for Automation",
    summary:
      "While a job runs, the app matches products, removes backgrounds, and places cards on the flyer canvas. The editor is locked during this phase.",
    steps: [
      "Watch the department card or job panel for progress (e.g. images processed).",
      "When processing completes, the job status changes and the department opens in the **Editor**.",
      "If a job fails, read the error message and retry with corrected files.",
      "Use **Abort** only if you need to stop a runaway job — you will need to re-queue afterward.",
    ],
    warning: "The editor canvas and toolbar are dimmed and locked while automation is active. This is normal.",
    diagram: "processing",
  },
  {
    id: "editor",
    title: "Review in the Editor",
    summary:
      "Fine-tune product placement, titles, prices, and layout before verification. Switch departments from the toolbar without leaving the editor.",
    steps: [
      "Use the **department picker** (hamburger menu) to switch between departments.",
      "Open the **Images** panel to browse project images; use **History** to undo steps.",
      "Adjust **Rows** / **Cols** / **Flip** for card-based departments when products do not fit.",
      "Right-click a product to replace its image, search the database, or edit discount details.",
      "Use **Ctrl+C** / **Ctrl+V** to copy and paste product cards; **Ctrl+Z** / **Ctrl+Y** for undo/redo.",
    ],
    tip: "Collapse the header (▲) for a larger canvas view while reviewing.",
    diagram: "editor",
  },
  {
    id: "verify",
    title: "Verify Products",
    summary:
      "Verification is a step-by-step QA pass for every product: title, image, then price. Flag items that need correction before locking.",
    steps: [
      "Click **✓ Verify** in the editor toolbar.",
      "For each product, review **TITLE**, then **IMAGE**, then **PRICE** using the step chips.",
      "Approve each step or flag an item for follow-up. Edit titles/prices inline when needed.",
      "Replace a bad image via database search or Google image search from within the verify panel.",
      "When finished, the button shows **✓ Verified**.",
    ],
    tip: "Re-open verification anytime before locking if you make further edits.",
    diagram: "verify",
  },
  {
    id: "lock",
    title: "Lock Departments",
    summary:
      "Locking confirms a department is complete. All departments on the template must be locked before export is enabled.",
    steps: [
      "After verification, click **🔒 Lock Department** in the editor toolbar.",
      "The button turns red (**🔒 Locked**) when locked. Locked departments cannot be cleared or re-edited without unlocking.",
      "Switch to the next department and repeat: upload → process → edit → verify → lock.",
      "Return to the **Job Queue** to see which departments still need work.",
    ],
    warning: "Unlocking a department allows edits but removes it from export readiness until you verify and lock again.",
    diagram: "lock",
  },
  {
    id: "export",
    title: "Export PDF",
    summary:
      "When every department is locked, export the full flyer as a PDF file.",
    steps: [
      "Confirm the workflow bar shows **All Verified** (step 3) with all dots green.",
      "Click **Export PDF** on the workflow bar or use the export action on the Job Queue.",
      "Wait for **Preparing flyer for export** and the progress indicator to complete.",
      "Save the PDF to your chosen folder when prompted.",
    ],
    tip: "Exported PDFs are rasterized images — they are print-ready but not editable vector files.",
    warning:
      "Before exporting: all template departments must be locked; do not clear the cutout cache while jobs are open.",
    diagram: "export",
  },
];

export const CHAPTER_BY_ID = Object.fromEntries(
  MANUAL_CHAPTERS.map((ch) => [ch.id, ch])
) as Record<DiagramKey, ManualChapter>;

export function chapterIndex(id: string): number {
  const idx = MANUAL_CHAPTERS.findIndex((ch) => ch.id === id);
  return idx >= 0 ? idx : 0;
}

export function initialChapterFromHash(): DiagramKey {
  const hash = window.location.hash.replace(/^#/, "").trim();
  if (hash && hash in CHAPTER_BY_ID) return hash as DiagramKey;
  const params = new URLSearchParams(window.location.search);
  const queryChapter = params.get("chapter");
  if (queryChapter && queryChapter in CHAPTER_BY_ID) return queryChapter as DiagramKey;
  return "overview";
}
