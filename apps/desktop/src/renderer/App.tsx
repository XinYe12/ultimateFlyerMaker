// src/renderer/App.tsx

import { useState } from "react";
import ImageDropArea from "./components/ImageDropArea";
import IngestResultView from "./IngestResultView";
import { IngestItem } from "./types";

type ElectronFile = File & { path: string };

declare global {
  interface Window {
    ufm?: {
      ingestPhoto: (path: string) => Promise<any>;
    };
  }
}

type IngestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; error: string }
  | { status: "done"; result: any };

export default function App() {
  const [state, setState] = useState<IngestState>({ status: "idle" });

  const handleDrop = async (files: ElectronFile[]) => {
    if (state.status === "running") return;

    if (!window.ufm?.ingestPhoto) {
      setState({
        status: "error",
        error: "window.ufm.ingestPhoto is NOT available"
      });
      return;
    }

    const file = files.find(f => /\.(jpg|jpeg|png)$/i.test(f.path));
    if (!file) {
      setState({
        status: "error",
        error: "No valid image file dropped"
      });
      return;
    }

    setState({ status: "running" });

    try {
      const result = await window.ufm.ingestPhoto(file.path);
      setState({ status: "done", result });
    } catch (err: any) {
      setState({
        status: "error",
        error: err?.message ?? String(err)
      });
    }
  };

  const doneItem: IngestItem | null =
    state.status === "done"
      ? {
          id: "single",
          path: "",
          status: "done",
          result: state.result
        }
      : null;

  return (
    <div
      style={{
        height: "100vh",
        padding: 32,
        boxSizing: "border-box",
        background: "#f5f5f5",
        fontFamily: "system-ui",
        overflow: "auto"
      }}
    >
      <h1>Ultimate Flyer Maker — Ingestion</h1>

      {/* 1️⃣ Drop area */}
      <ImageDropArea
        busy={state.status === "running"}
        onDrop={handleDrop}
      />

      {/* 2️⃣ Error */}
      {state.status === "error" && (
        <pre
          style={{
            marginTop: 20,
            padding: 12,
            background: "#fff0f0",
            border: "1px solid #f3b0b0",
            whiteSpace: "pre-wrap"
          }}
        >
          {state.error}
        </pre>
      )}

      {/* 3️⃣ + 4️⃣ Results (Cutout / OCR / DB / Web) */}
      {doneItem && <IngestResultView item={doneItem} />}
    </div>
  );
}

