"use client";

import type { CalendarEvent } from "@/lib/calendar/types";
import { eventsForDay, isToday, isPastDay } from "@/lib/calendar/dates";
import { EventChip } from "./EventChip";

// One day in the month grid. Today is distinct; past days within the month are
// dimmed rather than hidden; days from adjacent months are dimmed further
// (Phase 1 #6, #9). When more events land than fit, the surplus collapses into a
// "+N more" and the events open the day panel (Phase 1 #8).
//
// Two tap zones (Phase 1.5 #10): tapping the events opens the day panel to read
// them; tapping the empty area (or the date number) opens the Add Event panel
// pre-filled with this day — the entry point that actually gets used. They are
// separate layers, not nested buttons: a transparent full-cell "add" button
// sits behind a pointer-events-none content layer, and the events form their own
// button on top, so each tap lands where it should.

// How many chips a cell shows before collapsing to "+N more". Tuned so a cell at
// the target 1920×1080 height never overflows its row.
const MAX_VISIBLE = 3;

export function DayCell({
  date,
  events,
  inMonth,
  now,
  onOpenDay,
  onAddDay,
}: {
  date: Date;
  events: CalendarEvent[];
  inMonth: boolean;
  now: Date;
  onOpenDay: (date: Date) => void;
  onAddDay: (date: Date) => void;
}) {
  const dayEvents = eventsForDay(events, date);
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
    <div
      className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-r border-hairline ${cellTone}`}
    >
      {/* Background layer: taps on empty space / the date number add an event. */}
      <button
        type="button"
        onClick={() => onAddDay(date)}
        aria-label={`Add event on ${date.toDateString()}`}
        className="absolute inset-0 z-0"
      />

      {/* Content layer is transparent to pointer events, so taps fall through to
          the add button — except the events button, which re-enables them. The
          bottom padding is deliberately larger than the top: a full cell (three
          chips or "+N more") would otherwise butt right up against the rule. */}
      <div className="pointer-events-none relative z-10 flex min-h-0 flex-col gap-0.5 px-1.5 pb-1 pt-1">
        <div className="flex items-center">
          {today ? (
            <span className="flex size-8 items-center justify-center rounded-full bg-ink font-display text-[1.35rem] leading-none text-surface">
              {date.getDate()}
            </span>
          ) : (
            <span className={`font-display text-[1.5rem] leading-none ${numberTone}`}>
              {date.getDate()}
            </span>
          )}
        </div>

        {dayEvents.length > 0 && (
          <button
            type="button"
            onClick={() => onOpenDay(date)}
            aria-label={`Open ${date.toDateString()}`}
            className={`pointer-events-auto flex min-h-0 flex-col gap-0.5 overflow-hidden pb-0.5 text-left ${dim}`}
          >
            {visible.map((ev) => (
              <EventChip key={ev.id} event={ev} variant="grid" now={now} />
            ))}
            {overflow > 0 && (
              <span className="px-1.5 text-label font-medium text-ink-soft">
                +{overflow} more
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
