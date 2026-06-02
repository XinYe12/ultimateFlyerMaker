// apps/desktop/src/renderer/jobs/JobCreationPanel.tsx
// Panel for creating a new flyer job with parallel image + discount input

import { useState, useEffect, useRef } from "react";
import { FlyerJob, DepartmentId, DiscountInput } from "../types";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { listCustomTemplates } from "../editor/customTemplateStorage";
import JobPipelineTimingsSummary from "./JobPipelineTimingsSummary";

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
  cosmetics: "Cosmetics",
};

const TEMPLATE_OPTIONS = [
  { id: "weekly_v1", label: "Weekly V1" },
  { id: "weekly_v2", label: "Weekly V2" },
];

type Props = {
  job: FlyerJob | null;
  availableDepartments: string[];
  onAddImages: (paths: string[]) => void;
  onRemoveImage: (imageId: string) => void;
  onSetDiscount: (discount: DiscountInput | null) => void;
  onSetName: (name: string) => void;
  onSetDepartment: (department: DepartmentId) => void;
  onSetTemplate: (templateId: string) => void;
  onQueueJob: () => void;
  onCreate: (templateId: string, department: DepartmentId) => void;
  lockedTemplateId?: string;
};

type ElectronFile = File & { path: string };

export default function JobCreationPanel({
  job,
  availableDepartments,
  onAddImages,
  onRemoveImage,
  onSetDiscount,
  onSetName,
  onSetDepartment,
  onSetTemplate,
  onQueueJob,
  onCreate,
  lockedTemplateId,
}: Props) {
  const [templateId, setTemplateId] = useState(lockedTemplateId ?? "weekly_v2");
  const [department, setDepartment] = useState<DepartmentId>("grocery");
  const [discountText, setDiscountText] = useState("");
  const [xlsxPath, setXlsxPath] = useState<string | null>(null);
  const [discountSource, setDiscountSource] = useState<"text" | "xlsx" | null>(null);
  const [xlsxParsedCount, setXlsxParsedCount] = useState<number | null>(null);
  const [allTemplateOptions, setAllTemplateOptions] = useState([...TEMPLATE_OPTIONS]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const custom = listCustomTemplates().map(t => ({ id: t.templateId, label: t.name }));
    setAllTemplateOptions([...TEMPLATE_OPTIONS, ...custom]);
  }, []);

  const resolveTemplateName = (id: string) =>
    allTemplateOptions.find(t => t.id === id)?.label ?? id;

  // If no job exists, show creation form
  if (!job) {
    return (
      <div
        style={{
          background: "var(--color-bg)",
          border: "2px dashed var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: 24,
          textAlign: "center",
        }}
      >
        <h3 style={{ margin: "0 0 16px", color: "var(--color-text-muted)" }}>Create New Flyer Job</h3>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: "var(--font-medium)" }}>
            Template
          </label>
          {lockedTemplateId ? (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
              {resolveTemplateName(lockedTemplateId)}
            </span>
          ) : (
            <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "center" }}>
              {allTemplateOptions.map(t => (
                <Button
                  key={t.id}
                  variant={templateId === t.id ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setTemplateId(t.id)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
            Department
          </label>
          <select
            value={department}
            onChange={e => setDepartment(e.target.value as DepartmentId)}
            style={{
              width: "100%", padding: "8px 12px",
              border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-base)", fontFamily: "var(--font-sans)",
              background: "var(--color-bg)", color: "var(--color-text)",
              cursor: "pointer", boxSizing: "border-box",
            }}
          >
            {availableDepartments.map(dept => (
              <option key={dept} value={dept}>
                {DEPARTMENT_LABELS[dept] || dept}
              </option>
            ))}
          </select>
        </div>

        <Button variant="primary" size="lg" onClick={() => onCreate(lockedTemplateId ?? templateId, department)}>
          Start New Job
        </Button>
      </div>
    );
  }

  // Job exists - show editing panel
  const handleImageDrop = (files: ElectronFile[]) => {
    const imagePaths = files
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f.path))
      .map(f => f.path);
    if (imagePaths.length > 0) {
      onAddImages(imagePaths);
    }
  };

  const handleDiscountFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const file = fileList[0];
    const name = file.name.toLowerCase();

    if (name.endsWith(".xlsx")) {
      const path = (file as any).path;
      if (path) {
        setXlsxPath(path);
        setDiscountSource("xlsx");
        setDiscountText("");
        onSetDiscount({ type: "xlsx", source: path, status: "pending" });
        setXlsxParsedCount(null);
        // Pre-parse using the job's actual department, not the local creation-form state
        const deptForParse = job?.department ?? department;
        window.ufm.parseDiscountXlsx(path, deptForParse).then((items: any[]) => {
          setXlsxParsedCount(items.length);
          onSetDiscount({ type: "xlsx", source: path, parsedItems: items, status: "done" });
        }).catch(() => {
          setXlsxParsedCount(0);
          onSetDiscount({ type: "xlsx", source: path, status: "error" });
        });
      }
    } else {
      const text = await file.text();
      setDiscountText(text.trim());
      setDiscountSource("text");
      setXlsxPath(null);
      onSetDiscount({ type: "text", source: text.trim(), status: "pending" });
    }
  };

  const handleTextChange = (text: string) => {
    setDiscountText(text);
    setDiscountSource(text.trim() ? "text" : null);
    setXlsxPath(null);
    if (text.trim()) {
      onSetDiscount({ type: "text", source: text.trim(), status: "pending" });
    } else {
      onSetDiscount(null);
    }
  };

  const hasDiscount = xlsxPath !== null || discountText.trim().length > 0;
  const canQueue = job.images.length > 0 || hasDiscount;
  const isProcessing = job.status === "queued" || job.status === "processing";

  return (
    <Card style={{ padding: 20 }}>
      {/* Job Name */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <input
          type="text"
          value={job.name}
          onChange={e => onSetName(e.target.value)}
          placeholder="Job name..."
          disabled={isProcessing}
          autoFocus
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-lg)",
            fontWeight: "var(--font-semibold)",
            opacity: isProcessing ? 0.6 : 1,
            fontFamily: "var(--font-sans)",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Template + Department Row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
            Template
          </label>
          {lockedTemplateId ? (
            <span style={{ fontSize: "var(--text-sm)" }}>{resolveTemplateName(lockedTemplateId)}</span>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              {allTemplateOptions.map(t => (
                <Button
                  key={t.id}
                  variant={job.templateId === t.id ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => onSetTemplate(t.id)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
            Department
          </label>
          <select
            value={job.department}
            onChange={e => onSetDepartment(e.target.value as DepartmentId)}
            disabled={isProcessing}
            style={{
              width: "100%", padding: "7px 10px",
              border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-base)", fontFamily: "var(--font-sans)",
              background: "var(--color-bg)", color: "var(--color-text)",
              cursor: isProcessing ? "not-allowed" : "pointer", boxSizing: "border-box",
              opacity: isProcessing ? 0.6 : 1,
            }}
          >
            {availableDepartments.map(dept => (
              <option key={dept} value={dept}>
                {DEPARTMENT_LABELS[dept] || dept}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Helper text */}
      <p style={{ margin: "0 0 16px", fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
        Add images and/or a discount list, then start processing.
      </p>

      {/* Parallel Input: Images + Discounts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
        {/* Images Panel */}
        <div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: "var(--font-semibold)", fontSize: "var(--text-base)" }}>
            Product Images ({job.images.length})
          </label>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              handleImageDrop(Array.from(e.dataTransfer.files) as ElectronFile[]);
            }}
            style={{
              border: "2px dashed var(--color-border)",
              borderRadius: "var(--radius-sm)",
              padding: 20,
              textAlign: "center",
              cursor: "pointer",
              background: "var(--color-bg-subtle)",
              minHeight: 120,
            }}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.multiple = true;
              input.onchange = e => {
                const files = (e.target as HTMLInputElement).files;
                if (files) {
                  handleImageDrop(Array.from(files) as ElectronFile[]);
                }
              };
              input.click();
            }}
          >
            <div style={{ fontWeight: "var(--font-semibold)", marginBottom: 4 }}>Drop Images Here</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>JPG, PNG (multiple allowed)</div>
          </div>

          {/* Image list */}
          {job.images.length > 0 && (
            <div style={{ marginTop: 12, maxHeight: 150, overflowY: "auto" }}>
              {job.images.map((img, idx) => (
                <div
                  key={img.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    background: idx % 2 === 0 ? "var(--color-bg-subtle)" : "var(--color-bg)",
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {img.path.split("/").pop()}
                  </span>
                  <button
                    onClick={() => onRemoveImage(img.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-text-muted)",
                      cursor: "pointer",
                      padding: "2px 6px",
                    }}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Discounts Panel */}
        <div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: "var(--font-semibold)", fontSize: "var(--text-base)" }}>
            Discount List {discountSource && `(${discountSource.toUpperCase()})`}
          </label>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              handleDiscountFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: "2px dashed var(--color-border)",
              borderRadius: "var(--radius-sm)",
              padding: 12,
              textAlign: "center",
              cursor: "pointer",
              background: "var(--color-bg-subtle)",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
              Drop file or click: TXT, CSV, XLSX
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept=".txt,.csv,.tsv,.xlsx"
            onChange={e => handleDiscountFiles(e.target.files)}
          />

          <textarea
            value={discountText}
            onChange={e => handleTextChange(e.target.value)}
            disabled={discountSource === "xlsx"}
            placeholder="Or paste discount lines here..."
            style={{
              width: "100%",
              height: 100,
              padding: 10,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-sm)",
              resize: "none",
              fontFamily: "monospace",
            }}
          />

          {xlsxPath && (
            <div style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>
              {xlsxParsedCount === null && (
                <span style={{ color: "var(--color-text-muted)" }}>Parsing {xlsxPath.split(/[\\/]/).pop()}…</span>
              )}
              {xlsxParsedCount !== null && xlsxParsedCount > 0 && (
                <span style={{ color: "var(--color-success)" }}>
                  {xlsxPath.split(/[\\/]/).pop()} — {xlsxParsedCount} {DEPARTMENT_LABELS[job?.department ?? ""] || job?.department} items loaded
                </span>
              )}
              {xlsxParsedCount === 0 && (
                <span style={{ color: "var(--color-warning, #b45309)" }}>
                  No {DEPARTMENT_LABELS[job?.department ?? ""] || job?.department} items found in this xlsx. Add a "{DEPARTMENT_LABELS[job?.department ?? ""] || job?.department}" section or use a different file.
                </span>
              )}
            </div>
          )}
        </div>
      </div>

        {/* Live progress + per-item pipeline timings (main JobProcessor) */}
        {isProcessing && (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              background: "var(--color-bg-subtle)",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-sm)",
              color: "var(--color-text-muted)",
            }}
          >
            <div style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>Status</div>
            {job.progress.currentStep}
            {job.progress.totalImages > 0 && (
              <span style={{ marginLeft: 8 }}>
                ({job.progress.processedImages}/{job.progress.totalImages})
              </span>
            )}
          </div>
        )}

        {(isProcessing || job.status === "completed") && (
          <JobPipelineTimingsSummary processedImages={job.result?.processedImages ?? []} />
        )}

        {/* Start Processing Button */}
      <div style={{ marginTop: 20 }}>
        <div style={{ textAlign: "right", marginBottom: 12 }}>
          <Button
            variant="primary"
            size="lg"
            onClick={onQueueJob}
            disabled={!canQueue || isProcessing}
            style={
              canQueue && !isProcessing
                ? { background: "var(--color-success)" }
                : undefined
            }
          >
            {isProcessing ? "Processing..." : `Start Processing (${job.images.length} images)`}
          </Button>
        </div>


        {/* Completion Message */}
        {job.status === "completed" && (
          <div
            style={{
              padding: "var(--space-3)",
              background: "#D3F9D8",
              color: "var(--color-success)",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-base)",
              fontWeight: "var(--font-medium)",
              textAlign: "center",
            }}
          >
            ✓ Job completed successfully!
          </div>
        )}

      </div>
    </Card>
  );
}
