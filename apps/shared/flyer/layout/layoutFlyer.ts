import { FlyerPlacement } from "../models/FlyerPlacement"

export function layoutFlyerSlots({
  items,
  pageId,
  regionId,
  slots,
}: {
  items: { id: string; slotIndex?: number }[]
  pageId: string
  regionId: string
  slots: { x: number; y: number; width: number; height: number }[]
}): FlyerPlacement[] {
  // Create a map to track which slots are filled
  const slotAssignments: Map<number, { id: string; slotIndex?: number }> = new Map();

  // First pass: assign items with explicit slotIndex
  for (const item of items) {
    if (item.slotIndex !== undefined && item.slotIndex >= 0 && item.slotIndex < slots.length) {
      slotAssignments.set(item.slotIndex, item);
    }
  }

  // Second pass: assign remaining items to empty slots in order
  const unassignedItems = items.filter(item => item.slotIndex === undefined);
  let nextEmptySlot = 0;

  for (const item of unassignedItems) {
    // Find next empty slot
    while (nextEmptySlot < slots.length && slotAssignments.has(nextEmptySlot)) {
      nextEmptySlot++;
    }

    if (nextEmptySlot < slots.length) {
      slotAssignments.set(nextEmptySlot, item);
      nextEmptySlot++;
    }
  }

  // Generate placements from slot assignments
  const placements: FlyerPlacement[] = [];
  for (const [slotIndex, item] of slotAssignments.entries()) {
    const slot = slots[slotIndex];
    placements.push({
      itemId: item.id,
      pageId,
      regionId,
      cardSize: "SMALL" as const,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
    });
  }

  return placements;
}

type LayoutItem = {
  id: string
}

type Region = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

type LayoutInput = {
  items: LayoutItem[]
  pageId: string
  region: Region
}

export function layoutFlyer({
  items,
  pageId,
  region,
}: LayoutInput): FlyerPlacement[] {
  const placements: FlyerPlacement[] = []

  const columns = 4
  const cellWidth = region.width / columns
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0

  for (const item of items) {
    const cardSize = "SMALL"
    const width = cellWidth
    const height = cellWidth


    if (cursorX + width > region.width) {
      cursorX = 0
      cursorY += rowHeight
      rowHeight = 0
    }

    placements.push({
      itemId: item.id,
      pageId,
      regionId: region.id,
      cardSize,
      x: region.x + cursorX,
      y: region.y + cursorY,
      width,
      height,
    })

    cursorX += width
    rowHeight = Math.max(rowHeight, height)
  }

  return placements
}
