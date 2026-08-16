"use client";

import type { CalendarEvent } from "@/lib/calendar/types";
import {
  weekDays,
  eventsForDay,
  isToday,
  isPastDay,
  WEEKDAY_LABELS,
} from "@/lib/calendar/dates";
import { useTimeZone } from "@/components/common/TimeZone";
import { EventChip } from "./EventChip";

// Week view (Phase 1 #12): the same data and colors as the month grid, laid out
// as seven day-columns with events in vertical time order. Secondary to month
// view — a toggle, not a rebuild. Today's column is distinct; past days dim.
// Deliberately a time-ordered list per column, not a positioned time-grid: at
// six feet a legible ordered list beats a dense hour ruler.
//
// As of Phase 2 #10 each column is a SINGLE tap target that opens the day panel;
// adding an event is the FAB's job now (no tap-to-add on the grid).

export function WeekView({
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
  const timeZone = useTimeZone();
  const days = weekDays(anchor);

  return (
    <div className="grid h-full grid-cols-7 gap-3">
      {days.map((date) => {
        const dayEvents = eventsForDay(events, date, timeZone);
        const today = isToday(date, now);
        const past = isPastDay(date, now);

        return (
          <button
            key={date.getTime()}
            type="button"
            onClick={() => onOpenDay(date)}
            aria-label={`Open ${date.toDateString()}`}
            className={`relative flex min-h-0 flex-col rounded-2xl px-3 pb-3 pt-3 text-left transition-colors hover:bg-surface/60 ${
              today ? "bg-surface shadow-[inset_0_0_0_1px_var(--color-hairline)]" : ""
            }`}
          >
            <div className="mb-3 flex items-baseline gap-2 border-b border-hairline pb-2">
              <span className="text-label font-medium uppercase tracking-wide text-ink-soft">
                {WEEKDAY_LABELS[date.getDay()]}
              </span>
              <span
                className={`font-display text-title leading-none ${
                  today ? "text-ink" : past ? "text-ink-faint" : "text-ink"
                }`}
              >
                {date.getDate()}
              </span>
            </div>

            {dayEvents.length === 0 ? (
              <span className="text-label text-ink-faint">—</span>
            ) : (
              <div
                className={`flex min-h-0 flex-1 flex-col gap-2 overflow-hidden ${
                  past ? "opacity-60" : ""
                }`}
              >
                {dayEvents.map((ev) => (
                  <EventChip key={ev.id} event={ev} variant="grid" now={now} />
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
