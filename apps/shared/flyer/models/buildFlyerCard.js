import { DefaultFlyerCardSpec } from "./FlyerCardSpec";

export function buildFlyerCard({ x, y, width, height }) {
  const s = DefaultFlyerCardSpec;

  return {
    image: {
      x: x + s.image.x * width,
      y: y + s.image.y * height,
      width: s.image.width * width,
      height: s.image.height * height,
    },
    title: {
      x: x + s.title.x * width,
      y: y + s.title.y * height,
      maxWidth: s.title.maxWidth * width,
    },
    price: {
      x: x + s.price.x * width,
      y: y + s.price.y * height,
    },
  };
}
