// apps/desktop/src/renderer/App.tsx

import { useState, useEffect } from "react";
import React from "react";

import ImageDropArea from "./components/ImageDropArea";
import DiscountInputView from "./discount/DiscountInputView";
import DepartmentSelector from "./components/DepartmentSelector";

import { useIngestQueue } from "./useIngestQueue";
import { matchDiscountsInEditor } from "./services/matchDiscounts";
import { glueDiscountItems } from "./editor/glueDiscountItems";
import { buildCanvaPayload } from "../../../shared/flyer/export/buildCanvaPayload";
import { IngestItem } from "./types";
import EditorCanvas from "./editor/EditorCanvas";
import { loadDepartmentDraft } from "./editor/draftStorage";
import { loadFlyerTemplateConfig } from "./editor/loadFlyerTemplateConfig";

/* ---------------- ERROR BOUNDARY ---------------- */

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("RENDER CRASH:", error);
  }

  render() {
    const { error } = this.state;

    if (error) {
      return (
        <div style={{ padding: 32, background: "#111", color: "red" }}>
          <h1>RENDER CRASH</h1>
          <pre>{error.stack ?? error.message}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

type ElectronFile = File & { path: string };

export default function App() {
  // ---------------- EDITOR STATE ----------------
  const [templateId, setTemplateId] = useState("weekly_v1");
  const [department, setDepartment] = useState("grocery");
  const [availableDepartments, setAvailableDepartments] = useState<string[]>(["grocery"]);
  const { queue: editorQueue, enqueue, updateItem } = useIngestQueue();
  const [discountLabels, setDiscountLabels] = useState<{ titleImagePath?: string; priceImagePath?: string }[]>([]);

  // load template config → extract available departments
  useEffect(() => {
    loadFlyerTemplateConfig(templateId).then(config => {
      const depts = new Set<string>();
      config.pages.forEach(page => {
        Object.keys(page.departments).forEach(d => depts.add(d));
      });
      const deptList = Array.from(depts);
      setAvailableDepartments(deptList);
      if (!depts.has(department)) {
        setDepartment(deptList[0] ?? "grocery");
      }
    });
  }, [templateId]);

  // ---------------- CANVA EXPORT STATE ----------------
  const [canvaPayload, setCanvaPayload] = useState<any | null>(null);

  // ---------------- IMAGE INGEST ----------------
  const handleDrop = (files: ElectronFile[]) => {
    const imagePaths = files
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f.path))
      .map(f => f.path);

    if (!imagePaths.length) return;

    enqueue(imagePaths);
    setCanvaPayload(null);
  };

  // ---------------- DISCOUNT → AUTHORITATIVE TITLE ----------------
  const handleAuthoritativeTitle = (title: string) => {
    editorQueue.forEach(item => {
      if (item.status !== "done" || !item.result) return;

      updateItem(item.id, {
        result: {
          ...item.result,
          title: {
            ...item.result.title,
            en: title,
            confidence: "high",
          },
        },
        userEdited: { ...item.userEdited, title: true },
        titleReplaceBackup: undefined,
      });
    });
  };

  // ---------------- RUN MATCHING (EDITOR) ----------------
// ---------------- RUN MATCHING (EDITOR) ----------------
const runEditorMatching = async () => {
  // 1️⃣ ask backend to export discount images (order = slot order)
  const imageResults = await window.ufm.exportDiscountImages(
    await window.ufm.getDiscounts()
  );

  // 2️⃣ collect title + price image paths, in order
  setDiscountLabels(
    imageResults.map((r: any) => ({
      titleImagePath: r.titleImagePath,
      priceImagePath: r.priceImagePath,
    }))
  );
};

  // ---------------- BUILD FLYER (EXPORT ONLY) ----------------
  const buildFlyer = async () => {
    const ingestItems: IngestItem[] = editorQueue.filter(
      (i): i is IngestItem => i && typeof i === "object" && "id" in i
    );

    const matches = matchDiscountsInEditor(ingestItems);
    const gluedItems = glueDiscountItems(ingestItems, matches);

    if (!gluedItems.length) return;

    // NOTE:
    // Layout is now handled INSIDE EditorCanvas via layoutFlyer.
    // For export, we rely on EditorCanvas-generated placements later.
    // For now, Canva payload is content-only.

    const payload = buildCanvaPayload({
      items: gluedItems,
      placements: [], // TEMP: will be injected from layout engine later
    });

    setCanvaPayload(payload);
  };

  // ---------------- RENDER ----------------
  return (
    <ErrorBoundary>
      <div
        style={{
          height: "100vh",
          padding: 32,
          boxSizing: "border-box",
          background: "#f5f5f5",
          fontFamily: "system-ui",
          overflow: "auto",
        }}
      >
        <h1>Ultimate Flyer Maker</h1>

        {/* template selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {["weekly_v1", "weekly_v2"].map(id => (
            <button
              key={id}
              onClick={() => setTemplateId(id)}
              style={{
                padding: "6px 14px",
                border: "none",
                borderRadius: 6,
                background: templateId === id ? "#4C6EF5" : "#E9ECEF",
                color: templateId === id ? "#fff" : "#333",
                fontWeight: templateId === id ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {id}
            </button>
          ))}
        </div>

        <DepartmentSelector
          value={department}
          onChange={setDepartment}
          departments={availableDepartments}
        />

        <DiscountInputView
          onAuthoritativeTitle={handleAuthoritativeTitle}
          onDiscountsParsed={runEditorMatching}
        />

        <ImageDropArea busy={false} onDrop={handleDrop} />

        <div style={{ marginTop: 24 }}>
          <button
            onClick={buildFlyer}
            disabled={!editorQueue.some(q => q.status === "done")}
          >
            Build Flyer (Preview)
          </button>
        </div>
          <EditorCanvas
            editorQueue={editorQueue}
            templateId={templateId}
            department={department}
            discountLabels={discountLabels}
          />
        {canvaPayload && (
          <div style={{ marginTop: 32 }}>
            <h2>Canva Payload</h2>
            <pre
              style={{
                padding: 12,
                background: "#111",
                color: "#0ff",
                maxHeight: 400,
                overflow: "auto",
                fontSize: 12,
              }}
            >
              {JSON.stringify(canvaPayload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
