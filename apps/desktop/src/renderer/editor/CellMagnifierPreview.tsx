import React from "react";
import { CardStyleDef } from "./loadFlyerTemplateConfig";
import { renderStyledCellShell } from "./importWizardCellHelpers";

type Props = {
  cardStyle: CardStyleDef;
  departmentLabel: string;
  width?: number;
  height?: number;
};

const MAGNIFIER_SCALE = 2.2;
const MAX_MAGNIFIER_W = 260;

export default function CellMagnifierPreview({
  cardStyle,
  departmentLabel,
  width = 120,
  height = 140,
}: Props) {
  let magW = width * MAGNIFIER_SCALE;
  let magH = height * MAGNIFIER_SCALE;
  if (magW > MAX_MAGNIFIER_W) {
    const shrink = MAX_MAGNIFIER_W / magW;
    magW *= shrink;
    magH *= shrink;
  }
  const renderScale = magW / width;

  const shell = renderStyledCellShell(
    cardStyle,
    { x: 0, y: 0, width, height },
    renderScale,
    true,
    { showMockContent: true },
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
        Product cell preview
      </div>
      <p style={{ fontSize: 10, color: "#64748b", margin: 0, lineHeight: 1.45 }}>
        This look applies to every product slot in <strong style={{ color: "#cbd5e1" }}>{departmentLabel}</strong>.
      </p>
      <div
        style={{
          position: "relative",
          width: magW,
          height: magH,
          margin: "0 auto",
          borderRadius: 8,
          background: "#0f172a",
          border: "1px solid #334155",
          overflow: "hidden",
        }}
      >
        {shell}
        <div
          style={{
            position: "absolute",
            bottom: 4,
            left: 4,
            fontSize: 9,
            fontWeight: 700,
            color: "#93c5fd",
            background: "rgba(15,23,42,0.85)",
            padding: "2px 6px",
            borderRadius: 4,
            pointerEvents: "none",
          }}
        >
          Sample product cell
        </div>
      </div>
    </div>
  );
}
