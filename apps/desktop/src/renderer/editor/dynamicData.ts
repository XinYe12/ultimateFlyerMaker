import {
  formatDaysOnlyBanner,
  formatFlyerCycleRange,
  formatFlyerDatePart,
  getCycleStartFriday,
  getDisplayCycleStartFriday,
  getValidCycleRange,
} from "../utils/flyerCycle";

export type DynamicDataCategory = "valid_cycle" | "discount_days";

export type DynamicDataId =
  | "dates"
  | "days_count"
  | "dates_banner"
  | "valid_dates"
  | "valid_start_weekday"
  | "valid_end_weekday"
  | "valid_start_long"
  | "valid_end_long"
  | "valid_start_short"
  | "valid_end_short"
  | "valid_start_year"
  | "valid_end_year";

export type DynamicDataOption = {
  id: DynamicDataId;
  label: string;
  description: string;
  token: string;
  category: DynamicDataCategory;
  exampleHint?: string;
};

export const DYNAMIC_DATA_OPTIONS: DynamicDataOption[] = [
  {
    id: "valid_dates",
    label: "Valid dates",
    description: "Short flyer cycle range (Fri–Thu)",
    token: "{{valid_dates}}",
    category: "valid_cycle",
    exampleHint: "May 15 - May 21",
  },
  {
    id: "valid_start_weekday",
    label: "Start weekday",
    description: "Weekday name for cycle start (Friday)",
    token: "{{valid_start_weekday}}",
    category: "valid_cycle",
    exampleHint: "Friday",
  },
  {
    id: "valid_end_weekday",
    label: "End weekday",
    description: "Weekday name for cycle end (Thursday)",
    token: "{{valid_end_weekday}}",
    category: "valid_cycle",
    exampleHint: "Thursday",
  },
  {
    id: "valid_start_long",
    label: "Start (long)",
    description: "Full start date with weekday and year",
    token: "{{valid_start_long}}",
    category: "valid_cycle",
    exampleHint: "Friday, May 15, 2026",
  },
  {
    id: "valid_end_long",
    label: "End (long)",
    description: "Full end date with weekday and year",
    token: "{{valid_end_long}}",
    category: "valid_cycle",
    exampleHint: "Thursday, May 21, 2026",
  },
  {
    id: "valid_start_short",
    label: "Start (short)",
    description: "Compact month and day for cycle start",
    token: "{{valid_start_short}}",
    category: "valid_cycle",
    exampleHint: "May 15",
  },
  {
    id: "valid_end_short",
    label: "End (short)",
    description: "Compact month and day for cycle end",
    token: "{{valid_end_short}}",
    category: "valid_cycle",
    exampleHint: "May 21",
  },
  {
    id: "valid_start_year",
    label: "Start year",
    description: "Four-digit year for cycle start",
    token: "{{valid_start_year}}",
    category: "valid_cycle",
    exampleHint: "2026",
  },
  {
    id: "valid_end_year",
    label: "End year",
    description: "Four-digit year for cycle end",
    token: "{{valid_end_year}}",
    category: "valid_cycle",
    exampleHint: "2026",
  },
  {
    id: "dates",
    label: "Sale dates",
    description: "Date line from discount days (e.g. May 15, 16, 17)",
    token: "{{dates}}",
    category: "discount_days",
    exampleHint: "May 15, 16, 17",
  },
  {
    id: "days_count",
    label: "Days count",
    description: "Promo count line (e.g. 3 DAYS ONLY)",
    token: "{{days_count}}",
    category: "discount_days",
    exampleHint: "3 DAYS ONLY",
  },
  {
    id: "dates_banner",
    label: "Full dates block",
    description: "Both lines used on product day banners",
    token: "{{dates_banner}}",
    category: "discount_days",
    exampleHint: "3 DAYS ONLY\nMay 15, 16, 17",
  },
];

export type DynamicTemplatePreset = {
  id: string;
  label: string;
  description: string;
  template: string;
};

export const DYNAMIC_TEMPLATE_PRESETS: DynamicTemplatePreset[] = [
  {
    id: "short",
    label: "Short range",
    description: "Compact Fri–Thu range with a Valid prefix",
    template: "Valid {{valid_dates}}",
  },
  {
    id: "long_prose",
    label: "Long prose",
    description: "Full long dates joined with “to”",
    template: "{{valid_start_long}} to {{valid_end_long}}.",
  },
  {
    id: "weekday_long",
    label: "Weekday + long",
    description: "Weekday and long date for both start and end",
    template: "{{valid_start_weekday}}, {{valid_start_long}} to {{valid_end_weekday}}, {{valid_end_long}}.",
  },
  {
    id: "discount_banner",
    label: "Discount banner",
    description: "Days count plus sale dates from product discounts",
    template: "{{days_count}}\n{{dates}}",
  },
];

export const DYNAMIC_DATA_CATEGORY_LABELS: Record<DynamicDataCategory, string> = {
  valid_cycle: "Valid cycle (Fri–Thu)",
  discount_days: "Discount days",
};

export type DynamicDataContext = {
  flyerWeekStart?: string;
  discountLabels?: Array<{ price?: { days?: string[] } }>;
};

const CYCLE_ORDER = ["fri", "sat", "sun", "mon", "tue", "wed", "thu"];

const TOKEN_RE = /\{\{(\w+)\}\}/g;

const VALID_CYCLE_TOKEN_PARTS: Partial<Record<DynamicDataId, { date: "start" | "end"; part: "weekday" | "long" | "short" | "year" }>> = {
  valid_start_weekday: { date: "start", part: "weekday" },
  valid_end_weekday: { date: "end", part: "weekday" },
  valid_start_long: { date: "start", part: "long" },
  valid_end_long: { date: "end", part: "long" },
  valid_start_short: { date: "start", part: "short" },
  valid_end_short: { date: "end", part: "short" },
  valid_start_year: { date: "start", part: "year" },
  valid_end_year: { date: "end", part: "year" },
};

export function collectFlyerDays(
  labels?: Array<{ price?: { days?: string[] } }>
): string[] {
  const all = new Set<string>();
  for (const label of labels ?? []) {
    for (const d of label?.price?.days ?? []) {
      if (d) all.add(d);
    }
  }
  return CYCLE_ORDER.filter(d => all.has(d));
}

function cycleStartFromContext(ctx: DynamicDataContext): Date {
  return ctx.flyerWeekStart
    ? new Date(ctx.flyerWeekStart + "T00:00:00")
    : getCycleStartFriday(new Date());
}

function validCycleStartFromContext(ctx: DynamicDataContext): Date {
  return ctx.flyerWeekStart
    ? new Date(ctx.flyerWeekStart + "T00:00:00")
    : getDisplayCycleStartFriday(new Date());
}

function resolveValidCycleToken(id: DynamicDataId, ctx: DynamicDataContext): string {
  if (id === "valid_dates") {
    return formatFlyerCycleRange(validCycleStartFromContext(ctx));
  }
  const mapping = VALID_CYCLE_TOKEN_PARTS[id];
  if (!mapping) return "";
  const { start, end } = getValidCycleRange(validCycleStartFromContext(ctx));
  const date = mapping.date === "start" ? start : end;
  return formatFlyerDatePart(date, mapping.part);
}

export function resolveDynamicToken(id: string, ctx: DynamicDataContext): string {
  if (id === "valid_dates" || VALID_CYCLE_TOKEN_PARTS[id as DynamicDataId]) {
    return resolveValidCycleToken(id as DynamicDataId, ctx);
  }

  const days = collectFlyerDays(ctx.discountLabels);
  const cycleStart = cycleStartFromContext(ctx);
  const { count, dateStr } = formatDaysOnlyBanner(days, cycleStart);
  const topLine = count === 1 ? "1 DAY ONLY" : `${count} DAYS ONLY`;

  switch (id as DynamicDataId) {
    case "dates":
      return dateStr;
    case "days_count":
      return days.length > 0 ? topLine : "";
    case "dates_banner":
      if (!dateStr) return "";
      return `${topLine}\n${dateStr}`;
    default:
      return "";
  }
}

export function resolveDynamicContent(
  template: string | undefined,
  ctx: DynamicDataContext,
  opts?: { keepUnresolved?: boolean }
): string {
  const raw = template ?? "";
  if (!raw.includes("{{")) return raw;
  return raw.replace(TOKEN_RE, (match, id: string) => {
    const resolved = resolveDynamicToken(id, ctx);
    if (resolved) return resolved;
    return opts?.keepUnresolved ? match : "";
  });
}

/** Fixed sample week for unit tests only. */
export const PREVIEW_FLYER_WEEK_START = "2026-05-15";

export function previewDynamicContext(): DynamicDataContext {
  const weekStart = getDisplayCycleStartFriday(new Date());
  return {
    flyerWeekStart: weekStart.toISOString().slice(0, 10),
    discountLabels: [{ price: { days: ["fri", "sat", "sun"] } }],
  };
}

export function buildDynamicContextFromJobs(
  jobs: Array<{ department?: string; flyerWeekStart?: string; result?: { discountLabels?: Array<{ price?: { days?: string[] } }> } }>,
  departmentsOnPage?: string[]
): DynamicDataContext {
  const relevant = departmentsOnPage?.length
    ? jobs.filter(j => j.department && departmentsOnPage.includes(j.department))
    : jobs;
  const discountLabels = relevant.flatMap(j => j.result?.discountLabels ?? []);
  const flyerWeekStart =
    relevant.find(j => j.flyerWeekStart)?.flyerWeekStart
    ?? jobs.find(j => j.flyerWeekStart)?.flyerWeekStart
    ?? getDisplayCycleStartFriday(new Date()).toISOString().slice(0, 10);
  return { flyerWeekStart, discountLabels };
}

export function insertDynamicToken(
  current: string,
  token: string,
  selectionStart?: number,
  selectionEnd?: number
): { value: string; cursor: number } {
  const start = selectionStart ?? current.length;
  const end = selectionEnd ?? start;
  const next = current.slice(0, start) + token + current.slice(end);
  const cursor = start + token.length;
  return { value: next, cursor };
}

export function resolveEditableBoxContent(
  box: { content?: string; label?: string; isEditable?: boolean; fieldKind?: string },
  ctx: DynamicDataContext,
  opts?: { keepUnresolved?: boolean }
): string {
  const template = box.content?.trim()
    ? box.content
    : box.isEditable && box.fieldKind === "date_range"
      ? "{{days_count}}\n{{dates}}"
      : (box.label ?? "");
  return resolveDynamicContent(template, ctx, opts);
}

export function tokenResolvedSample(
  opt: DynamicDataOption,
  ctx: DynamicDataContext
): string {
  const resolved = resolveDynamicToken(opt.id, ctx);
  return resolved || opt.exampleHint || "";
}
