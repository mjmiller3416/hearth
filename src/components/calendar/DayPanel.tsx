"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import type { CalendarEvent, Member } from "@/lib/calendar/types";
import { eventsForDay, dayPanelTitle } from "@/lib/calendar/dates";
import { useTimeZone } from "@/components/common/TimeZone";
import { EventChip } from "./EventChip";
import { EventDetail } from "./EventDetail";

// The day panel (Phase 1 #8, reworked Phase 2 #11): opens when a day cell is
// tapped. It has two screens:
//
//   list   — every event for that day, no truncation, each row tappable to read
//            its details and each carrying an explicit edit (pencil) affordance.
//   detail — the expanded EventDetail for one event, with Edit + Back.
//
// A day holding a single event skips the list and opens straight to that event's
// detail (Phase 2 #11) — one tap to the thing you wanted. Dismissed by tapping
// outside, the close control, or Escape. A long day scrolls within the panel,
// not the page (kiosk — nothing scrolls at the app level).

export function DayPanel({
  date,
  events,
  members,
  now,
  onClose,
  onAddDay,
  onEdit,
}: {
  date: Date;
  events: CalendarEvent[];
  members: Member[];
  now: Date;
  onClose: () => void;
  onAddDay: (date: Date) => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const timeZone = useTimeZone();
  const dayEvents = useMemo(
    () => eventsForDay(events, date, timeZone),
    [events, date, timeZone],
  );
  const singleEvent = dayEvents.length === 1;

  // Auto-expand a single-event day straight to its detail.
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const initial = eventsForDay(events, date, timeZone);
    return initial.length === 1 ? initial[0].id : null;
  });
  const selected = selectedId
    ? dayEvents.find((e) => e.id === selectedId) ?? null
    : null;

  // Escape closes too — harmless on a touch wall, helpful during development.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/25 p-10"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-full w-[42rem] max-w-full flex-col rounded-3xl bg-surface p-8 shadow-[0_20px_60px_-20px_rgba(43,38,32,0.45)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={dayPanelTitle(date)}
      >
        {selected ? (
          <EventDetail
            event={selected}
            members={members}
            now={now}
            onBack={() => setSelectedId(null)}
            onEdit={onEdit}
            showBack={!singleEvent}
          />
        ) : (
          <>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-display text-display leading-tight text-ink">
                  {dayPanelTitle(date)}
                </h2>
                <p className="mt-1 text-label text-ink-soft">
                  {dayEvents.length === 0
                    ? "Nothing scheduled"
                    : `${dayEvents.length} ${dayEvents.length === 1 ? "event" : "events"}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onAddDay(date)}
                  aria-label="Add event on this day"
                  className="flex h-12 items-center gap-2 rounded-full bg-ink px-5 text-label font-medium text-surface transition-colors hover:bg-ink/90"
                >
                  <Plus className="size-6" strokeWidth={2.5} aria-hidden />
                  Add
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex size-12 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ground-2"
                >
                  <X className="size-8" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
              {dayEvents.length === 0 ? (
                <p className="py-8 text-center text-body text-ink-faint">
                  Nothing scheduled.
                </p>
              ) : (
                dayEvents.map((ev) => (
                  <div key={ev.id} className="flex items-stretch gap-2">
                    {/* Tap the row to read the event; the pencil edits it. Two
                        distinct targets so neither steals the other's tap. */}
                    <button
                      type="button"
                      onClick={() => setSelectedId(ev.id)}
                      aria-label={`Open ${ev.title}`}
                      className="min-w-0 flex-1 rounded-lg text-left transition-transform active:scale-[0.99]"
                    >
                      <EventChip event={ev} variant="list" now={now} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(ev)}
                      aria-label={`Edit ${ev.title}`}
                      className="flex w-14 shrink-0 items-center justify-center rounded-lg bg-ground text-ink-soft transition-colors hover:bg-ground-2 hover:text-ink"
                    >
                      <Pencil className="size-6" strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
