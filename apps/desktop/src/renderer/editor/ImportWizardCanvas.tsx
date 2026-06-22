import React from "react";
import { CustomBoxDef, DepartmentAreaDef } from "./loadFlyerTemplateConfig";
import { renderImportBoxOverlay } from "./importTemplateCanvasHelpers";
import {
  defaultCardStyle,
  renderAutomationGridPreview,
  renderReadonlyDepartmentFill,
  renderStyledCell,
  SampleCellDef,
} from "./importWizardCellHelpers";
import { WizardViewMode } from "./importWizardViewState";

export type WizardCanvasStep = "regions" | "cellStyle" | "components";

export type WizardAreaDraft = DepartmentAreaDef & {
  id: string;
  sampleCell?: SampleCellDef;
};

export type WizardPageDraft = {
  fileUrl: string;
  underprintUrl?: string;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  areas: WizardAreaDraft[];
  boxes: CustomBoxDef[];
};

type AreaDragStart = (
  e: React.MouseEvent,
  areaId: string,
  mode: "move" | "resize",
  corner?: "tl" | "tr" | "bl" | "br",
  region?: { x: number; y: number; width: number; height: number }
) => void;

type BoxDragStart = (
  e: React.MouseEvent,
  boxId: string,
  mode: "move" | "resize",
  corner?: "tl" | "tr" | "bl" | "br",
  box?: { x: number; y: number; width: number; height: number }
) => void;

type SampleCellDragStart = (
  e: React.MouseEvent,
  areaId: string,
  mode: "move" | "resize",
  corner?: "tl" | "tr" | "bl" | "br",
  cell?: SampleCellDef
) => void;

export type ImportWizardCanvasProps = {
  page: WizardPageDraft;
  step: WizardCanvasStep;
  scale: number;
  mode: "edit" | "reference";
  viewMode: WizardViewMode;
  underprintOpacity: number;
  selectedAreaId: string | null;
  selectedBoxId: string | null;
  editableBoxes: CustomBoxDef[];
  outlineOnly: boolean;
  deptColor: (key: string) => string;
  deptLabel: (key: string) => string;
  onSelectArea: (id: string) => void;
  onSelectBox: (id: string) => void;
  onAreaDragStart: AreaDragStart;
  onBoxDragStart: BoxDragStart;
  onSampleCellDragStart: SampleCellDragStart;
  onCanvasMouseDown?: () => void;
  /** Called when user starts drawing a new region (mousedown on empty canvas in regions step). */
  onRegionDrawStart?: (e: React.MouseEvent, startX: number, startY: number) => void;
  /** Live draw rectangle to show while user is dragging a new region. */
  drawRect?: { x: number; y: number; width: number; height: number } | null;
  /** Step 2 — show full automation-style product grid instead of single sample cell. */
  gridPreview?: boolean;
};

const HANDLE_SIZE = 14;

function resolveBackgroundLayers(
  page: WizardPageDraft,
  step: WizardCanvasStep,
  mode: "edit" | "reference",
  viewMode: WizardViewMode,
  underprintOpacity: number,
  gridPreview?: boolean
): { whiteBase: boolean; imageUrl?: string; underprintUrl?: string; underprintOpacity?: number } {
  if (mode === "reference") {
    if (gridPreview && page.underprintUrl) {
      return { whiteBase: false, imageUrl: page.underprintUrl };
    }
    return { whiteBase: false, imageUrl: page.fileUrl };
  }

  if (viewMode === "sideBySide") {
    return { whiteBase: true };
  }

  if (gridPreview) {
    return {
      whiteBase: false,
      imageUrl: page.fileUrl,
      underprintUrl: page.underprintUrl,
      underprintOpacity: page.underprintUrl && underprintOpacity > 0 ? underprintOpacity : undefined,
    };
  }

  return { whiteBase: false, imageUrl: page.fileUrl };
}

export default function ImportWizardCanvas({
  page,
  step,
  scale,
  mode,
  viewMode,
  underprintOpacity,
  selectedAreaId,
  selectedBoxId,
  editableBoxes,
  outlineOnly,
  deptColor,
  deptLabel,
  onSelectArea,
  onSelectBox,
  onAreaDragStart,
  onBoxDragStart,
  onSampleCellDragStart,
  onCanvasMouseDown,
  onRegionDrawStart,
  drawRect,
  gridPreview = false,
}: ImportWizardCanvasProps) {
  const readOnly = mode === "reference";
  const overlayW = page.canvasWidth * scale;
  const overlayH = page.canvasHeight * scale;
  const bg = resolveBackgroundLayers(page, step, mode, viewMode, underprintOpacity, gridPreview);

  return (
    <div
      style={{
        position: "relative",
        width: overlayW,
        height: overlayH,
        flexShrink: 0,
        margin: HANDLE_SIZE / 2,
        cursor: !readOnly && step === "regions" ? "crosshair" : undefined,
      }}
      onMouseDown={e => {
        e.stopPropagation();
        if (!readOnly) {
          onCanvasMouseDown?.();
          if (step === "regions" && onRegionDrawStart) {
            const rect = e.currentTarget.getBoundingClientRect();
            onRegionDrawStart(e, (e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
          }
        }
      }}
    >
      {bg.whiteBase && (
        <div style={{ position: "absolute", inset: 0, background: page.backgroundColor ?? "#ffffff" }} />
      )}

      {bg.imageUrl && (
        <img
          src={bg.imageUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
            userSelect: "none",
            pointerEvents: "none",
            objectFit: "fill",
          }}
          draggable={false}
        />
      )}

      {bg.underprintUrl && bg.underprintOpacity != null && (
        <img
          src={bg.underprintUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
            userSelect: "none",
            pointerEvents: "none",
            objectFit: "fill",
            opacity: bg.underprintOpacity,
          }}
          draggable={false}
        />
      )}

      {!readOnly && page.areas.map(area => {
        const r = area.productRegion;
        const isSelected = area.id === selectedAreaId;
        const color = deptColor(area.departmentKey);
        const regionRadius = (area.regionStyle?.borderRadius ?? 0) * scale;

        if (step === "regions") {
          const regionBg = area.regionStyle?.backgroundColor ?? "#f1f5f9";
          return (
            <React.Fragment key={area.id}>
              <div
                style={{
                  position: "absolute",
                  left: r.x * scale,
                  top: r.y * scale,
                  width: r.width * scale,
                  height: r.height * scale,
                  overflow: "hidden",
                  pointerEvents: "none",
                  background: regionBg,
                  borderRadius: regionRadius,
                  border: isSelected ? `2px solid ${color}` : undefined,
                  boxSizing: "border-box",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: r.x * scale,
                  top: r.y * scale,
                  width: r.width * scale,
                  height: r.height * scale,
                  borderRadius: regionRadius,
                  boxSizing: "border-box",
                  cursor: "move",
                  userSelect: "none",
                  boxShadow: isSelected ? `0 0 0 2px ${color}` : undefined,
                }}
                onMouseDown={e => {
                  e.stopPropagation();
                  onSelectArea(area.id);
                  onAreaDragStart(e, area.id, "move", undefined, r);
                }}
              >
                <div style={{ position: "absolute", top: 3, left: 4, fontSize: 10, fontWeight: 700, color, pointerEvents: "none", textShadow: "0 0 4px #fff", whiteSpace: "nowrap" }}>
                  {deptLabel(area.departmentKey)}
                </div>
                {isSelected && (["tl", "tr", "bl", "br"] as const).map(corner => (
                  <div
                    key={corner}
                    style={{
                      position: "absolute",
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      background: color,
                      border: "2px solid #fff",
                      borderRadius: 2,
                      cursor: corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize",
                      ...(corner === "tl" ? { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 }
                        : corner === "tr" ? { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 }
                        : corner === "bl" ? { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 }
                        : { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 }),
                    }}
                    onMouseDown={e => {
                      e.stopPropagation();
                      onAreaDragStart(e, area.id, "resize", corner, r);
                    }}
                  />
                ))}
              </div>
            </React.Fragment>
          );
        }

        if (step === "cellStyle" || step === "components") {
          return (
            <React.Fragment key={area.id}>
              {renderReadonlyDepartmentFill(area, scale)}

              {step === "cellStyle" && !gridPreview && area.sampleCell && area.cardStyle && (
                <div
                  style={{
                    position: "absolute",
                    left: (r.x + area.sampleCell.x) * scale,
                    top: (r.y + area.sampleCell.y) * scale,
                    width: area.sampleCell.width * scale,
                    height: area.sampleCell.height * scale,
                    pointerEvents: "none",
                    zIndex: 20,
                  }}
                >
                  {renderStyledCell(area.cardStyle, { x: 0, y: 0, width: area.sampleCell.width, height: area.sampleCell.height }, scale, isSelected)}
                </div>
              )}

              {step === "cellStyle" && gridPreview && area.cardStyle && (
                <div
                  style={{
                    position: "absolute",
                    left: r.x * scale,
                    top: r.y * scale,
                    width: r.width * scale,
                    height: r.height * scale,
                    overflow: "hidden",
                    pointerEvents: "none",
                    borderRadius: regionRadius,
                    ...(regionRadius > 0 ? { clipPath: `inset(0 round ${regionRadius}px)` } : {}),
                  }}
                >
                  {renderAutomationGridPreview(area, scale, isSelected, { previewAlpha: 0.45 })}
                </div>
              )}
            </React.Fragment>
          );
        }

        return null;
      })}

      {!readOnly && step === "components" && editableBoxes.map(box => {
        const isSelected = box.id === selectedBoxId;
        const showFill = !outlineOnly || isSelected;
        return (
          <div
            key={box.id}
            style={{
              position: "absolute",
              left: box.x * scale,
              top: box.y * scale,
              width: box.width * scale,
              height: box.height * scale,
              border: isSelected ? "2px solid #3b82f6" : `1px dashed ${showFill ? "#64748b" : "#3b82f6"}`,
              boxSizing: "border-box",
              cursor: "move",
              userSelect: "none",
              overflow: "hidden",
              background: showFill ? undefined : "transparent",
            }}
            onMouseDown={e => {
              e.stopPropagation();
              onSelectBox(box.id);
              onBoxDragStart(e, box.id, "move", undefined, box);
            }}
          >
            {renderImportBoxOverlay(box, scale, isSelected, outlineOnly)}
            {isSelected && (["tl", "tr", "bl", "br"] as const).map(corner => (
              <div
                key={corner}
                style={{
                  position: "absolute",
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  background: "#3b82f6",
                  border: "2px solid #fff",
                  borderRadius: 2,
                  cursor: corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize",
                  ...(corner === "tl" ? { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 }
                    : corner === "tr" ? { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 }
                    : corner === "bl" ? { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 }
                    : { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 }),
                }}
                onMouseDown={e => {
                  e.stopPropagation();
                  onBoxDragStart(e, box.id, "resize", corner, box);
                }}
              />
            ))}
          </div>
        );
      })}

      {step === "regions" && drawRect && drawRect.width > 0 && drawRect.height > 0 && (
        <div
          style={{
            position: "absolute",
            left: drawRect.x * scale,
            top: drawRect.y * scale,
            width: drawRect.width * scale,
            height: drawRect.height * scale,
            border: "2px dashed #3b82f6",
            borderRadius: 4,
            background: "rgba(59,130,246,0.08)",
            boxSizing: "border-box",
            pointerEvents: "none",
            zIndex: 30,
          }}
        />
      )}
    </div>
  );
}
