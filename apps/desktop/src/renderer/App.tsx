// apps/desktop/src/renderer/App.tsx

import { useState } from "react";
import ImageDropArea from "./components/ImageDropArea";
import IngestResultView from "./IngestResultView";
import { IngestItem } from "./types";
import DiscountInputView from "./discount/DiscountInputView";
import { buildFlyerItems } from "./buildFlyerItems";
import { placeItems } from "../../../shared/flyer/layout/placeItems";

type ElectronFile = File & { path: string };

type IngestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; error: string }
  | { status: "done" };

export default function App() {
  // overall ingest state
  const [state, setState] = useState<IngestState>({ status: "idle" });
  const [placements, setPlacements] = useState<any[]>([]);


  // 🔑 ACCUMULATED IMAGE RESULTS (BATCH)
  const [imageResults, setImageResults] = useState<any[]>([]);

  const busy = state.status === "running";

  /**
   * HANDLE IMAGE DROP (BATCH)
   * This is the ONLY place image ingestion happens.
   */
  const handleDrop = async (files: ElectronFile[]) => {
    if (busy) return;

    if (!window.ufm?.ingestImages) {
      setState({
        status: "error",
        error: "window.ufm.ingestImages is NOT available"
      });
      return;
    }

    // filter valid image paths
    const imagePaths = files
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f.path))
      .map(f => f.path);

    if (!imagePaths.length) {
      setState({
        status: "error",
        error: "No valid image files dropped"
      });
      return;
    }

    setState({ status: "running" });

    try {
      // 🔑 BATCH INGEST
      const results = await window.ufm.ingestImages(imagePaths);

      // 🔑 ACCUMULATE (DO NOT OVERWRITE)
      setImageResults(prev => [...prev, ...results]);
      // 🔑 BUILD FLYER ITEMS FOR LAYOUT
      const allImages = [...imageResults, ...results];
      const flyerItems = buildFlyerItems(allImages);

      // 🔑 PLACE ITEMS INTO GRID (MAX 16)
      const placed = placeItems(flyerItems, {
        columns: 4,
        maxItems: 16
      });

      setPlacements(placed);

      setState({ status: "done" });
    } catch (err: any) {
      setState({
        status: "error",
        error: err?.message ?? String(err)
      });
    }
  };

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

      {/* 🔹 Discount input (TEXT / XLSX ONLY) */}
      <DiscountInputView />

      {/* 🔹 Image batch upload */}
      <ImageDropArea
        busy={busy}
        onDrop={handleDrop}
      />

      {/* 🔹 Error display */}
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

      {/* 🔹 Render ALL ingested image results */}
      {imageResults.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2>Ingested Images ({imageResults.length})</h2>

          {imageResults.map((result, idx) => {
            const item: IngestItem = {
              id: `image_${idx}`,
              path: result?.imagePath || "",
              status: "done",
              result
            };

            return (
              <IngestResultView
                key={item.id}
                item={item}
              />
            );
          })}
        </div>
      )}

      {/* 🔹 Layout Debug */}
        {placements.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h2>Grid Placements ({placements.length})</h2>

            <pre
              style={{
                padding: 12,
                background: "#fff",
                border: "1px solid #ccc",
                maxHeight: 300,
                overflow: "auto",
                fontSize: 12
              }}
            >
              {JSON.stringify(placements, null, 2)}
            </pre>
          </div>
        )}

    </div>
  );
}
