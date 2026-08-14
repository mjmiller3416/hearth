"use client";

import type { CalendarMember } from "@/lib/calendar/types";
import { colorVar, textOn } from "@/lib/calendar/palette";

// The member chip row across the top (Phase 1 #10): one chip per family member,
// in their color, tapped to filter the grid to that member. Tapping the active
// chip clears the filter. Same interaction the household already knows from the
// Skylight (spec §4.1), so no learning cost.
//
// Active chip = solid fill (this member is the filter). Inactive = quiet outline
// with a color dot. When nothing is selected all chips are outlines, which reads
// as "no filter."

export function MemberChips({
  members,
  activeCalendarId,
  onToggle,
}: {
  members: CalendarMember[];
  activeCalendarId: string | null;
  onToggle: (calendarId: string) => void;
}) {
  if (members.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {members.map((m) => {
        const active = m.calendarId === activeCalendarId;
        const textClass =
          textOn(m.color) === "dark" ? "text-ink" : "text-white";
        return (
          <button
            key={m.calendarId}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(m.calendarId)}
            className={`flex items-center gap-2.5 rounded-full px-5 py-2 text-label font-medium transition-colors ${
              active ? textClass : "text-ink"
            }`}
            style={
              active
                ? { backgroundColor: `var(${colorVar(m.color)})` }
                : { boxShadow: "inset 0 0 0 1.5px var(--color-hairline-strong)" }
            }
          >
            {!active && (
              <span
                className="size-3.5 rounded-full"
                style={{ backgroundColor: `var(${colorVar(m.color)})` }}
                aria-hidden
              />
            )}
            {m.name}
          </button>
        );
      })}
    </div>
  );
}
