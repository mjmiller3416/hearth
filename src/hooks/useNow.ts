"use client";

import { useEffect, useMemo, useState } from "react";
import { zonedNow } from "@/lib/calendar/dates";

// "Now", refreshed on the minute, for everything that draws against the clock:
// the header time, today's marker, "happening now" in the school day.
//
// Both hooks are null until mounted, so the server render and the first client
// render agree (no hydration mismatch on a value that depends on the time).

/** The current instant, updated at each minute boundary. */
export function useClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    // First tick right away (from a timer, not the effect body), then on each
    // minute boundary so a clock flips on the minute.
    const first = setTimeout(() => setNow(new Date()), 0);
    const aligned = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      clearTimeout(first);
      clearTimeout(aligned);
      if (interval) clearInterval(interval);
    };
  }, []);
  return now;
}

/**
 * The household's wall clock as a Date whose LOCAL getters read the household
 * zone (see zonedNow), so "today" is right even on a device set to another
 * timezone. Updated on the minute; null until mounted.
 */
export function useNow(timeZone?: string): Date | null {
  const clock = useClock();
  // `clock` is a dependency on purpose: each minute tick recomputes the wall
  // clock even though zonedNow reads the time itself.
  return useMemo(() => (clock ? zonedNow(timeZone) : null), [clock, timeZone]);
}
