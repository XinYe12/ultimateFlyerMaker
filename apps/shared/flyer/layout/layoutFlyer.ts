import { FlyerPlacement } from "../models/FlyerPlacement"

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
