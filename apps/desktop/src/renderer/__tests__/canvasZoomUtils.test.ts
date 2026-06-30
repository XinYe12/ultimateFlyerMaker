import { describe, it, expect } from "vitest";
import { canvasZoomDeltaFromWheel, nextCanvasZoom } from "../editor/canvasZoomUtils";

describe("canvasZoomDeltaFromWheel", () => {
  it("returns null without ctrl/meta", () => {
    const e = { ctrlKey: false, metaKey: false, deltaY: 100 } as WheelEvent;
    expect(canvasZoomDeltaFromWheel(e)).toBeNull();
  });

  it("zooms in on scroll up", () => {
    const e = { ctrlKey: true, metaKey: false, deltaY: -100 } as WheelEvent;
    expect(canvasZoomDeltaFromWheel(e)).toBe(0.1);
  });

  it("zooms out on scroll down", () => {
    const e = { ctrlKey: true, metaKey: false, deltaY: 100 } as WheelEvent;
    expect(canvasZoomDeltaFromWheel(e)).toBe(-0.1);
  });
});

describe("nextCanvasZoom", () => {
  it("clamps zoom range", () => {
    expect(nextCanvasZoom(0.3, { delta: -0.5 })).toBe(0.3);
    expect(nextCanvasZoom(3, { delta: 0.5 })).toBe(3);
  });

  it("resets to 1", () => {
    expect(nextCanvasZoom(2, { reset: true })).toBe(1);
  });
});
