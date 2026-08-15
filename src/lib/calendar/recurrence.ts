import type { RepeatRule } from "./types";

// RRULE and timezone helpers for the write path (Phase 1.5). Server-side only.
//
// Recurrence is assembled here, never in the browser (Phase 1.5 #13): the client
// sends a small structured choice ({ freq, end }) and this builds the RFC-5545
// RRULE that Google — and every phone — will honor. Recurrence is real calendar
// data, not a Hearth extended property, precisely so phones repeat it correctly.

/**
 * The household timezone. Google requires an explicit timezone on event creation
 * and will not infer it (Phase 1.5 manual setup #4). Falls back to the server's
 * own zone if HOUSEHOLD_TIMEZONE is unset — set it explicitly on Railway.
 */
export function resolveTimeZone(): string {
  const tz = process.env.HOUSEHOLD_TIMEZONE?.trim();
  if (tz) return tz;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

// The UTC offset (ms) in effect at `instant` for `tz`: format the instant in the
// zone, read it back as if those wall components were UTC, and difference.
function tzOffsetMs(instant: Date, tz: string): number {
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
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

// Convert wall-clock components in `tz` to the true UTC instant. One-shot
// approximation (ignores the rare DST-transition ambiguity) — fine for a
// household wall picking an event's end-of-recurrence date.
function zonedWallToUtc(
  y: number,
  mo0: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string,
): Date {
  const guess = Date.UTC(y, mo0, d, h, mi, s);
  return new Date(guess - tzOffsetMs(new Date(guess), tz));
}

// "2026-08-14T03:59:59.000Z" -> "20260814T035959Z" (RFC-5545 UTC basic form).
function toBasicUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
}

const FREQ: Record<RepeatRule["freq"], string> = {
  daily: "DAILY",
  weekly: "WEEKLY", // repeats on the start day (Google infers BYDAY from DTSTART)
  monthly: "MONTHLY", // repeats on the start date (BYMONTHDAY from DTSTART)
  yearly: "YEARLY",
};

/**
 * Build the `recurrence` array for a Google event, or undefined for a one-off.
 * `until` (a "YYYY-MM-DD") is rendered as a bare date for all-day events and as
 * an end-of-day UTC instant for timed ones — the RFC requires UNTIL in UTC when
 * DTSTART carries a time, and this is exactly where "end condition" bugs hide.
 */
export function buildRecurrence(
  repeat: RepeatRule | null,
  allDay: boolean,
  tz: string,
): string[] | undefined {
  if (!repeat) return undefined;

  let rule = `FREQ=${FREQ[repeat.freq]}`;
  const end = repeat.end;

  if (end.mode === "count") {
    rule += `;COUNT=${end.count}`;
  } else if (end.mode === "until") {
    const [y, m, d] = end.until.split("-").map(Number);
    if (allDay) {
      rule += `;UNTIL=${y}${pad(m)}${pad(d)}`;
    } else {
      rule += `;UNTIL=${toBasicUtc(zonedWallToUtc(y, m - 1, d, 23, 59, 59, tz))}`;
    }
  }

  return [`RRULE:${rule}`];
}
