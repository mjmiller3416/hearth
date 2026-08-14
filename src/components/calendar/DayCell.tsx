"use client";

import type { CalendarEvent } from "@/lib/calendar/types";
import { eventsForDay, isToday, isPastDay } from "@/lib/calendar/dates";
import { EventChip } from "./EventChip";

// One day in the month grid. Today is distinct; past days within the month are
// dimmed rather than hidden; days from adjacent months are dimmed further
// (Phase 1 #6, #9). When more events land than fit, the surplus collapses into a
// "+N more" and the whole cell opens the day panel (Phase 1 #8).

// How many chips a cell shows before collapsing to "+N more". Tuned so a cell at
// the target 1920×1080 height never overflows its row.
const MAX_VISIBLE = 3;

export function DayCell({
  date,
  events,
  inMonth,
  now,
  onOpen,
}: {
  date: Date;
  events: CalendarEvent[];
  inMonth: boolean;
  now: Date;
  onOpen: (date: Date) => void;
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

  const Wrapper = dayEvents.length > 0 ? "button" : "div";

  return (
    <Wrapper
      {...(dayEvents.length > 0
        ? { type: "button" as const, onClick: () => onOpen(date), "aria-label": `Open ${date.toDateString()}` }
        : {})}
      className={`flex min-h-0 min-w-0 flex-col gap-0.5 overflow-hidden border-b border-r border-hairline px-1.5 py-1 text-left ${cellTone}`}
    >
      <div className="mb-0.5 flex items-center">
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

      <div className={`flex min-h-0 flex-col gap-0.5 overflow-hidden ${dim}`}>
        {visible.map((ev) => (
          <EventChip key={ev.id} event={ev} variant="grid" />
        ))}
        {overflow > 0 && (
          <span className="px-1.5 text-label font-medium text-ink-soft">
            +{overflow} more
          </span>
        )}
      </div>
    </Wrapper>
  );
}
