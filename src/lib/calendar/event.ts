// Client-safe event helpers. Pure functions over the normalized CalendarEvent
// shape and a `now` Date — no env, no server imports — so the view components
// can use them freely. (Color *resolution* lives server-side in config.ts and
// is baked onto event.colors; these are the questions the client still asks.)

import type { CalendarEvent } from "./types";
import { parseBoundary, startOfDay, zonedFields } from "./dates";
import { EVERYONE_COLOR } from "./palette";

// The sentinel filter key for the "Family" chip (Phase 2 #2). Distinct from any
// real member key (member slugs are lowercase words), so it can share the same
// `filter: string | null` channel as the member chips.
export const FAMILY_FILTER_KEY = "__family__";

/**
 * Whether a member (by key) is "concerned" with an event — the filter-chip
 * predicate. A member concerns an event when they are tagged on it, or, for an
 * untagged event, when they own the calendar it lives on (the Phase 1 fallback).
 * This is exactly the set `resolveEventColors` would paint for that member, so
 * filtering and coloring never disagree.
 */
export function memberConcerns(event: CalendarEvent, memberKey: string): boolean {
  if (event.memberKeys.length > 0) return event.memberKeys.includes(memberKey);
  return event.defaultMemberKey === memberKey;
}

// A 4+-member event is baked with the literal member slugs, not the "everyone"
// slug; EventChip's `bandsFor` collapses anything past this cap to the single
// "everyone" fill. The Family filter must mirror that exact rule so it and the
// chip's paint never disagree — hence the ">cap" clause alongside the baked
// everyone slug (which covers untagged family-calendar events). Keep in sync with
// EventChip.BAND_CAP.
const EVERYONE_BAND_CAP = 3;

/**
 * Whether an event is a whole-family / shared one — the "Family" filter chip
 * predicate (Phase 2 #2). True exactly when it resolves to the shared "everyone"
 * treatment: an untagged event on the family calendar (baked as the "everyone"
 * slug), or one assigned to four or more people (baked as 4+ member slugs, which
 * the chip collapses to "everyone"). Mirrors what EventChip actually paints so
 * the filter and the chip's fill never disagree.
 */
export function concernsFamily(event: CalendarEvent): boolean {
  return (
    event.colors.includes(EVERYONE_COLOR) ||
    event.colors.length > EVERYONE_BAND_CAP
  );
}

/**
 * Whole-day count from `now` to the event's start day. 0 means today, 1
 * tomorrow. Negative once the day has passed. Uses local day boundaries so a
 * countdown ticks over at midnight where the wall hangs.
 */
export function countdownDays(event: CalendarEvent, now: Date): number {
  const startDay = startOfDay(parseBoundary(event.start)).getTime();
  const today = startOfDay(now).getTime();
  return Math.round((startDay - today) / 86_400_000);
}

/**
 * The soonest still-upcoming countdown event (today or later), or null. Drives
 * the single-line strip above the grid (Phase 1.5 #21) — one event, not a list.
 */
export function soonestCountdown(
  events: CalendarEvent[],
  now: Date,
): CalendarEvent | null {
  let best: CalendarEvent | null = null;
  let bestDays = Infinity;
  for (const ev of events) {
    if (!ev.countdown) continue;
    const days = countdownDays(ev, now);
    if (days < 0) continue; // already passed
    if (days < bestDays) {
      best = ev;
      bestDays = days;
    }
  }
  return best;
}

/** "Today", "Tomorrow", "in 12 days" — the day-granular countdown label. */
export function countdownLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `in ${days} days`;
}

/**
 * Milliseconds from `nowMs` until the countdown moment — a timed event's start
 * instant, or midnight (household wall clock) at the start of an all-day
 * event's day. Negative once it has arrived. Drives the live header countdown.
 *
 * A timed start is an absolute instant, so it compares straight against the
 * real clock. An all-day start is a floating date that `parseBoundary` places
 * at LOCAL midnight, so it is compared against "now" read in that same frame —
 * the household zone's wall-clock fields as a local Date, exactly what
 * `zonedNow` does for the rest of the calendar.
 */
export function countdownRemainingMs(
  event: CalendarEvent,
  nowMs: number,
  tz?: string,
): number {
  const start = parseBoundary(event.start).getTime();
  if (!event.allDay) return start - nowMs;
  const f = zonedFields(new Date(nowMs), tz);
  const wall = new Date(f.y, f.m - 1, f.d, f.h, f.mi, f.s).getTime();
  return start - wall;
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Split a remaining span into whole days / hours / minutes / seconds. Seconds
 * round UP so a tick that lands a few ms after the second boundary still reads
 * the second genuinely left (a floor would show one less for most of every
 * second and hit zero a second early). Never negative: an arrived countdown is
 * all zeros.
 */
export function countdownParts(remainingMs: number): CountdownParts {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}
