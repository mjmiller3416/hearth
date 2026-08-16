"use client";

import { useEffect, useState } from "react";
import { useTimeZone } from "@/components/common/TimeZone";

// Day · date · time. The time updates every minute, not every second (Phase 0
// #6) — a second hand ticking in peripheral vision all day is an irritant, and
// the display is glance-first. Updates are aligned to the top of each minute so
// the clock flips on the minute, not on a drifting offset.
//
// Rendered in the HOUSEHOLD timezone, not the device's (Phase 2 #4): the wall
// shows the right local time even if the Skylight's own timezone is set wrong.
export function HeaderBar() {
  const timeZone = useTimeZone();
  // Null until mounted so server and first client render match (no hydration
  // mismatch on a value that depends on the current time).
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());

    let interval: ReturnType<typeof setInterval> | undefined;
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, msToNextMinute);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  const dayName = now
    ? now.toLocaleDateString(undefined, { weekday: "long", timeZone })
    : "";
  const dateStr = now
    ? now.toLocaleDateString(undefined, { month: "long", day: "numeric", timeZone })
    : "";
  const timeStr = now
    ? now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone })
    : "";

  return (
    <header className="flex items-end justify-between border-b border-hairline px-10 pb-5 pt-7">
      <div className="flex items-baseline gap-5">
        <span className="font-display text-display leading-none text-ink">
          {dayName}
        </span>
        <span className="text-title text-ink-soft">{dateStr}</span>
      </div>
      <span
        className="font-display text-display leading-none tabular-nums text-ink"
        suppressHydrationWarning
      >
        {timeStr}
      </span>
    </header>
  );
}
