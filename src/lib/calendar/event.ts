// Client-safe event helpers. Pure functions over the normalized CalendarEvent
// shape and a `now` Date — no env, no server imports — so the view components
// can use them freely. (Color *resolution* lives server-side in config.ts and
// is baked onto event.colors; these are the questions the client still asks.)

import type { CalendarEvent } from "./types";
import { parseBoundary, startOfDay } from "./dates";

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

/** "Today", "Tomorrow", "in 12 days" — the countdown label for a badge/strip. */
export function countdownLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `in ${days} days`;
}
