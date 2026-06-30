export const CANVAS_ZOOM_MIN = 0.3;
export const CANVAS_ZOOM_MAX = 3.0;
export const CANVAS_ZOOM_STEP = 0.1;

export function nextCanvasZoom(
  prev: number,
  opts: { delta?: number; reset?: boolean },
): number {
  if (opts.reset) return 1.0;
  const delta = opts.delta ?? 0;
  return Math.min(
    CANVAS_ZOOM_MAX,
    Math.max(CANVAS_ZOOM_MIN, Math.round((prev + delta) * 10) / 10),
  );
}

/** Ctrl/Cmd + wheel → zoom delta (scroll up = in, down = out). */
export function canvasZoomDeltaFromWheel(e: WheelEvent): number | null {
  if (!e.ctrlKey && !e.metaKey) return null;
  if (e.deltaY === 0) return null;
  return e.deltaY > 0 ? -CANVAS_ZOOM_STEP : CANVAS_ZOOM_STEP;
}
