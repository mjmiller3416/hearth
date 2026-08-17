"use client";

import { Clock3 } from "lucide-react";
import { useTimeZone } from "@/components/common/TimeZone";

// Quiet "as of H:MM" stamp. Renders nothing until data is actually stale, so a
// healthy view shows no chrome at all (spec §6.2 — "a small timestamp, not a
// red banner"). Used everywhere via <ViewFrame />.

function formatTime(ts: number, tz?: string): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
}

export function StaleIndicator({
  isStale,
  lastUpdated,
}: {
  isStale: boolean;
  lastUpdated: number | null;
}) {
  // Read the household zone so the stamp agrees with the header clock even when
  // the device's own timezone is misconfigured (the whole reason TimeZoneProvider
  // exists). Undefined (no provider) falls back to the device zone, as before.
  const timeZone = useTimeZone();
  if (!isStale || lastUpdated == null) return null;

  return (
    <span
      className="inline-flex items-center gap-2 text-stamp text-ink-faint"
      role="status"
      aria-live="polite"
    >
      <Clock3 className="size-5" aria-hidden />
      as of {formatTime(lastUpdated, timeZone)}
    </span>
  );
}
