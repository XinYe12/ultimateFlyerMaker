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
  titleFontFamily?: string
  titleColor?: string
  titleItalic?: boolean
  titleBg?: string
  titleBgPad?: number
  titleEffect?: 'stroke' | 'glow' | 'shadow'
  priceFontFamily?: string
  priceColor?: string
  priceShowDollar?: boolean
  priceBg?: string
  priceBgPad?: number
  priceEffect?: 'stroke' | 'glow' | 'shadow'
  priceCompDollarRatio?: number
  priceCompDollarOffsetY?: number
  priceCompQtyRatio?: number
  priceCompDecRatio?: number
  priceCompDecOffsetY?: number
  priceCompUnitRatio?: number
  priceCompUnitOffsetY?: number
  titleCompMetaScale?: number
  titleCompMetaOffsetY?: number
  imageRadius?: number      // 0–50 (% of min dimension), default 0
  imageBrightness?: number  // 0–200 (CSS filter %), default 100
  imageContrast?: number    // 0–200 (CSS filter %), default 100
  imageSaturation?: number  // 0–200 (CSS filter %), default 100
  imageOpacity?: number     // 0–100 (%), default 100
  imageFlipH?: boolean      // mirror horizontally, default false
  imageFlipV?: boolean      // mirror vertically, default false
  titleOffsetX?: number    // px nudge from default title anchor; positive = right
  titleOffsetY?: number    // px nudge from default title anchor; positive = up
  priceOffsetX?: number    // px nudge from default right anchor; positive = inward (left)
  priceOffsetY?: number    // px nudge from default bottom anchor; positive = up
}
