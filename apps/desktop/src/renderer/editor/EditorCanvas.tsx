// FILE: apps/desktop/src/renderer/editor/EditorCanvas.tsx
// ROLE: render ONLY based on template config (authoritative)

import { useEffect, useState, useMemo } from "react";
import {
  loadFlyerTemplateConfig,
  findPageForDepartment,
} from "./loadFlyerTemplateConfig";
import RenderFlyerPlacements from "./RenderFlyerPlacements";
import { layoutFlyer } from "../../../../shared/flyer/layout/layoutFlyer";
import { saveDepartmentDraft } from "./draftStorage";

const PREVIEW_SCALE = 0.5;

export default function EditorCanvas({
  editorQueue,
  templateId,
  department,
}: {
  editorQueue: any[];
  templateId: string;
  department: string;
}) {
  const [config, setConfig] = useState<any | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  // load template config
  useEffect(() => {
    loadFlyerTemplateConfig(templateId).then(setConfig);
  }, [templateId]);

  // editorQueue is already glued content
  const items = editorQueue;

  // persist draft
  useEffect(() => {
    if (items.length > 0) {
      saveDepartmentDraft(templateId, department, items);
    }
  }, [items, templateId, department]);

  const page = config ? findPageForDepartment(config, department) : null;
  const region = page?.departments?.[department] ?? null;
  const imagePath = page?.imagePath ?? "";

  // layout (pure)
  const placements = useMemo(() => {
    if (!page || !region || items.length === 0) return [];

    return layoutFlyer({
      items: items.map(it => ({ id: it.id })),
      pageId: page.pageId,
      region: {
        id: department,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
      },
    });
  }, [page, region, items, department]);

  if (!config || !page) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  if (!region) {
    return (
      <div style={{ padding: 24, color: "red" }}>
        No region defined for department: {department}
      </div>
    );
  }

  return (
    <div
      key={page.pageId} // hard reset per page
      style={{ marginTop: 24, display: "flex", justifyContent: "center" }}
    >
      <div
        style={{
          transform: `scale(${PREVIEW_SCALE})`,
          transformOrigin: "top center",
        }}
      >
        <div
          style={{
            position: "relative",
            width: imageSize?.width ?? 1600,
            height: imageSize?.height ?? 2400,
            background: "#fff",
          }}
        >
          {/* template image */}
          <img
            src={imagePath}
            onLoad={e =>
              setImageSize({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
            style={{
              width: "100%",
              height: "100%",
              display: "block",
            }}
          />

          {/* department region (authoritative pixels) */}
          {imageSize && (
            <div
              style={{
                position: "absolute",
                left: region.x,
                top: region.y,
                width: region.width,
                height: region.height,
                border: "2px dashed red",
                background: "rgba(255,0,0,0.05)",
                pointerEvents: "none",
              }}
            />
          )}

          {/* items */}
          {placements.length > 0 && (
            <RenderFlyerPlacements
              items={items}
              placements={placements}
            />
          )}
        </div>
      </div>
    </div>
  );
}
