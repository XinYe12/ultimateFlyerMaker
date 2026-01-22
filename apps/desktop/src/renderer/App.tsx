// apps/desktop/src/renderer/App.tsx

import { useState } from "react";
import ImageDropArea from "./components/ImageDropArea";
import IngestResultView from "./IngestResultView";
import DiscountInputView from "./discount/DiscountInputView";
import { useIngestQueue } from "./useIngestQueue";
import { buildFlyerItems } from "./buildFlyerItems";
import { placeItems } from "../../../shared/flyer/layout/placeItems";
import { buildCanvaPayload } from "../../../shared/flyer/export/buildCanvaPayload";
import { IngestItem } from "./types";

type ElectronFile = File & { path: string };

export default function App() {
  const { queue, enqueue } = useIngestQueue();

  const [flyerItems, setFlyerItems] = useState<any[]>([]);
  const [placements, setPlacements] = useState<any[]>([]);
  const [canvaPayload, setCanvaPayload] = useState<any | null>(null);
  const [discounts, setDiscounts] = useState<any[]>([]);


  const handleDrop = (files: ElectronFile[]) => {
    const imagePaths = files
      .filter(f => {
        const name = f.path.toLowerCase();
        return (
          name.endsWith(".jpg") ||
          name.endsWith(".jpeg") ||
          name.endsWith(".png")
        );
      })
      .map(f => f.path);

    if (imagePaths.length > 0) {
      enqueue(imagePaths);
    }
  };

  const buildFlyer = async () => {
    const readyImages = queue
      .filter(q => q.status === "done" && q.result)
      .map(q => q.result);

    if (!readyImages.length) return;

    // 🔑 MATCH DISCOUNTS → SLOTS (AUTHORITATIVE)
    const discounts = await window.ufm.getDiscounts();
    console.log("[App] discounts from main =", discounts);

    const matchedImages = await window.ufm.matchDiscountToSlots({
      images: readyImages,
      discounts
    });



    // 1️⃣ build flyer items
    const items = buildFlyerItems(matchedImages);
    setFlyerItems(items);

    // 2️⃣ place items
    const grid = placeItems(items, {
      columns: 4,
      maxItems: 16
    });
    setPlacements(grid);

    // 3️⃣ build canva payload
    const payload = buildCanvaPayload({
      items,
      placements: grid
    });

    setCanvaPayload(payload);
  };
// pull parsed discounts from main (authoritative)


  const itemMap = new Map(flyerItems.map(i => [i.id, i]));

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

      <DiscountInputView />

      <ImageDropArea busy={false} onDrop={handleDrop} />

      {queue.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2>Ingested Images ({queue.length})</h2>

          {queue.map((item: IngestItem) => (
            <IngestResultView key={item.id} item={item} />
          ))}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <button
          onClick={buildFlyer}
          disabled={!queue.some(q => q.status === "done")}
        >
          Build Flyer
        </button>
      </div>

      {placements.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2>Flyer Preview (Debug)</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
              background: "#ddd",
              padding: 12
            }}
          >
            {placements.map((p: any) => {
              const item = itemMap.get(p.itemId);

              return (
                <div
                  key={p.itemId}
                  style={{
                    background: "#fff",
                    padding: 8,
                    border:
                      item?.matchConfidence === "low"
                        ? "2px solid orange"
                        : "1px solid #ccc",
                    gridColumn: `span ${p.w || 1}`,
                    gridRow: `span ${p.h || 1}`
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: "bold" }}>
                    {item?.meta?.en || "NO TITLE"}
                  </div>

                  {item?.matchConfidence === "low" && (
                    <div style={{ fontSize: 10, color: "orange", fontWeight: 600 }}>
                      ⚠ Low confidence match
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "#c00" }}>
                    {item?.price?.display || ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              fontSize: 12
            }}
          >
            {JSON.stringify(canvaPayload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
