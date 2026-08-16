"use client";

import type { CalendarEvent } from "@/lib/calendar/types";
import { eventsForDay, isToday, isPastDay } from "@/lib/calendar/dates";
import { useTimeZone } from "@/components/common/TimeZone";
import { EventChip } from "./EventChip";

// One day in the month grid. Today is distinct; past days within the month are
// dimmed rather than hidden; days from adjacent months are dimmed further
// (Phase 1 #6, #9). When more events land than fit, the surplus collapses into a
// "+N more".
//
// As of Phase 2 #10 the cell is a SINGLE tap target: tapping anywhere opens the
// day panel (its list of events, or a single event's detail). Adding an event is
// the FAB's job now, and lives inside the day panel — a tap on the grid never
// starts a new event, which also removes the old two-layer pointer-events dance
// that made taps unreliable (#8).

// How many chips a cell shows before collapsing to "+N more". Tuned so a cell at
// the target 1920×1080 height never overflows its row.
const MAX_VISIBLE = 3;

export function DayCell({
  date,
  events,
  inMonth,
  now,
  onOpenDay,
}: {
  date: Date;
  events: CalendarEvent[];
  inMonth: boolean;
  now: Date;
  onOpenDay: (date: Date) => void;
}) {
  const timeZone = useTimeZone();
  const dayEvents = eventsForDay(events, date, timeZone);
  const today = isToday(date, now);
  const past = isPastDay(date, now);

  const visible = dayEvents.length > MAX_VISIBLE
    ? dayEvents.slice(0, MAX_VISIBLE - 1)
    : dayEvents;
  const overflow = dayEvents.length - visible.length;

  const cellTone = !inMonth
    ? "bg-ground-2/60"
    : today
      ? "bg-surface"
      : "bg-transparent";

  // Dim content (not the today marker) for past and out-of-month days.
  const dim = !inMonth ? "opacity-45" : past ? "opacity-60" : "";

  const numberTone = !inMonth
    ? "text-ink-faint"
    : past
      ? "text-ink-soft"
      : "text-ink";

  return (
    <button
      type="button"
      onClick={() => onOpenDay(date)}
      aria-label={`Open ${date.toDateString()}`}
      className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-r border-hairline text-left transition-colors hover:bg-surface/60 active:bg-surface ${cellTone}`}
    >
      <div className="relative z-10 flex min-h-0 flex-col gap-0.5 px-1.5 pb-1 pt-1">
        <div className="flex items-center">
          {today ? (
            <span className="flex size-10 items-center justify-center rounded-full bg-ink font-display text-[1.35rem] leading-none text-surface">
              {date.getDate()}
            </span>
          ) : (
            <span className={`font-display text-[1.5rem] leading-none ${numberTone}`}>
              {date.getDate()}
            </span>
          )}
        </div>

        {dayEvents.length > 0 && (
          <div className={`flex min-h-0 flex-col gap-0.5 overflow-hidden pb-0.5 ${dim}`}>
            {visible.map((ev) => (
              <EventChip key={ev.id} event={ev} variant="grid" now={now} />
            ))}
            {overflow > 0 && (
              <span className="px-1.5 text-label font-medium text-ink-soft">
                +{overflow} more
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
