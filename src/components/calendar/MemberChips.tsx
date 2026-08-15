"use client";

import type { Member } from "@/lib/calendar/types";
import { colorVar, textOn } from "@/lib/calendar/palette";

// The member chip row across the top (Phase 1 #10): one chip per family member,
// in their color, tapped to filter the grid to that member. Tapping the active
// chip clears the filter. Same interaction the household already knows from the
// Skylight (spec §4.1), so no learning cost.
//
// As of Phase 1.5 the row is driven by MEMBERS (people), not calendars — a
// member concerns an event when tagged on it, or (untagged) when they own its
// calendar (see event.memberConcerns).
//
// Active chip = solid fill (this member is the filter). Inactive = quiet outline
// with a color dot. When nothing is selected all chips are outlines, which reads
// as "no filter."

export function MemberChips({
  members,
  activeMemberKey,
  onToggle,
}: {
  members: Member[];
  activeMemberKey: string | null;
  onToggle: (memberKey: string) => void;
}) {
  if (members.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {members.map((m) => {
        const active = m.key === activeMemberKey;
        const textClass =
          textOn(m.color) === "dark" ? "text-ink" : "text-white";
        return (
          <button
            key={m.key}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(m.key)}
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
