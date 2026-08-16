"use client";

import { createContext, useContext, type ReactNode } from "react";

// The household timezone, provided once at the app chrome and read by every
// client component that renders a wall clock (Phase 2 #4). The value comes from
// the server (HOUSEHOLD_TIMEZONE via resolveTimeZone) so the whole display shows
// the household's local time even when the device's own timezone is set wrong.
// `undefined` means "use the device zone" — the pre-Phase-2 behavior.

const TimeZoneContext = createContext<string | undefined>(undefined);

export function TimeZoneProvider({
  tz,
  children,
}: {
  tz?: string;
  children: ReactNode;
}) {
  return <TimeZoneContext.Provider value={tz}>{children}</TimeZoneContext.Provider>;
}

export function useTimeZone(): string | undefined {
  return useContext(TimeZoneContext);
}
