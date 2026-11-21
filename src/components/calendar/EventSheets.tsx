"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, Clock, Hourglass, Pencil, Plus, Repeat, Users } from "lucide-react";
import type { CalendarEvent, Member } from "@/lib/calendar/types";
import type { CalendarEvents } from "@/hooks/useCalendarEvents";
import { colorVar } from "@/lib/calendar/palette";
import {
  dayPanelTitle,
  eventClockRange,
  eventDateLabel,
  eventsForDay,
} from "@/lib/calendar/dates";
import { countdownDays, countdownLabel } from "@/lib/calendar/event";
import { useTimeZone } from "@/components/common/TimeZone";
import { Avatar, FamilyAvatar } from "@/components/ui/Avatar";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { Sheet, SheetBody, SheetFooter, SheetHeader } from "@/components/ui/Sheet";
import { bandsFor, eventPeople, EventRow } from "./EventChip";
import { EventForm } from "./EventForm";

// Everything that opens over the calendar, in one place, so Today and the
// Calendar page behave identically:
//
//   a day     every event that day, each tappable; Add for that day
//   an event  what, when and who, with Edit (and Back when it came from a day)
//   the form  add or edit (EventForm)
//
// A day with a single event skips the list and opens that event directly: one
// tap to the thing you wanted.

type View =
  | { kind: "day"; date: Date }
  | { kind: "event"; event: CalendarEvent; fromDay: Date | null }
  | { kind: "add"; date: Date }
  | { kind: "edit"; event: CalendarEvent };

export interface EventSheets {
  openDay: (date: Date) => void;
  openEvent: (event: CalendarEvent) => void;
  openAdd: (date: Date) => void;
  close: () => void;
  /** Render this once, anywhere in the view. */
  element: ReactNode;
}

export function useEventSheets({
  calendar,
  events,
  now,
}: {
  calendar: CalendarEvents;
  /** The events the view is showing (already filtered by the lens). */
  events: CalendarEvent[];
  now: Date | null;
}): EventSheets {
  const timeZone = useTimeZone();
  const [view, setView] = useState<View | null>(null);
  const close = useCallback(() => setView(null), []);

  const openDay = useCallback(
    (date: Date) => {
      const dayEvents = eventsForDay(events, date, timeZone);
      setView(
        dayEvents.length === 1
          ? { kind: "event", event: dayEvents[0], fromDay: null }
          : { kind: "day", date },
      );
    },
    [events, timeZone],
  );
  const openEvent = useCallback(
    (event: CalendarEvent) => setView({ kind: "event", event, fromDay: null }),
    [],
  );
  const openAdd = useCallback((date: Date) => setView({ kind: "add", date }), []);

  const element = useMemo(() => {
    if (!view || !now) return null;
    const { members } = calendar;
    switch (view.kind) {
      case "day":
        return (
          <DaySheet
            date={view.date}
            events={eventsForDay(events, view.date, timeZone)}
            members={members}
            now={now}
            canAdd={calendar.canAdd}
            onClose={close}
            onAdd={() => setView({ kind: "add", date: view.date })}
            onOpen={(event) => setView({ kind: "event", event, fromDay: view.date })}
          />
        );
      case "event":
        return (
          <EventSheet
            event={view.event}
            members={members}
            now={now}
            onClose={close}
            onBack={view.fromDay ? () => setView({ kind: "day", date: view.fromDay as Date }) : null}
            onEdit={() => setView({ kind: "edit", event: view.event })}
          />
        );
      case "add":
        return (
          <EventForm
            initialDate={view.date}
            now={now}
            members={members}
            onClose={close}
            onCreated={calendar.created}
          />
        );
      case "edit":
        return (
          <EventForm
            initialDate={now}
            now={now}
            members={members}
            initialEvent={view.event}
            onClose={close}
            onCreated={calendar.created}
            onEdited={calendar.edited}
            onDeleted={calendar.remove}
          />
        );
    }
  }, [view, now, calendar, events, timeZone, close]);

  return { openDay, openEvent, openAdd, close, element };
}

function DaySheet({
  date,
  events,
  members,
  now,
  canAdd,
  onClose,
  onAdd,
  onOpen,
}: {
  date: Date;
  events: CalendarEvent[];
  members: Member[];
  now: Date;
  canAdd: boolean;
  onClose: () => void;
  onAdd: () => void;
  onOpen: (event: CalendarEvent) => void;
}) {
  return (
    <Sheet label={dayPanelTitle(date)} onClose={onClose}>
      <SheetHeader
        title={dayPanelTitle(date)}
        subtitle={
          events.length === 0
            ? "Nothing scheduled"
            : `${events.length} ${events.length === 1 ? "event" : "events"}`
        }
        onClose={onClose}
      />
      <SheetBody>
        {events.length === 0 ? (
          <EmptyState icon={CalendarDays} title="A free day" compact />
        ) : (
          <ul className="-mx-2 flex flex-col">
            {events.map((ev) => (
              <li key={ev.id}>
                <EventRow event={ev} members={members} now={now} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )}
      </SheetBody>
      {canAdd && (
        <SheetFooter>
          <Button variant="primary" className="flex-1" onClick={onAdd}>
            <Plus className="size-5" strokeWidth={2.75} aria-hidden />
            Add an event this day
          </Button>
        </SheetFooter>
      )}
    </Sheet>
  );
}

function InfoRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-soft ring-1 ring-inset ring-hairline">
        {icon}
      </span>
      <div className="min-w-0 text-body text-ink">{children}</div>
    </div>
  );
}

function EventSheet({
  event,
  members,
  now,
  onClose,
  onBack,
  onEdit,
}: {
  event: CalendarEvent;
  members: Member[];
  now: Date;
  onClose: () => void;
  onBack: (() => void) | null;
  onEdit: () => void;
}) {
  const timeZone = useTimeZone();
  const { family, people } = eventPeople(event, members);
  const bands = bandsFor(event.colors);

  return (
    <Sheet label={event.title} onClose={onClose}>
      <SheetHeader
        title={event.title}
        onClose={onClose}
        leading={
          onBack ? (
            <IconButton label="Back to the day" onClick={onBack} className="-ml-2 -mt-1">
              <ChevronLeft className="size-6" strokeWidth={2.25} aria-hidden />
            </IconButton>
          ) : (
            <span className="mt-1.5 flex h-7 w-2 shrink-0 flex-col overflow-hidden rounded-full" aria-hidden>
              {bands.map((c, i) => (
                <span key={`${c}-${i}`} className="flex-1" style={{ backgroundColor: `var(${colorVar(c)})` }} />
              ))}
            </span>
          )
        }
      />
      <SheetBody className="flex flex-col gap-3.5">
        <InfoRow icon={<CalendarDays className="size-5" strokeWidth={2} aria-hidden />}>
          {eventDateLabel(event, timeZone)}
        </InfoRow>
        <InfoRow icon={<Clock className="size-5" strokeWidth={2} aria-hidden />}>
          {eventClockRange(event, timeZone)}
        </InfoRow>
        <InfoRow icon={<Users className="size-5" strokeWidth={2} aria-hidden />}>
          {family ? (
            <span className="flex items-center gap-2">
              <FamilyAvatar size="sm" />
              Everyone
            </span>
          ) : people.length > 0 ? (
            <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {people.map((m) => (
                <span key={m.key} className="flex items-center gap-2">
                  <Avatar name={m.name} color={m.color} size="sm" />
                  {m.name}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-ink-soft">No one assigned</span>
          )}
        </InfoRow>
        {event.countdown && (
          <InfoRow icon={<Hourglass className="size-5" strokeWidth={2} aria-hidden />}>
            Countdown · {countdownLabel(countdownDays(event, now))}
          </InfoRow>
        )}
        {event.recurring && (
          <InfoRow icon={<Repeat className="size-5" strokeWidth={2} aria-hidden />}>
            Repeats · change the series in Google Calendar
          </InfoRow>
        )}
      </SheetBody>
      <SheetFooter>
        <Button variant="primary" className="flex-1" onClick={onEdit}>
          <Pencil className="size-4" strokeWidth={2.5} aria-hidden />
          {event.recurring ? "Delete…" : "Edit or delete"}
        </Button>
      </SheetFooter>
    </Sheet>
  );
}
