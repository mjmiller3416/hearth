import type { ScheduleActivity } from "./types";

// Date, time, and layout helpers for the Schedule view. Pure and client-safe:
// the route, the mock, and the view all share them. Dates are "YYYY-MM-DD" in the
// local calendar and times are 24h "HH:MM", matching Tandem.

/** Local-calendar "YYYY-MM-DD" (toISOString would shift to UTC). */
export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" → local midnight, or null if malformed. */
export function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 ? date : null;
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso) ?? new Date();
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

/** Monday of the week containing `iso` (Tandem's rule: Sat/Sun → the week before). */
export function mondayOf(iso: string): string {
  const date = parseIsoDate(iso) ?? new Date();
  return addDays(isoDate(date), -((date.getDay() + 6) % 7));
}

/**
 * The week the wall should rest on. On a weekday that's this week; on Saturday
 * or Sunday it's the coming week, because nothing in Tandem happens on weekends
 * and the useful glance is "what's Monday look like".
 */
export function restingMonday(today: string): string {
  const day = parseIsoDate(today)?.getDay() ?? 1;
  return day === 0 || day === 6 ? addDays(mondayOf(today), 7) : mondayOf(today);
}

/** The five weekdays starting at `monday`. */
export function weekdays(monday: string): string[] {
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

/** "HH:MM" → minutes since midnight. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** "13:05" → "1:05". The am/pm is left off; blocks sit on a labeled hour axis. */
export function shortTime(time: string): string {
  const minutes = toMinutes(time);
  const h = Math.floor(minutes / 60) % 12 || 12;
  return `${h}:${String(minutes % 60).padStart(2, "0")}`;
}

/** 13 → "1 PM". */
export function hourLabel(hour: number): string {
  return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}

/** "Sep 21 – 25", or "Sep 28 – Oct 2" across months. */
export function weekRangeLabel(monday: string): string {
  const start = parseIsoDate(monday) ?? new Date();
  const end = parseIsoDate(addDays(monday, 4)) ?? new Date();
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = start.getMonth() === end.getMonth() ? String(end.getDate()) : fmt(end);
  return `${fmt(start)} – ${endLabel}`;
}

// ── Visible hours ───────────────────────────────────────────────────────────
// Tandem allows 8 AM – 10 PM, but a school week rarely spans all of it. The grid
// fits the hours actually used (padded to whole hours, never under six) so the
// blocks stay large enough to read from across the room.
const DEFAULT_FIRST_HOUR = 8;
const DEFAULT_LAST_HOUR = 15;
const MIN_SPAN_HOURS = 6;
const LATEST_HOUR = 22;

/** [firstHour, lastHour] for the grid, both whole hours. */
export function visibleHours(activities: ScheduleActivity[]): [number, number] {
  if (activities.length === 0) return [DEFAULT_FIRST_HOUR, DEFAULT_LAST_HOUR];
  let first = Math.floor(Math.min(...activities.map((a) => toMinutes(a.start))) / 60);
  let last = Math.ceil(Math.max(...activities.map((a) => toMinutes(a.end))) / 60);
  first = Math.min(first, DEFAULT_FIRST_HOUR);
  if (last - first < MIN_SPAN_HOURS) last = Math.min(first + MIN_SPAN_HOURS, LATEST_HOUR);
  return [first, last];
}

// ── Overlap layout (mirrors Tandem's layoutLane) ────────────────────────────

export interface PlacedActivity {
  activity: ScheduleActivity;
  /** 0-based column within its overlap group. */
  column: number;
  /** How many columns its overlap group needs. */
  columns: number;
}

/**
 * Lay out one lane (one child, one day) so overlapping blocks sit side by side.
 * Blocks are grouped into clusters of transitively overlapping blocks; each takes
 * the first free column at its start, and the cluster shares one column count.
 * Back-to-back blocks (10:00 end, 10:00 start) don't overlap.
 */
export function layoutLane(activities: ScheduleActivity[]): PlacedActivity[] {
  const sorted = [...activities].sort(
    (a, b) =>
      toMinutes(a.start) - toMinutes(b.start) ||
      toMinutes(b.end) - toMinutes(a.end) ||
      a.id.localeCompare(b.id),
  );

  const placed: PlacedActivity[] = [];
  let cluster: PlacedActivity[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    for (const item of cluster) item.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };

  for (const activity of sorted) {
    const start = toMinutes(activity.start);
    const end = toMinutes(activity.end);
    if (start >= clusterEnd) closeCluster();
    clusterEnd = Math.max(clusterEnd, end);

    let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }

    const item = { activity, column, columns: 1 };
    cluster.push(item);
    placed.push(item);
  }
  closeCluster();
  return placed;
}
