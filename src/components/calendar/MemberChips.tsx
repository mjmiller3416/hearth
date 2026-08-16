"use client";

import { Users } from "lucide-react";
import type { Member } from "@/lib/calendar/types";
import { colorVar, EVERYONE_COLOR } from "@/lib/calendar/palette";
import { FAMILY_FILTER_KEY } from "@/lib/calendar/event";
import { useTextOn } from "@/components/common/ColorProvider";

// The member filter chips / "tags" (Phase 1 #10, reworked Phase 2). One chip per
// family member, plus a leading "Family" chip for the shared/everyone events.
// Tapping a chip filters the grid to that person (or the family); tapping the
// active chip clears the filter.
//
// Each chip is a soft pill: a LIGHT TINT of the member's color fills it, with a
// solid color initial-avatar on the left and the name in dark ink — the look the
// household asked for (references photo-03). The active (selected) chip deepens
// its tint and gains a ring in the full color so the current filter reads at a
// glance. The tint is a translucent color overlay, not `color-mix`, so it renders
// on the older WebView the wall runs.

function initialOf(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

function Chip({
  active,
  color,
  onClick,
  ariaLabel,
  children,
  avatar,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  /** The leading mark: a solid color initial-circle, or a custom node (Family). */
  avatar: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className="relative flex shrink-0 items-center gap-2.5 overflow-hidden rounded-full py-1.5 pl-1.5 pr-5 text-label font-medium text-ink transition-colors"
      style={
        active
          ? { boxShadow: `inset 0 0 0 2px var(${colorVar(color)})` }
          : undefined
      }
    >
      {/* Light tint wash — a lighter shade of the color. Deeper when active. */}
      <span
        className="absolute inset-0"
        style={{ backgroundColor: `var(${colorVar(color)})`, opacity: active ? 0.3 : 0.16 }}
        aria-hidden
      />
      <span className="relative flex items-center gap-2.5">
        {avatar}
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
  const textOn = useTextOn();
  if (members.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      <Chip
        active={activeMemberKey === FAMILY_FILTER_KEY}
        color={EVERYONE_COLOR}
        ariaLabel="Family"
        onClick={() => onToggle(FAMILY_FILTER_KEY)}
        avatar={
          <span
            className="flex size-8 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: `var(${colorVar(EVERYONE_COLOR)})` }}
            aria-hidden
          >
            <Users className="size-4" strokeWidth={2.5} />
          </span>
        }
      >
        Family
      </Chip>

      {members.map((m) => {
        const dark = textOn(m.color) === "dark";
        return (
          <Chip
            key={m.key}
            active={m.key === activeMemberKey}
            color={m.color}
            ariaLabel={m.name}
            onClick={() => onToggle(m.key)}
            avatar={
              <span
                className={`flex size-8 items-center justify-center rounded-full font-display text-[1.1rem] leading-none ${
                  dark ? "text-ink" : "text-white"
                }`}
                style={{ backgroundColor: `var(${colorVar(m.color)})` }}
                aria-hidden
              >
                {initialOf(m.name)}
              </span>
            }
          >
            {m.name}
          </Chip>
        );
      })}
    </div>
  );
}
