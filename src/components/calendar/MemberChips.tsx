"use client";

import { Users } from "lucide-react";
import type { Member } from "@/lib/calendar/types";
import { colorVar, EVERYONE_COLOR } from "@/lib/calendar/palette";
import { FAMILY_FILTER_KEY } from "@/lib/calendar/event";

// The member filter chips (Phase 1 #10, reworked Phase 2 #1/#2). One chip per
// family member, plus a leading "Family" chip for the shared/everyone events.
// Tapping a chip filters the grid to that person (or the family); tapping the
// active chip clears the filter. The same interaction the household knows from
// the Skylight (spec §4.1).
//
// As of Phase 2 the chips live on the title row (two rows above the grid become
// one, #1), and the ACTIVE chip is a light TINT of its color — a translucent
// wash plus a ring in the full color — rather than a solid fill. That reads
// closer to the Skylight and keeps the label dark and legible on every color.
// (The tint is an opacity overlay, not `color-mix`, so it renders on the older
// WebView the wall runs.)

function Chip({
  active,
  color,
  onClick,
  ariaLabel,
  children,
  glyph,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  /** The leading mark: a solid color dot, or a custom node (the Family icon). */
  glyph?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className="relative flex shrink-0 items-center gap-2.5 overflow-hidden rounded-full px-5 py-2 text-label font-medium text-ink transition-colors"
      style={
        active
          ? { boxShadow: `inset 0 0 0 2px var(${colorVar(color)})` }
          : { boxShadow: "inset 0 0 0 1.5px var(--color-hairline-strong)" }
      }
    >
      {/* Light tint wash for the active chip — a lighter shade of the color. */}
      {active && (
        <span
          className="absolute inset-0"
          style={{ backgroundColor: `var(${colorVar(color)})`, opacity: 0.18 }}
          aria-hidden
        />
      )}
      <span className="relative flex items-center gap-2.5">
        {glyph ?? (
          <span
            className="size-3.5 rounded-full"
            style={{ backgroundColor: `var(${colorVar(color)})` }}
            aria-hidden
          />
        )}
        {children}
      </span>
    </button>
  );
}

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
    <div className="flex items-center gap-3">
      <Chip
        active={activeMemberKey === FAMILY_FILTER_KEY}
        color={EVERYONE_COLOR}
        ariaLabel="Family"
        onClick={() => onToggle(FAMILY_FILTER_KEY)}
        glyph={
          <span
            className="flex size-5 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: `var(${colorVar(EVERYONE_COLOR)})` }}
            aria-hidden
          >
            <Users className="size-3.5" strokeWidth={2.5} />
          </span>
        }
      >
        Family
      </Chip>

      {members.map((m) => (
        <Chip
          key={m.key}
          active={m.key === activeMemberKey}
          color={m.color}
          ariaLabel={m.name}
          onClick={() => onToggle(m.key)}
        >
          {m.name}
        </Chip>
      ))}
    </div>
  );
}
