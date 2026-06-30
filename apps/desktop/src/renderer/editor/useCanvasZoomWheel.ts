import { useLayoutEffect, type RefObject } from "react";
import { canvasZoomDeltaFromWheel, nextCanvasZoom } from "./canvasZoomUtils";

/** Ctrl/Cmd + mouse wheel zoom on a canvas scroll container. */
export function useCanvasZoomWheel(
  enabled: boolean,
  setZoom: React.Dispatch<React.SetStateAction<number>>,
  containerRef?: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    if (!enabled) return;

    const el = containerRef?.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const delta = canvasZoomDeltaFromWheel(e);
      if (delta == null) return;
      e.preventDefault();
      setZoom(prev => nextCanvasZoom(prev, { delta }));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enabled, setZoom, containerRef]);
}
