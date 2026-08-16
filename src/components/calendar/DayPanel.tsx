"use client";

import { useEffect } from "react";
import { Plus, X } from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar/types";
import { eventsForDay, dayPanelTitle } from "@/lib/calendar/dates";
import { EventChip } from "./EventChip";

// The day panel (Phase 1 #8): opens when a day cell (or its "+N more") is tapped
// and shows every event for that day in full, no truncation. A long day scrolls
// within the panel, not the page (kiosk — nothing scrolls at the app level).
// Dismissed by tapping outside or the close control.
//
// Every event row is tappable to edit it (change the title/time, or tag people
// in). Deleting lives inside that edit panel, so a stray tap here never removes
// anything.

export function DayPanel({
  date,
  events,
  now,
  onClose,
  onAddDay,
  onEdit,
}: {
  date: Date;
  events: CalendarEvent[];
  now: Date;
  onClose: () => void;
  onAddDay: (date: Date) => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const dayEvents = eventsForDay(events, date);

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
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="font-display text-display leading-tight text-ink">
            {dayPanelTitle(date)}
          </h2>
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
              <button
                key={ev.id}
                type="button"
                onClick={() => onEdit(ev)}
                aria-label={`Edit ${ev.title}`}
                className="block w-full rounded-lg text-left transition-transform active:scale-[0.99]"
              >
                <EventChip event={ev} variant="list" now={now} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
