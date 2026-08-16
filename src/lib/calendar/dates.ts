// Pure date helpers for the calendar grid. Client-safe (no imports beyond the
// event type). Every function works in the device's LOCAL time zone — a wall
// display shows the household's local days, and "today" means today where the
// wall hangs.
//
// The one genuine hazard here is all-day events. Google encodes them as
// date-only strings ("2026-08-13") with an EXCLUSIVE end date. `new Date(
// "2026-08-13")` parses as UTC midnight, which is the *previous* day in any
// negative-offset zone — a classic off-by-one. So date-only strings are parsed
// by hand into a local midnight, never through the Date string parser.

import type { CalendarEvent } from "./types";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse an event boundary into a local Date. Date-only strings become local
 * midnight of that calendar day; full datetimes are parsed normally (their
 * offset places them correctly on the local clock).
 */
export function parseBoundary(s: string): Date {
  const m = DATE_ONLY.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(s);
}

// ── Timezone-aware wall clock (Phase 2 #4) ──────────────────────────────────
// The wall must show the HOUSEHOLD's local time even when the device's own
// timezone is set wrong (as long as its UTC epoch is right). So every value
// derived from an absolute instant — the header clock, "today", a timed event's
// hour and which day-cell it lands in — is read in the configured household zone
// rather than the device zone. Date-only (all-day) values are floating calendar
// dates and are never zoned.

interface WallFields {
  y: number;
  m: number; // 1-based
  d: number;
  h: number; // 0–23
  mi: number;
  s: number;
}

/**
 * The wall-clock fields of an instant in the given IANA zone. With no zone (or
 * an invalid one) it falls back to the device's own local fields — the previous
 * behavior — so callers that pass `undefined` are unchanged.
 */
export function zonedFields(date: Date, tz?: string): WallFields {
  if (!tz) {
    return {
      y: date.getFullYear(),
      m: date.getMonth() + 1,
      d: date.getDate(),
      h: date.getHours(),
      mi: date.getMinutes(),
      s: date.getSeconds(),
    };
  }
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const p: Record<string, string> = {};
    for (const part of dtf.formatToParts(date)) {
      if (part.type !== "literal") p[part.type] = part.value;
    }
    return {
      y: Number(p.year),
      m: Number(p.month),
      d: Number(p.day),
      h: Number(p.hour),
      mi: Number(p.minute),
      s: Number(p.second),
    };
  } catch {
    return zonedFields(date, undefined);
  }
}

/**
 * "Now", but as a Date whose LOCAL getters read the household zone's wall clock.
 * Threaded everywhere the calendar asks "what day/time is it" so the whole view
 * agrees on the household's today even if the device's timezone is misconfigured.
 */
export function zonedNow(tz?: string): Date {
  const f = zonedFields(new Date(), tz);
  return new Date(f.y, f.m - 1, f.d, f.h, f.mi, f.s);
}

/** A local Date at midnight of an instant's household-zone calendar day. */
function zonedDayStart(instant: Date, tz?: string): Date {
  const f = zonedFields(instant, tz);
  return new Date(f.y, f.m - 1, f.d);
}

/** Midnight (local) at the start of the given date's day. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole-day difference a - b, ignoring time of day. */
function dayIndex(d: Date): number {
  return Math.floor(startOfDay(d).getTime() / 86_400_000);
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayIndex(a) === dayIndex(b);
}

export function isToday(d: Date, now: Date): boolean {
  return isSameDay(d, now);
}

/** True when `d`'s day is strictly before `now`'s day (past, not today). */
export function isPastDay(d: Date, now: Date): boolean {
  return dayIndex(d) < dayIndex(now);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Sunday-based start of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  return addDays(s, -s.getDay());
}

/**
 * The 6×7 matrix of days for a month grid: the weeks of `anchor`'s month, with
 * leading days from the previous month and trailing days from the next month
 * so every row is full (Phase 1 #6). Always six rows, so the grid never changes
 * height as months change — important for a fixed wall layout.
 */
export function monthMatrix(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

/** The seven days of the week containing `anchor`, Sunday first. */
export function weekDays(anchor: Date): Date[] {
  const s = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

/** The inclusive day range a month grid spans, for fetching (as Dates). */
export function monthGridRange(anchor: Date): { start: Date; end: Date } {
  const days = monthMatrix(anchor);
  return { start: days[0], end: addDays(days[days.length - 1], 1) };
}

/** The inclusive day range a week spans, for fetching (as Dates). */
export function weekRange(anchor: Date): { start: Date; end: Date } {
  const days = weekDays(anchor);
  return { start: days[0], end: addDays(days[days.length - 1], 1) };
}

/** "YYYY-MM-DD" in local time, for API query params. */
export function toDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Whether an event touches the given day. All-day events use Google's exclusive
 * end (so a [13th, 14th) event covers only the 13th). Timed events cover every
 * day from their start day through their end day inclusive, except an end that
 * lands exactly on midnight, which belongs to the prior day only.
 */
export function eventCoversDay(ev: CalendarEvent, day: Date, tz?: string): boolean {
  const target = dayIndex(day);

  if (ev.allDay) {
    // Date-only, floating: never zoned. Exclusive end → last covered day is -1.
    const startDay = dayIndex(parseBoundary(ev.start));
    const endExclusive = dayIndex(parseBoundary(ev.end));
    const lastDay = Math.max(startDay, endExclusive - 1);
    return target >= startDay && target <= lastDay;
  }

  // Timed: place the instant on its household-zone calendar day.
  const startDay = dayIndex(zonedDayStart(parseBoundary(ev.start), tz));
  const endFields = zonedFields(parseBoundary(ev.end), tz);
  // An end at exactly household midnight closes the previous day, not this one.
  const endsAtMidnight = endFields.h === 0 && endFields.mi === 0 && endFields.s === 0;
  const endBase = new Date(endFields.y, endFields.m - 1, endFields.d);
  const lastDay = dayIndex(endsAtMidnight ? addDays(endBase, -1) : endBase);
  return target >= startDay && target <= Math.max(startDay, lastDay);
}

/**
 * Sort key within a single day: all-day events first, then by start instant.
 * Stable ordering keeps the wall from reshuffling chips on every 60s poll.
 */
export function compareForDay(a: CalendarEvent, b: CalendarEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const ta = parseBoundary(a.start).getTime();
  const tb = parseBoundary(b.start).getTime();
  if (ta !== tb) return ta - tb;
  return a.title.localeCompare(b.title);
}

/** Events touching `day`, already ordered for display. */
export function eventsForDay(
  events: CalendarEvent[],
  day: Date,
  tz?: string,
): CalendarEvent[] {
  return events.filter((e) => eventCoversDay(e, day, tz)).sort(compareForDay);
}

/**
 * Compact time label for a timed event's chip, e.g. "9a", "2:30p". All-day
 * events return "" — their span is shown by placement, not a time (Phase 1 #7).
 * The compact form saves horizontal room in a chip and reads at a glance.
 */
export function eventTimeLabel(ev: CalendarEvent, tz?: string): string {
  if (ev.allDay) return "";
  const f = zonedFields(parseBoundary(ev.start), tz);
  let h = f.h;
  const min = f.mi;
  const suffix = h < 12 ? "a" : "p";
  h = h % 12;
  if (h === 0) h = 12;
  return min === 0 ? `${h}${suffix}` : `${h}:${String(min).padStart(2, "0")}${suffix}`;
}

/** Full clock label for the day panel / week view, e.g. "9:00 AM". */
export function eventClockLabel(ev: CalendarEvent, tz?: string): string {
  if (ev.allDay) return "All day";
  return parseBoundary(ev.start).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
}

/**
 * A full start–end label for an event detail view, e.g. "9:00 AM – 10:00 AM".
 * All-day events read "All day"; a timed event whose end lands on another day
 * carries that day so the span is never ambiguous.
 */
export function eventClockRange(ev: CalendarEvent, tz?: string): string {
  if (ev.allDay) return "All day";
  const start = parseBoundary(ev.start);
  const end = parseBoundary(ev.end);
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZone: tz };
  const startLabel = start.toLocaleTimeString(undefined, opts);
  const endLabel = end.toLocaleTimeString(undefined, opts);
  const sf = zonedFields(start, tz);
  const ef = zonedFields(end, tz);
  const sameDay = sf.y === ef.y && sf.m === ef.m && sf.d === ef.d;
  if (sameDay) return `${startLabel} – ${endLabel}`;
  const endDay = new Date(ef.y, ef.m - 1, ef.d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${startLabel} – ${endLabel} (${endDay})`;
}

/**
 * The date line for an event detail view. A single-day event reads
 * "Wednesday, August 13"; a multi-day span reads "Aug 13 – Aug 15". Timed
 * events resolve their day in the household zone; all-day dates are floating.
 */
export function eventDateLabel(ev: CalendarEvent, tz?: string): string {
  let startBase: Date;
  let lastDay: Date;
  if (ev.allDay) {
    startBase = parseBoundary(ev.start);
    // All-day Google ends are EXCLUSIVE — the last covered day is one earlier.
    lastDay = addDays(parseBoundary(ev.end), -1);
  } else {
    const sf = zonedFields(parseBoundary(ev.start), tz);
    startBase = new Date(sf.y, sf.m - 1, sf.d);
    const ef = zonedFields(parseBoundary(ev.end), tz);
    lastDay = new Date(ef.y, ef.m - 1, ef.d);
  }
  if (isSameDay(startBase, lastDay)) {
    return startBase.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${startBase.toLocaleDateString(undefined, opts)} – ${lastDay.toLocaleDateString(undefined, opts)}`;
}

/** "August 2026" — the confident heading for a month view (spec §7). */
export function monthTitle(anchor: Date): string {
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** "Aug 10 – 16" style label for a week view heading. */
export function weekTitle(anchor: Date): string {
  const days = weekDays(anchor);
  const first = days[0];
  const last = days[6];
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
  if (first.getMonth() === last.getMonth()) {
    return `${month(first)} ${first.getDate()} – ${last.getDate()}`;
  }
  return `${month(first)} ${first.getDate()} – ${month(last)} ${last.getDate()}`;
}

/** Long date heading for the day panel, e.g. "Wednesday, August 13". */
export function dayPanelTitle(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
