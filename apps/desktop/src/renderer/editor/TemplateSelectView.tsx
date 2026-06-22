import React, { useState } from "react";
import { CustomFlyerTemplateConfig, CustomTemplatePage, DepartmentAreaDef, isCardDepartment, loadFlyerTemplateConfig } from "./loadFlyerTemplateConfig";
import { listCustomTemplates, deleteCustomTemplate, saveCustomTemplate } from "./customTemplateStorage";
import { ALL_REPLICAS } from "./replicaTemplates";
import { FlyerJob } from "../types";

type Props = {
  jobs: FlyerJob[];
  onSelect: (templateId: string) => void;
  onCreateNew: () => void;
  onEdit: (template: CustomFlyerTemplateConfig) => void;
};

const BUILT_IN_TEMPLATES = [
  {
    templateId: "weekly_v1",
    name: "Weekly v1",
    thumbnail: "/assets/flyer_templates/weekly_v1.png",
  },
  {
    templateId: "weekly_v2",
    name: "Weekly v2",
    thumbnail: "/assets/flyer_templates/weekly_v2/1.png",
  },
];

function draftSummary(templateId: string, jobs: FlyerJob[]): { deptCount: number; itemCount: number } | null {
  const relevant = jobs.filter(j =>
    j.templateId === templateId &&
    (j.status === "drafting" || j.status === "completed") &&
    ((j.images?.length ?? 0) > 0 || (j.result?.processedImages?.length ?? 0) > 0)
  );
  if (relevant.length === 0) return null;
  const itemCount = relevant.reduce((sum, j) =>
    sum + Math.max(j.images?.length ?? 0, j.result?.processedImages?.length ?? 0), 0
  );
  return { deptCount: relevant.length, itemCount };
}

function DraftBadge({ summary }: { summary: { deptCount: number; itemCount: number } }) {
  return (
    <div style={{
      position: "absolute",
      top: 8, right: 8,
      background: "#f59e0b",
      color: "#fff",
      fontSize: 10,
      fontWeight: 700,
      padding: "3px 7px",
      borderRadius: 10,
      letterSpacing: "0.02em",
      whiteSpace: "nowrap",
      boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
      zIndex: 2,
    }}>
      {summary.deptCount} dept{summary.deptCount !== 1 ? "s" : ""} · {summary.itemCount} item{summary.itemCount !== 1 ? "s" : ""}
    </div>
  );
}

function UnfinishedDraftLabel() {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      color: "#d97706",
      display: "flex",
      alignItems: "center",
      gap: 4,
      marginTop: 2,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", display: "inline-block", flexShrink: 0 }} />
      Unfinished draft
    </div>
  );
}

function fmtLabel(key: string): string {
  return key.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function imageUrl(p?: string): string | undefined {
  if (!p) return undefined;
  if (p.startsWith("data:") || p.startsWith("http://") || p.startsWith("https://")) return p;
  if (p.startsWith("file://")) return p;
  if (p.startsWith("/")) return p;
  return `file:///${p.replace(/\\/g, "/")}`;
}

function CustomBoxPreview({ template }: { template: CustomFlyerTemplateConfig }) {
  const page = template.pages[0];
  if (!page || (page.boxes.length === 0 && !page.backgroundImage)) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>
        No boxes
      </div>
    );
  }
  const scaleX = 160 / page.canvasWidth;
  const scaleY = 120 / page.canvasHeight;
  const scale = Math.min(scaleX, scaleY);
  const w = page.canvasWidth * scale;
  const h = page.canvasHeight * scale;
  return (
    <div style={{ width: w, height: h, position: "relative", overflow: "hidden", background: page.backgroundImage ? `url(${imageUrl(page.backgroundImage)}) center/cover` : (page.backgroundColor ?? "#fff") }}>
      <svg width={w} height={h} style={{ display: "block", position: "absolute", inset: 0 }}>
        {page.boxes.map(box => {
          const type = box.boxType ?? "product";
          const fill = box.color === "transparent" ? "none" : box.color;
          return (
            <g key={box.id}>
              <rect
                x={box.x * scale}
                y={box.y * scale}
                width={box.width * scale}
                height={box.height * scale}
                fill={fill}
                stroke={box.color === "transparent" ? "#e2e8f0" : undefined}
                strokeDasharray={box.color === "transparent" ? "2,2" : undefined}
              />
              {(type === "product" || type === "text") && (
                <text
                  x={box.x * scale + 4}
                  y={box.y * scale + 14}
                  fontSize={Math.min(10, (box.fontSize ?? 24) * scale * 0.4)}
                  fill={box.textColor}
                  fontWeight="bold"
                >
                  {(type === "text" ? (box.content ?? box.label) : box.label).slice(0, 20)}
                  {(type === "text" ? (box.content ?? box.label) : box.label).length > 20 ? "…" : ""}
                </text>
              )}
              {type === "image" && (
                <text x={box.x * scale + box.width * scale / 2} y={box.y * scale + box.height * scale / 2} fontSize={8} fill="#94a3b8" textAnchor="middle" dominantBaseline="middle">img</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function TemplateSelectView({ jobs, onSelect, onCreateNew, onEdit }: Props) {
  const [customTemplates, setCustomTemplates] = useState<CustomFlyerTemplateConfig[]>(() => listCustomTemplates());

  const handleLoadExamples = () => {
    ALL_REPLICAS.forEach(saveCustomTemplate);
    setCustomTemplates(listCustomTemplates());
  };

  const handleDelete = (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    if (!confirm("Delete this template? This cannot be undone.")) return;
    deleteCustomTemplate(templateId);
    setCustomTemplates(listCustomTemplates());
  };

  const handleCopyBuiltIn = async (e: React.MouseEvent, builtIn: typeof BUILT_IN_TEMPLATES[0]) => {
    e.stopPropagation();
    try {
      const config = await loadFlyerTemplateConfig(builtIn.templateId);
      const uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const customId = `${builtIn.templateId}_copy_${uid}`;

      const pages: CustomTemplatePage[] = await Promise.all(
        config.pages.map(async (page) => {
          let canvasWidth = page.canvasWidth ?? 1650;
          let canvasHeight = page.canvasHeight ?? 2400;

          if (page.imagePath) {
            try {
              const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = reject;
                img.src = page.imagePath!;
              });
              canvasWidth = dims.width;
              canvasHeight = dims.height;
            } catch { /* use defaults */ }
          }

          const departmentAreas: DepartmentAreaDef[] = Object.entries(page.departments)
            .flatMap(([key, dept]) => {
              if (isCardDepartment(dept)) {
                return [{ departmentKey: key, label: fmtLabel(key), rows: dept.rows, productRegion: dept.region }];
              }
              if (!("slots" in dept)) {
                const d = dept as { x: number; y: number; width: number; height: number };
                return [{ departmentKey: key, label: fmtLabel(key), rows: 1, productRegion: d }];
              }
              return [];
            });

          return {
            pageId: page.pageId,
            canvasWidth,
            canvasHeight,
            boxes: page.boxes ?? [],
            departmentAreas,
            backgroundImage: page.imagePath,
            backgroundColor: page.backgroundColor,
          };
        })
      );

      const customTemplate: CustomFlyerTemplateConfig = {
        templateId: customId,
        isCustom: true,
        name: `${builtIn.name} (Copy)`,
        pages,
      };

      saveCustomTemplate(customTemplate);
      setCustomTemplates(listCustomTemplates());
    } catch (err) {
      alert(`Failed to copy template: ${err}`);
    }
  };

  const cardStyle: React.CSSProperties = {
    width: 180, minHeight: 160,
    background: "#fff",
    borderRadius: 10,
    boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
    border: "2px solid transparent",
    cursor: "pointer",
    display: "flex", flexDirection: "column",
    overflow: "hidden",
    transition: "border-color 0.15s, box-shadow 0.15s",
    position: "relative",
  };

  const cardImgStyle: React.CSSProperties = {
    width: "100%", height: 120,
    objectFit: "contain",
    background: "#f1f5f9",
    display: "block",
  };

  const cardLabelStyle: React.CSSProperties = {
    padding: "8px 10px",
    fontWeight: 600, fontSize: 13, color: "#1e293b",
    background: "#fff",
  };

  return (
    <>
      <div style={{
        minHeight: "100vh", background: "#f0f2f5",
        padding: "40px 48px",
        fontFamily: "var(--font-sans, sans-serif)",
      }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>Select a Template</h1>
        <p style={{ color: "#64748b", marginBottom: 36, fontSize: 15 }}>Choose a template to start building your flyer.</p>

        {/* Built-in templates */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#475569", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>Built-in</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {BUILT_IN_TEMPLATES.map(t => {
              const draft = draftSummary(t.templateId, jobs);
              return (
                <div
                  key={t.templateId}
                  style={cardStyle}
                  onClick={() => onSelect(t.templateId)}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#3b82f6"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(59,130,246,0.20)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "transparent"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.10)"; }}
                >
                  {draft && <DraftBadge summary={draft} />}
                  <img src={t.thumbnail} alt={t.name} style={cardImgStyle} />
                  <div style={{ ...cardLabelStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      {t.name}
                      {draft && <UnfinishedDraftLabel />}
                    </div>
                    <button
                      title="Copy to custom templates for editing"
                      onClick={e => handleCopyBuiltIn(e, t)}
                      style={{ padding: "2px 7px", border: "none", borderRadius: 4, background: "#dbeafe", cursor: "pointer", fontSize: 12, color: "#3b82f6", fontWeight: 600, flexShrink: 0 }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Custom templates */}
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#475569", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>Custom</h2>
            <button
              onClick={handleLoadExamples}
              style={{ padding: "4px 12px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#f8fafc", color: "#475569", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              title="Load built-in template replicas as custom templates to demonstrate the system"
            >
              Load Example Templates
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {customTemplates.map(t => {
              const draft = draftSummary(t.templateId, jobs);
              return (
                <div
                  key={t.templateId}
                  style={cardStyle}
                  onClick={() => onSelect(t.templateId)}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#3b82f6"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(59,130,246,0.20)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "transparent"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.10)"; }}
                >
                  {draft && <DraftBadge summary={draft} />}
                  <div style={{ width: "100%", height: 120, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CustomBoxPreview template={t} />
                  </div>
                  <div style={{ ...cardLabelStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div>{t.name}</div>
                      {draft && <UnfinishedDraftLabel />}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button
                        title="Edit template"
                        onClick={e => { e.stopPropagation(); onEdit(t); }}
                        style={{ padding: "2px 7px", border: "none", borderRadius: 4, background: "#dbeafe", cursor: "pointer", fontSize: 12, color: "#3b82f6", fontWeight: 600 }}
                      >
                        Edit
                      </button>
                      <button
                        title="Delete template"
                        onClick={e => handleDelete(e, t.templateId)}
                        style={{ padding: "2px 7px", border: "none", borderRadius: 4, background: "#fee2e2", cursor: "pointer", fontSize: 12, color: "#ef4444", fontWeight: 600 }}
                      >
                        X
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* + Create New */}
            <div
              style={{ ...cardStyle, border: "2px dashed #cbd5e1", background: "#f8fafc", alignItems: "center", justifyContent: "center", minHeight: 160 }}
              onClick={onCreateNew}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#3b82f6"; (e.currentTarget as HTMLDivElement).style.background = "#eff6ff"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#cbd5e1"; (e.currentTarget as HTMLDivElement).style.background = "#f8fafc"; }}
            >
              <div style={{ textAlign: "center", padding: 20 }}>
                <div style={{ fontSize: 36, color: "#94a3b8", lineHeight: 1, marginBottom: 8 }}>+</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#64748b" }}>Create New<br />Template</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
