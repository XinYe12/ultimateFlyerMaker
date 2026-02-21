// apps/desktop/src/renderer/jobs/JobCreationPanel.tsx
// Panel for creating a new flyer job with parallel image + discount input

import { useState, useRef } from "react";
import { FlyerJob, DepartmentId, DiscountInput } from "../types";
import DepartmentSelector from "../components/DepartmentSelector";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";

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
}: Props) {
  const [templateId, setTemplateId] = useState("weekly_v2");
  const [department, setDepartment] = useState<DepartmentId>("grocery");
  const [discountText, setDiscountText] = useState("");
  const [xlsxPath, setXlsxPath] = useState<string | null>(null);
  const [discountSource, setDiscountSource] = useState<"text" | "xlsx" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "center" }}>
            {TEMPLATE_OPTIONS.map(t => (
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
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
            Department
          </label>
          <DepartmentSelector
            value={department}
            onChange={d => setDepartment(d as DepartmentId)}
            departments={availableDepartments}
          />
        </div>

        <Button variant="primary" size="lg" onClick={() => onCreate(templateId, department)}>
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
  const progressPercent = job.progress.totalImages > 0
    ? Math.round((job.progress.processedImages / job.progress.totalImages) * 100)
    : 0;

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
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-lg)",
            fontWeight: "var(--font-semibold)",
            opacity: isProcessing ? 0.6 : 1,
            fontFamily: "var(--font-sans)",
          }}
        />
      </div>

      {/* Template + Department Row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
            Template
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            {TEMPLATE_OPTIONS.map(t => (
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
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
            Department
          </label>
          <DepartmentSelector
            value={job.department}
            onChange={d => onSetDepartment(d as DepartmentId)}
            departments={availableDepartments}
          />
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
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-success)", marginTop: 4 }}>
              XLSX loaded: {xlsxPath.split("/").pop()}
            </div>
          )}
        </div>
      </div>

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

        {/* Progress Bar */}
        {isProcessing && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", fontWeight: "var(--font-medium)" }}>
                {job.progress.currentStep}
              </span>
              <span style={{ fontSize: 13, color: "#868E96" }}>
                {job.progress.processedImages}/{job.progress.totalImages} images
              </span>
            </div>
            <div
              style={{
                width: "100%",
                height: 8,
                background: "#E9ECEF",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, var(--color-primary) 0%, #5F3DC4 100%)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div style={{ textAlign: "center", marginTop: 4, fontSize: 12, color: "#868E96" }}>
              {progressPercent}%
            </div>
          </div>
        )}

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
