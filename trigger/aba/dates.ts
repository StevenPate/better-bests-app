/**
 * The publication calendar runs on Pacific time: lists appear Wednesday
 * (PT), and every week is identified by its Wednesday date.
 *
 * These helpers deliberately compute "today" in America/Los_Angeles rather
 * than UTC. A late-Tuesday run in PT is already Wednesday in UTC, and ABA
 * pre-stages Wednesday's sheets on Tuesday evening (observed live
 * 2026-09-01), so a UTC-based "current week" both front-runs the publication
 * calendar and actually succeeds in fetching tomorrow's list.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The publication Wednesday (PT calendar) on or before the given instant. */
export function publicationWednesday(from: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(from);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const dow = WEEKDAYS.indexOf(get("weekday"));

  const d = new Date(Date.UTC(+get("year"), +get("month") - 1, +get("day")));
  const diff = dow >= 3 ? dow - 3 : dow + 4;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function priorWednesdays(weekDate: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(`${weekDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
