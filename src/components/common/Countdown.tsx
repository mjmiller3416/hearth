"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { CalendarEvent, CalendarPayload } from "@/lib/calendar/types";
import { addDays, toDateParam, zonedNow } from "@/lib/calendar/dates";
import { soonestCountdown } from "@/lib/calendar/event";
import { useUpstream } from "@/hooks/useUpstream";
import { useMounted } from "@/lib/prefs";
import { useTimeZone } from "./TimeZone";

// The household's next countdown (spec D10): the soonest upcoming event flagged
// "countdown", shown live in the header on every screen and on Today.
//
// It used to be published by the calendar view, so it vanished the moment you
// opened any other page. The provider now looks for it itself: one calendar
// read covering the next three months (the window the server already keeps in
// memory), refreshed every five minutes.

const LOOK_AHEAD_DAYS = 92;
const REFRESH_MS = 5 * 60_000;

const CountdownEventContext = createContext<CalendarEvent | null>(null);

export function CountdownProvider({ children }: { children: ReactNode }) {
  const timeZone = useTimeZone();
  const mounted = useMounted();

  const fetcher = useCallback(async (): Promise<CalendarPayload> => {
    const today = zonedNow(timeZone);
    const start = toDateParam(today);
    const end = toDateParam(addDays(today, LOOK_AHEAD_DAYS));
    const res = await fetch(`/api/calendar?start=${start}&end=${end}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`calendar ${res.status}`);
    return res.json();
  }, [timeZone]);

  const { data } = useUpstream<CalendarPayload>(fetcher, {
    intervalMs: REFRESH_MS,
    enabled: mounted,
  });

  const event = useMemo(
    () => (data ? soonestCountdown(data.events, zonedNow(timeZone)) : null),
    [data, timeZone],
  );

  return <CountdownEventContext.Provider value={event}>{children}</CountdownEventContext.Provider>;
}

/** The event currently counting down, or null. */
export function useCountdownEvent(): CalendarEvent | null {
  return useContext(CountdownEventContext);
}
