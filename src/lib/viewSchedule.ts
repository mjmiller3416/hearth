import { VIEW_SCHEDULE, type ViewScheduleEntry } from "@/lib/config";

// Pure helpers for the timed view schedule (VIEW_SCHEDULE in config.ts). No
// React, no Next — importable from both the `/` server redirect and the
// client-side <ViewScheduler>.

/** Minutes since local midnight for `instant`, in `timeZone` (device zone if unset). */
export function minutesOfDay(instant: Date, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

function parseAt(at: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(at.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Parsed once, sorted by time; malformed entries are dropped rather than
// crashing the wall.
const SLOTS = VIEW_SCHEDULE.map((e: ViewScheduleEntry) => ({
  start: parseAt(e.at),
  href: e.href,
}))
  .filter((s): s is { start: number; href: string } => s.start !== null)
  .sort((a, b) => a.start - b.start);

/**
 * The scheduled slot in effect at `instant`: the latest entry at or before the
 * current household time, wrapping to the last entry before the first boundary
 * of the day. `key` identifies the slot (its start minute) so callers can tell
 * when a boundary has passed. Null when the schedule is empty.
 */
export function currentSlot(
  instant: Date,
  timeZone?: string,
): { key: number; href: string } | null {
  if (SLOTS.length === 0) return null;
  const now = minutesOfDay(instant, timeZone);
  let slot = SLOTS[SLOTS.length - 1];
  for (const s of SLOTS) {
    if (s.start <= now) slot = s;
    else break;
  }
  return { key: slot.start, href: slot.href };
}
