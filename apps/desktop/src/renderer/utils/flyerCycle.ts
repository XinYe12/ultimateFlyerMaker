// Flyer week cycle: Fri → Thu.
// Rule: before Thursday (Mon/Tue/Wed) → current cycle (last Friday).
//       Thursday or after → next cycle (next Friday).

export function getCycleStartFriday(fromDate: Date = new Date()): Date {
  const dow = fromDate.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const d = new Date(fromDate);
  d.setHours(0, 0, 0, 0);
  if (dow >= 1 && dow <= 3) {
    // Mon/Tue/Wed → go back to last Friday
    d.setDate(d.getDate() - ((dow - 5 + 7) % 7));
  } else {
    // Thu/Fri/Sat/Sun → go forward to next Friday
    const fwd = (5 - dow + 7) % 7 || 7;
    d.setDate(d.getDate() + fwd);
  }
  return d;
}

// Order within the Fri-Thu cycle
const CYCLE_DAY_OFFSET: Record<string, number> = {
  fri: 0, sat: 1, sun: 2, mon: 3, tue: 4, wed: 5, thu: 6,
};

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function formatDaysOnlyBanner(
  days: string[],
  cycleStart: Date
): { count: number; dateStr: string } {
  const sorted = [...days].sort(
    (a, b) => (CYCLE_DAY_OFFSET[a] ?? 7) - (CYCLE_DAY_OFFSET[b] ?? 7)
  );

  const dates = sorted.map(day => {
    const d = new Date(cycleStart);
    d.setDate(cycleStart.getDate() + (CYCLE_DAY_OFFSET[day] ?? 0));
    return d;
  });

  // Group same-month day numbers for compact display: "May 15, 16, 17" or "Apr 30, May 1"
  const groups: { month: string; days: number[] }[] = [];
  for (const d of dates) {
    const m = MONTH_ABBR[d.getMonth()];
    const last = groups[groups.length - 1];
    if (last && last.month === m) {
      last.days.push(d.getDate());
    } else {
      groups.push({ month: m, days: [d.getDate()] });
    }
  }

  return {
    count: sorted.length,
    dateStr: groups.map(g => `${g.month} ${g.days.join(", ")}`).join(", "),
  };
}
