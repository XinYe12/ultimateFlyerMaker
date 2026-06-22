import type { DragEvent } from "react";

export type PanelImageDragData = {
  type: "ufm-panel-image";
  itemId: string;
  cutoutPath: string | null;
  inputPath: string;
  titleEn?: string;
};

export type PanelImageDropMeta = {
  cardId?: string;
  sourceItemId?: string;
};

export type PanelImageDropHandler = (
  targetItemId: string | null,
  cutoutPath: string | null,
  inputPath: string,
  meta?: PanelImageDropMeta
) => void;

export function isPanelImageDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes("text/plain");
}

export function acceptPanelImageDrag(e: DragEvent): boolean {
  if (!isPanelImageDrag(e)) return false;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  return true;
}

export function readPanelImageDrag(e: DragEvent): PanelImageDragData | null {
  try {
    const d = JSON.parse(e.dataTransfer.getData("text/plain")) as PanelImageDragData;
    if (d.type !== "ufm-panel-image") return null;
    return d;
  } catch {
    return null;
  }
}

export function handlePanelImageDropEvent(
  e: DragEvent,
  onDrop: PanelImageDropHandler | undefined,
  target: { itemId?: string | null; cardId?: string }
): void {
  if (!onDrop) return;
  e.preventDefault();
  e.stopPropagation();
  const d = readPanelImageDrag(e);
  if (!d) return;
  onDrop(
    target.itemId ?? null,
    d.cutoutPath ?? null,
    d.inputPath ?? "",
    { cardId: target.cardId, sourceItemId: d.itemId }
  );
}
