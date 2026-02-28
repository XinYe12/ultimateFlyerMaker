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
}
