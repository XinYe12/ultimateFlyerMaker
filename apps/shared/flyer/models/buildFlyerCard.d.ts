export function buildFlyerCard(card: {
  x: number
  y: number
  width: number
  height: number
}): {
  image: {
    x: number
    y: number
    width: number
    height: number
  }
  title: {
    x: number
    y: number
    maxWidth: number
  }
  price: {
    x: number
    y: number
  }
}
