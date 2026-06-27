export const TEXT_NUDGE_STEP = 1;
export const TEXT_NUDGE_STEP_FAST = 5;

export type TextElementKind = "title" | "price";
export type CardOrientation = "vertical" | "horizontal" | "top";

type AxisLimits = { min: number; max: number };
type NudgeLimits = { x: AxisLimits; y: AxisLimits };

function clamp(v: number, { min, max }: AxisLimits): number {
  return Math.max(min, Math.min(max, v));
}

function titleLimits(_orient: CardOrientation): NudgeLimits {
  return { x: { min: -150, max: 150 }, y: { min: -150, max: 150 } };
}

function priceLimits(): NudgeLimits {
  return { x: { min: -150, max: 150 }, y: { min: -150, max: 150 } };
}

export function computeTextNudgePatch(
  card: {
    titleOffsetX?: number;
    titleOffsetY?: number;
    priceOffsetX?: number;
    priceOffsetY?: number;
    orientation?: CardOrientation;
  },
  element: TextElementKind,
  visualDx: number,
  visualDy: number
): Partial<{
  titleOffsetX: number;
  titleOffsetY: number;
  priceOffsetX: number;
  priceOffsetY: number;
}> | null {
  const orient = card.orientation ?? "vertical";

  if (element === "title") {
    const limits = titleLimits(orient);
    const nextX = clamp((card.titleOffsetX ?? 0) + visualDx, limits.x);
    const nextY = clamp((card.titleOffsetY ?? 0) + visualDy, limits.y);
    if (nextX === (card.titleOffsetX ?? 0) && nextY === (card.titleOffsetY ?? 0)) return null;
    return { titleOffsetX: nextX, titleOffsetY: nextY };
  }

  const limits = priceLimits();
  const nextX = clamp((card.priceOffsetX ?? 0) - visualDx, limits.x);
  const nextY = clamp((card.priceOffsetY ?? 0) + visualDy, limits.y);
  if (nextX === (card.priceOffsetX ?? 0) && nextY === (card.priceOffsetY ?? 0)) return null;
  return { priceOffsetX: nextX, priceOffsetY: nextY };
}

export function titleNudgeStyle(
  orientation: CardOrientation | undefined,
  offsetX: number,
  offsetY: number,
  sidePad: number
): Record<string, string | number> {
  const orient = orientation ?? "vertical";
  if (orient === "vertical") {
    return {
      bottom: sidePad + offsetY,
      left: sidePad + offsetX,
    };
  }
  return {
    transform: `translate(${offsetX}px, ${-offsetY}px)`,
  };
}

export function priceNudgeStyle(
  offsetX: number,
  offsetY: number,
  sidePad: number
): Record<string, string | number> {
  return {
    bottom: sidePad + offsetY,
    right: sidePad + offsetX,
  };
}
