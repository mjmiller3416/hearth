"use client";

import type { CSSProperties } from "react";
import type { CalendarEvent } from "@/lib/calendar/types";
import { colorVar, textOn } from "@/lib/calendar/palette";
import { eventTimeLabel, eventClockLabel } from "@/lib/calendar/dates";

// A single event, filled in its owning member's color (spec D3, Phase 1 #7).
// The fill is the point: the whole grid can be parsed by color before a word is
// read (spec §7, the member-color "signature"). Amber takes dark ink; the other
// three take white — see palette.textOn.
//
// Two variants:
//   grid — compact, one line, truncated; packed into a month day cell.
//   list — roomier, for the day panel and week columns, with a clock label.

function fillStyle(color: string): CSSProperties {
  return { backgroundColor: `var(${colorVar(color)})` };
}

export function EventChip({
  event,
  variant = "grid",
}: {
  event: CalendarEvent;
  variant?: "grid" | "list";
}) {
  const textClass = textOn(event.color) === "dark" ? "text-ink" : "text-white";

  if (variant === "list") {
    return (
      <div
        className={`flex items-baseline gap-3 rounded-lg px-4 py-3 ${textClass}`}
        style={fillStyle(event.color)}
      >
        <span className="shrink-0 text-label font-medium tabular-nums opacity-90">
          {eventClockLabel(event)}
        </span>
        <span className="text-body leading-tight">{event.title}</span>
      </div>
    );
  }

  const time = eventTimeLabel(event);
  return (
    <div
      className={`flex items-baseline gap-1.5 truncate rounded-md px-2 py-0.5 text-label leading-tight ${textClass}`}
      style={fillStyle(event.color)}
      title={event.title}
    >
      {time && (
        <span className="shrink-0 font-semibold tabular-nums opacity-90">{time}</span>
      )}
      <span className="truncate">{event.title}</span>
    </div>
  );
}
