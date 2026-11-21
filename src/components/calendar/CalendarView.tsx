"use client";

import { useCallback, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useHousehold } from "@/components/app/Household";
import { useTimeZone } from "@/components/common/TimeZone";
import { Button, IconButton, Segmented } from "@/components/ui/Button";
import { AsOf, Card, EmptyState, SourceGate } from "@/components/ui/Card";
import { Page } from "@/components/ui/Page";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { useIdleReset } from "@/hooks/useIdleReset";
import { useNow } from "@/hooks/useNow";
import type { CalendarEvent, Member } from "@/lib/calendar/types";
import { colorVar } from "@/lib/calendar/palette";
import {
  addDays,
  addMonths,
  dayPanelTitle,
  eventsForDay,
  isPastDay,
  isSameDay,
  isToday,
  monthGridRange,
  monthMatrix,
  monthTitle,
  toDateParam,
  weekDays,
  weekRange,
  weekTitle,
  WEEKDAY_LABELS,
  zonedNow,
} from "@/lib/calendar/dates";
import { concernsFamily, memberConcerns } from "@/lib/calendar/event";
import { useDeviceClass } from "@/lib/prefs";
import { bandsFor, EventChip, EventRow } from "./EventChip";
import { useEventSheets } from "./EventSheets";

// The calendar (spec §4.1). Google Calendar is the system of record; this reads
// it and can create, edit and delete non-recurring events (D2).
//
//   wide   a month grid (the family's habit) or a week of day columns. Tapping
//          a day opens it.
//   phone  the month as a compact grid of dots with the selected day's events
//          listed beneath, the pattern every phone calendar uses.
//
// The lens does the filtering the member chips used to: pick a person and the
// calendar shows what concerns them, including whole-family events.

type ViewMode = "month" | "week";

/** Events the lens shows: everyone's, or one person's plus the family's. */
export function eventsForLens(events: CalendarEvent[], lensKey: string | null): CalendarEvent[] {
  if (!lensKey) return events;
  return events.filter((e) => memberConcerns(e, lensKey) || concernsFamily(e));
}

export function CalendarView() {
  const timeZone = useTimeZone();
  const { lens } = useHousehold();
  const device = useDeviceClass();
  const clock = useNow(timeZone);
  const [picked, setPicked] = useState<ViewMode>("month");
  // null = follow today, so a screen left on the calendar rolls into the new
  // month by itself.
  const [anchorDate, setAnchorDate] = useState<Date | null>(null);
  const [selected, setSelected] = useState<Date | null>(null);

  // A placeholder "now" keeps the hooks below in order during SSR; nothing is
  // fetched or drawn from it (the view waits for the real clock).
  const now = clock ?? zonedNow(timeZone);
  const anchor = anchorDate ?? now;
  const mode: ViewMode = device === "phone" ? "month" : picked;

  const range = mode === "month" ? monthGridRange(anchor) : weekRange(anchor);
  const calendar = useCalendarEvents(toDateParam(range.start), toDateParam(range.end));
  const events = eventsForLens(calendar.events, lens?.key ?? null);
  const sheets = useEventSheets({ calendar, events, now: clock });

  const closeSheets = sheets.close;
  useIdleReset(
    useCallback(() => {
      setAnchorDate(null);
      setPicked("month");
      setSelected(null);
      closeSheets();
    }, [closeSheets]),
  );

  const step = (dir: number) => {
    setAnchorDate(mode === "month" ? addMonths(anchor, dir) : addDays(anchor, dir * 7));
    setSelected(null);
  };
  const goToday = () => {
    setAnchorDate(null);
    setSelected(null);
  };

  // The day a phone lists: the tapped one, else today when it's in view, else
  // the first of the month.
  const sameMonth = (d: Date) => d.getMonth() === anchor.getMonth() && d.getFullYear() === anchor.getFullYear();
  const phoneDay = selected ?? (sameMonth(now) ? now : new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const atToday = anchorDate === null && (selected === null || isSameDay(selected, now));

  const onDay = (date: Date) => {
    if (device === "phone") setSelected(date);
    else sheets.openDay(date);
  };

  return (
    <Page
      // The title waits for the real clock so the server and the browser can't
      // disagree about the month at a boundary.
      title={!clock ? "Calendar" : mode === "month" ? monthTitle(anchor) : weekTitle(anchor)}
      controls={
        <>
          <span className="flex items-center gap-1">
            <IconButton label={mode === "month" ? "Previous month" : "Previous week"} onClick={() => step(-1)}>
              <ChevronLeft className="size-6" strokeWidth={2.25} aria-hidden />
            </IconButton>
            <Button size="sm" onClick={goToday} disabled={atToday}>
              Today
            </Button>
            <IconButton label={mode === "month" ? "Next month" : "Next week"} onClick={() => step(1)}>
              <ChevronRight className="size-6" strokeWidth={2.25} aria-hidden />
            </IconButton>
          </span>
          {/* Week view and the Event button are for wide screens; a phone has
              the agenda under the grid and the floating add button. */}
          <span className="hidden items-center gap-4 wide:flex">
            <AsOf isStale={calendar.state.isStale} lastUpdated={calendar.state.lastUpdated} />
            <Segmented
              label="Calendar view"
              value={picked}
              onChange={setPicked}
              options={[
                { value: "month", label: "Month" },
                { value: "week", label: "Week" },
              ]}
            />
            {calendar.canAdd && (
              <Button variant="primary" onClick={() => sheets.openAdd(now)}>
                <Plus className="size-5" strokeWidth={2.75} aria-hidden />
                Event
              </Button>
            )}
          </span>
        </>
      }
    >
      <SourceGate
        state={calendar.state}
        configured={calendar.configured}
        app="Google Calendar"
        what="The family calendar"
        rows={6}
      >
        {!clock ? null : (
          <div className="flex flex-col gap-4 pb-20 wide:h-full wide:pb-0">
            <Card
              className="wide:min-h-0 wide:flex-1"
              bodyClassName="flex flex-col !p-2 wide:!p-3"
            >
              {mode === "month" ? (
                <MonthGrid
                  anchor={anchor}
                  events={events}
                  now={now}
                  selected={device === "phone" ? phoneDay : null}
                  onDay={onDay}
                />
              ) : (
                <WeekGrid anchor={anchor} events={events} now={now} onDay={onDay} />
              )}
            </Card>

            {/* Phone: the selected day's events. */}
            <div className="wide:hidden">
              <DayAgenda
                date={phoneDay}
                events={eventsForDay(events, phoneDay, timeZone)}
                members={calendar.members}
                now={now}
                onOpen={sheets.openEvent}
                stamp={<AsOf isStale={calendar.state.isStale} lastUpdated={calendar.state.lastUpdated} />}
              />
            </div>
          </div>
        )}
      </SourceGate>

      {/* Phone: the add button floats above the tab bar, under the thumb. */}
      {calendar.canAdd && (
        <button
          type="button"
          onClick={() => sheets.openAdd(phoneDay)}
          aria-label="Add event"
          className="fixed bottom-20 right-4 z-30 flex size-14 items-center justify-center rounded-full bg-ink text-on-ink shadow-pop active:scale-95 wide:hidden"
          style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <Plus className="size-7" strokeWidth={2.5} aria-hidden />
        </button>
      )}

      {sheets.element}
    </Page>
  );
}

// ── Month ───────────────────────────────────────────────────────────────────

// How many chips a wide cell shows before collapsing to "+N more".
const MAX_CHIPS = 3;

function MonthGrid({
  anchor,
  events,
  now,
  selected,
  onDay,
}: {
  anchor: Date;
  events: CalendarEvent[];
  now: Date;
  /** The highlighted day on a phone; null on a wide screen. */
  selected: Date | null;
  onDay: (date: Date) => void;
}) {
  const timeZone = useTimeZone();
  const days = monthMatrix(anchor);
  const month = anchor.getMonth();

  return (
    <div className="flex flex-col wide:h-full">
      <div className="grid shrink-0 grid-cols-7">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="pb-1.5 pt-1 text-center text-stamp font-semibold uppercase tracking-[0.08em] text-ink-faint wide:text-label"
          >
            {label}
          </div>
        ))}
      </div>
      {/* Always six rows so the layout never jumps between months. */}
      <div
        className="grid grid-cols-7 overflow-hidden rounded-2xl border-l border-t border-hairline wide:min-h-0 wide:flex-1"
        style={{ gridTemplateRows: "repeat(6, minmax(0, 1fr))" }}
      >
        {days.map((date) => {
          const dayEvents = eventsForDay(events, date, timeZone);
          const inMonth = date.getMonth() === month;
          const today = isToday(date, now);
          const past = isPastDay(date, now);
          const isSelected = selected !== null && isSameDay(date, selected);
          const visible = dayEvents.length > MAX_CHIPS ? dayEvents.slice(0, MAX_CHIPS - 1) : dayEvents;
          const overflow = dayEvents.length - visible.length;
          return (
            <button
              key={date.getTime()}
              type="button"
              onClick={() => onDay(date)}
              aria-label={`${dayPanelTitle(date)}, ${dayEvents.length} ${dayEvents.length === 1 ? "event" : "events"}`}
              aria-pressed={selected ? isSelected : undefined}
              className={`relative flex h-[3.4rem] min-w-0 flex-col items-center overflow-hidden border-b border-r border-hairline pt-1 text-left transition-colors active:bg-surface-2 wide:h-auto wide:items-stretch wide:px-1 ${
                !inMonth ? "bg-ground/60" : today ? "bg-surface-2" : ""
              } ${isSelected ? "ring-2 ring-inset ring-ink" : ""}`}
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full font-display text-[1.15rem] leading-none wide:size-8 ${
                  today
                    ? "bg-ink text-on-ink"
                    : !inMonth
                      ? "text-ink-faint"
                      : past
                        ? "text-ink-soft"
                        : "text-ink"
                }`}
              >
                {date.getDate()}
              </span>

              {/* Phone: one dot per event (up to four), in its color. */}
              <span className={`mt-1 flex h-1.5 gap-0.5 wide:hidden ${!inMonth ? "opacity-40" : ""}`} aria-hidden>
                {dayEvents.slice(0, 4).map((ev) => (
                  <span
                    key={ev.id}
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: `var(${colorVar(bandsFor(ev.colors)[0])})` }}
                  />
                ))}
              </span>

              {/* Wide: the chips. Past and out-of-month days dim, not hide. */}
              <span
                className={`mt-0.5 hidden min-h-0 w-full flex-col gap-0.5 overflow-hidden wide:flex ${
                  !inMonth ? "opacity-45" : past ? "opacity-60" : ""
                }`}
              >
                {visible.map((ev) => (
                  <EventChip key={ev.id} event={ev} now={now} />
                ))}
                {overflow > 0 && (
                  <span className="px-1.5 text-stamp font-semibold text-ink-soft">+{overflow} more</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Week (wide only) ────────────────────────────────────────────────────────

function WeekGrid({
  anchor,
  events,
  now,
  onDay,
}: {
  anchor: Date;
  events: CalendarEvent[];
  now: Date;
  onDay: (date: Date) => void;
}) {
  const timeZone = useTimeZone();
  return (
    <div className="grid h-full grid-cols-7 gap-2">
      {weekDays(anchor).map((date) => {
        const dayEvents = eventsForDay(events, date, timeZone);
        const today = isToday(date, now);
        const past = isPastDay(date, now);
        return (
          <button
            key={date.getTime()}
            type="button"
            onClick={() => onDay(date)}
            aria-label={`${dayPanelTitle(date)}, ${dayEvents.length} ${dayEvents.length === 1 ? "event" : "events"}`}
            className={`flex min-h-0 min-w-0 flex-col rounded-2xl p-2.5 text-left transition-colors active:bg-surface-2 ${
              today ? "bg-surface-2 ring-1 ring-inset ring-hairline-strong" : ""
            }`}
          >
            <span className="mb-2 flex shrink-0 items-center gap-2 border-b border-hairline pb-2">
              <span className="text-label font-semibold uppercase tracking-wide text-ink-soft">
                {WEEKDAY_LABELS[date.getDay()]}
              </span>
              <span
                className={`flex size-9 items-center justify-center rounded-full font-display text-title leading-none ${
                  today ? "bg-ink text-on-ink" : past ? "text-ink-faint" : "text-ink"
                }`}
              >
                {date.getDate()}
              </span>
            </span>
            <span className={`flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden ${past ? "opacity-60" : ""}`}>
              {dayEvents.map((ev) => (
                <EventChip key={ev.id} event={ev} now={now} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── One day's list (phone) ──────────────────────────────────────────────────

function DayAgenda({
  date,
  events,
  members,
  now,
  onOpen,
  stamp,
}: {
  date: Date;
  events: CalendarEvent[];
  members: Member[];
  now: Date;
  onOpen: (event: CalendarEvent) => void;
  stamp: React.ReactNode;
}) {
  return (
    <Card title={isToday(date, now) ? `Today · ${dayPanelTitle(date)}` : dayPanelTitle(date)} stamp={stamp}>
      {events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nothing scheduled" compact />
      ) : (
        <ul className="-mx-2 flex flex-col">
          {events.map((ev) => (
            <li key={ev.id}>
              <EventRow event={ev} members={members} now={now} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
