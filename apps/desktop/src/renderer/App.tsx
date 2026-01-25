// apps/desktop/src/renderer/App.tsx

import { useState } from "react";
import React from "react";

import ImageDropArea from "./components/ImageDropArea";
import DiscountInputView from "./discount/DiscountInputView";
import DepartmentSelector from "./components/DepartmentSelector";

import { useIngestQueue } from "./useIngestQueue";
import { matchDiscountsInEditor } from "./services/matchDiscounts";
import { glueDiscountItems } from "./editor/glueDiscountItems";
import { buildCanvaPayload } from "../../../shared/flyer/export/buildCanvaPayload";

import EditorCanvas from "./editor/EditorCanvas";
import { loadDepartmentDraft } from "./editor/draftStorage";

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
  const [department, setDepartment] = useState("grocery");
  const { queue: editorQueue, enqueue, updateItem } = useIngestQueue();

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
  const runEditorMatching = async () => {
    const images = editorQueue
      .filter(q => q.status === "done" && q.result)
      .map(q => q.result);

    if (!images.length) return;

    const matched = await matchDiscountsInEditor(images);

    matched.forEach((m: any, idx: number) => {
      const item = editorQueue[idx];
      if (!item || !item.result) return;

      updateItem(item.id, {
        result: {
          ...item.result,
          discount: m.discount,
          matchScore: m.matchScore,
          matchConfidence: m.matchConfidence,
        },
      });
    });
  };

  // ---------------- BUILD FLYER (EXPORT ONLY) ----------------
  const buildFlyer = async () => {
    const gluedItems = glueDiscountItems(editorQueue);
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

        <DepartmentSelector
          value={department}
          onChange={setDepartment}
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
          editorQueue={glueDiscountItems(editorQueue)}
          templateId="weekly_v1"
          department={department}
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
