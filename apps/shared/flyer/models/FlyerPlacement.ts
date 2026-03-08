export type FlyerPlacement = {
  itemId: string
  pageId: string
  regionId: string
  cardSize: 'SMALL' | 'MEDIUM' | 'LARGE'
  x: number
  y: number
  width: number
  height: number
  contentScale?: number
  imageScale?: number
  titleScale?: number
  priceScale?: number
  imageRotation?: number   // degrees; any value; default 0
  imageOffsetX?: number    // px offset from default center; default 0
  imageOffsetY?: number    // px offset from default center; default 0
  orientation?: 'vertical' | 'horizontal' | 'top'
  cropLeft?: number
  cropRight?: number
  cropTop?: number
  cropBottom?: number
}
