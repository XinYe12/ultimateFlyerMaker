// apps/desktop/src/renderer/jobs/JobCreationPanel.tsx
// Panel for creating a new flyer job with parallel image + discount input

import { useState, useRef } from "react";
import { FlyerJob, DepartmentId, DiscountInput } from "../types";
import DepartmentSelector from "../components/DepartmentSelector";

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
          background: "#fff",
          border: "2px dashed #DEE2E6",
          borderRadius: 8,
          padding: 24,
          textAlign: "center",
        }}
      >
        <h3 style={{ margin: "0 0 16px", color: "#495057" }}>Create New Flyer Job</h3>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
            Template
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            {TEMPLATE_OPTIONS.map(t => (
              <button
                key={t.id}
                onClick={() => setTemplateId(t.id)}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: 6,
                  background: templateId === t.id ? "#4C6EF5" : "#E9ECEF",
                  color: templateId === t.id ? "#fff" : "#333",
                  fontWeight: templateId === t.id ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
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

        <button
          onClick={() => onCreate(templateId, department)}
          style={{
            padding: "12px 24px",
            background: "#4C6EF5",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Start New Job
        </button>
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

  const canQueue = job.images.length > 0;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #DEE2E6",
        borderRadius: 8,
        padding: 20,
      }}
    >
      {/* Job Name */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={job.name}
          onChange={e => onSetName(e.target.value)}
          placeholder="Job name..."
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid #DEE2E6",
            borderRadius: 6,
            fontSize: 16,
            fontWeight: 600,
          }}
        />
      </div>

      {/* Template + Department Row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#868E96" }}>
            Template
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            {TEMPLATE_OPTIONS.map(t => (
              <button
                key={t.id}
                onClick={() => onSetTemplate(t.id)}
                style={{
                  padding: "6px 12px",
                  border: "none",
                  borderRadius: 4,
                  background: job.templateId === t.id ? "#4C6EF5" : "#E9ECEF",
                  color: job.templateId === t.id ? "#fff" : "#333",
                  fontWeight: job.templateId === t.id ? 600 : 500,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#868E96" }}>
            Department
          </label>
          <DepartmentSelector
            value={job.department}
            onChange={d => onSetDepartment(d as DepartmentId)}
            departments={availableDepartments}
          />
        </div>
      </div>

      {/* Parallel Input: Images + Discounts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Images Panel */}
        <div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
            Product Images ({job.images.length})
          </label>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              handleImageDrop(Array.from(e.dataTransfer.files) as ElectronFile[]);
            }}
            style={{
              border: "2px dashed #DEE2E6",
              borderRadius: 6,
              padding: 20,
              textAlign: "center",
              cursor: "pointer",
              background: "#F8F9FA",
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
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop Images Here</div>
            <div style={{ fontSize: 12, color: "#868E96" }}>JPG, PNG (multiple allowed)</div>
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
                    background: idx % 2 === 0 ? "#F8F9FA" : "#fff",
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
                      color: "#868E96",
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
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
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
              border: "2px dashed #DEE2E6",
              borderRadius: 6,
              padding: 12,
              textAlign: "center",
              cursor: "pointer",
              background: "#F8F9FA",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 12, color: "#868E96" }}>
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
              border: "1px solid #DEE2E6",
              borderRadius: 6,
              fontSize: 13,
              resize: "none",
              fontFamily: "monospace",
            }}
          />

          {xlsxPath && (
            <div style={{ fontSize: 12, color: "#2F9E44", marginTop: 4 }}>
              XLSX loaded: {xlsxPath.split("/").pop()}
            </div>
          )}
        </div>
      </div>

      {/* Queue Button */}
      <div style={{ marginTop: 20, textAlign: "right" }}>
        <button
          onClick={onQueueJob}
          disabled={!canQueue}
          style={{
            padding: "12px 32px",
            background: canQueue ? "#2F9E44" : "#ADB5BD",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: canQueue ? "pointer" : "not-allowed",
            fontSize: 14,
          }}
        >
          Queue Job ({job.images.length} images)
        </button>
      </div>
    </div>
  );
}
