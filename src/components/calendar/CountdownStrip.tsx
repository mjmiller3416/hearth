"use client";

import { Hourglass } from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar/types";
import { colorVar } from "@/lib/calendar/palette";
import { countdownDays, countdownLabel } from "@/lib/calendar/event";
import { useTextOn } from "@/components/common/ColorProvider";

// The single-line countdown strip above the grid (Phase 1.5 #21, polished
// Phase 2 #12): the soonest upcoming countdown event only — one line, not a
// section. A colored hourglass badge in the event's color leads it, so the next
// big thing reads at a glance; the day count is set apart in a quiet pill.

export function CountdownStrip({
  event,
  now,
}: {
  event: CalendarEvent;
  now: Date;
}) {
  const days = countdownDays(event, now);
  const color = event.colors[0] ?? "neutral";
  const textOn = useTextOn();
  const onColor = textOn(color) === "dark" ? "text-ink" : "text-white";

  return (
    <div className="flex items-center gap-3 rounded-full bg-surface py-2 pl-2 pr-5 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${onColor}`}
        style={{ backgroundColor: `var(${colorVar(color)})` }}
        aria-hidden
      >
        <Hourglass className="size-4" strokeWidth={2.25} />
      </span>
      <span className="truncate text-body font-medium text-ink">{event.title}</span>
      <span className="ml-auto shrink-0 rounded-full bg-ground px-3 py-0.5 text-label font-medium text-ink-soft">
        {countdownLabel(days)}
      </span>
    </div>
  );
}
