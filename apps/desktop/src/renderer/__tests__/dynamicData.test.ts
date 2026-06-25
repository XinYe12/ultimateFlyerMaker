import { describe, it, expect } from "vitest";
import {
  previewDynamicContext,
  resolveDynamicContent,
  resolveDynamicToken,
} from "../editor/dynamicData";
import {
  formatFlyerCycleRange,
  formatFlyerDatePart,
  getDisplayCycleStartFriday,
  getValidCycleRange,
} from "../utils/flyerCycle";

const ctx = {
  flyerWeekStart: "2026-05-15",
  discountLabels: [{ price: { days: ["fri", "sat", "sun"] } }],
};

describe("flyerCycle valid date parts", () => {
  it("returns Fri–Thu range from cycle start", () => {
    const start = new Date("2026-05-15T00:00:00");
    const { start: rangeStart, end: rangeEnd } = getValidCycleRange(start);
    expect(rangeStart.getDate()).toBe(15);
    expect(rangeEnd.getDate()).toBe(21);
    expect(formatFlyerDatePart(rangeStart, "weekday")).toBe("Friday");
    expect(formatFlyerDatePart(rangeEnd, "weekday")).toBe("Thursday");
  });

  it("formats long prose dates", () => {
    const start = new Date("2026-05-15T00:00:00");
    const { start: rangeStart, end: rangeEnd } = getValidCycleRange(start);
    expect(formatFlyerDatePart(rangeStart, "long")).toBe("Friday, May 15, 2026");
    expect(formatFlyerDatePart(rangeEnd, "long")).toBe("Thursday, May 21, 2026");
  });

  it("keeps short flyer cycle range format", () => {
    const start = new Date("2026-05-15T00:00:00");
    expect(formatFlyerCycleRange(start)).toBe("May 15 - May 21");
  });
});

describe("dynamicData valid cycle tokens", () => {
  it("resolves atomic valid-cycle tokens", () => {
    expect(resolveDynamicToken("valid_start_weekday", ctx)).toBe("Friday");
    expect(resolveDynamicToken("valid_end_weekday", ctx)).toBe("Thursday");
    expect(resolveDynamicToken("valid_start_long", ctx)).toBe("Friday, May 15, 2026");
    expect(resolveDynamicToken("valid_end_long", ctx)).toBe("Thursday, May 21, 2026");
    expect(resolveDynamicToken("valid_start_short", ctx)).toBe("May 15");
    expect(resolveDynamicToken("valid_end_short", ctx)).toBe("May 21");
    expect(resolveDynamicToken("valid_start_year", ctx)).toBe("2026");
    expect(resolveDynamicToken("valid_end_year", ctx)).toBe("2026");
  });

  it("keeps backward-compatible valid_dates token", () => {
    expect(resolveDynamicToken("valid_dates", ctx)).toBe("May 15 - May 21");
  });

  it("composes long prose template", () => {
    const template = "{{valid_start_long}} to {{valid_end_long}}.";
    expect(resolveDynamicContent(template, ctx)).toBe(
      "Friday, May 15, 2026 to Thursday, May 21, 2026."
    );
  });

  it("still resolves discount-day tokens", () => {
    expect(resolveDynamicToken("days_count", ctx)).toBe("3 DAYS ONLY");
    expect(resolveDynamicToken("dates", ctx)).toBe("May 15, 16, 17");
  });

  it("uses current display cycle in previewDynamicContext", () => {
    const preview = previewDynamicContext();
    const expected = getDisplayCycleStartFriday(new Date()).toISOString().slice(0, 10);
    expect(preview.flyerWeekStart).toBe(expected);
    expect(resolveDynamicToken("valid_start_long", preview)).toMatch(/^\w+day, \w+ \d{1,2}, \d{4}$/);
  });

  it("falls back to current week when jobs lack flyerWeekStart", async () => {
    const { buildDynamicContextFromJobs } = await import("../editor/dynamicData");
    const ctx = buildDynamicContextFromJobs([{ department: "grocery", result: { discountLabels: [{ price: { days: ["fri"] } }] } }]);
    const expected = getDisplayCycleStartFriday(new Date()).toISOString().slice(0, 10);
    expect(ctx.flyerWeekStart).toBe(expected);
  });
});
