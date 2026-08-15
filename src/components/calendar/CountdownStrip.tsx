"use client";

import type { CalendarEvent } from "@/lib/calendar/types";
import { colorVar } from "@/lib/calendar/palette";
import { countdownDays, countdownLabel } from "@/lib/calendar/event";

// The single-line countdown strip above the grid (Phase 1.5 #21): the soonest
// upcoming countdown event only — one line, not a section. A quiet warm rule
// with the event's color as a dot; saturation stays reserved for people.

export function CountdownStrip({
  event,
  now,
}: {
  event: CalendarEvent;
  now: Date;
}) {
  const days = countdownDays(event, now);
  const dot = event.colors[0] ?? "neutral";

  return (
    <div className="flex items-center gap-3 rounded-full bg-surface px-5 py-2 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: `var(${colorVar(dot)})` }}
        aria-hidden
      />
      <span className="truncate text-body text-ink">
        <span className="font-medium">{event.title}</span>
        <span className="text-ink-soft"> · {countdownLabel(days)}</span>
      </span>
    </div>
  );
}
