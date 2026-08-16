"use client";

import type { CalendarEvent } from "@/lib/calendar/types";
import { monthMatrix, WEEKDAY_LABELS } from "@/lib/calendar/dates";
import { DayCell } from "./DayCell";

// The month grid: a weekday header over six week-rows (Phase 1 #6). Always six
// rows so the layout never jumps height between months — important for a fixed
// wall. Hairline rules, not card borders (spec §7): each cell draws its own
// bottom/right rule and the container closes the top/left, so the grid reads as
// a ledger, not a set of tiles.

export function MonthGrid({
  anchor,
  events,
  now,
  onOpenDay,
}: {
  anchor: Date;
  events: CalendarEvent[];
  now: Date;
  onOpenDay: (date: Date) => void;
}) {
  const days = monthMatrix(anchor);
  const anchorMonth = anchor.getMonth();

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-l border-t border-hairline">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="border-b border-r border-hairline py-2 text-center text-label font-medium uppercase tracking-wide text-ink-soft"
          >
            {label}
          </div>
        ))}
      </div>
      <div
        className="grid min-h-0 flex-1 grid-cols-7 border-l border-hairline"
        style={{ gridTemplateRows: "repeat(6, minmax(0, 1fr))" }}
      >
        {days.map((date) => (
          <DayCell
            key={date.getTime()}
            date={date}
            events={events}
            inMonth={date.getMonth() === anchorMonth}
            now={now}
            onOpenDay={onOpenDay}
          />
        ))}
      </div>
    </div>
  );
}
