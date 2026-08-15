"use client";

import type { CalendarEvent } from "@/lib/calendar/types";
import { colorVar, textOn, EVERYONE_COLOR } from "@/lib/calendar/palette";
import { eventTimeLabel, eventClockLabel } from "@/lib/calendar/dates";
import { countdownDays } from "@/lib/calendar/event";

// A single event chip.
//
// Color comes from the event's resolved band colors (spec D3, amended in
// Phase 1.5). One color fills solid; two or three render as HARD-STOP vertical
// bands, never a blend — a blend at six feet reads as a smudge (Phase 1.5 #4).
// Four or more tagged members collapse to a single defined "everyone" treatment
// rather than four slivers (Phase 1.5 #5). The whole grid can still be parsed by
// color before a word is read (spec §7).
//
// Bands are painted as a layer of equal-width flex strips behind the text, each
// filled with `background-color: var(--color-…)`. (Deliberately NOT a
// linear-gradient: a custom property inside a gradient value is rejected by the
// CSS parser in the target engine, so the fill would silently vanish. Adjacent
// solid strips give the same crisp edges and always render.)
//
// Countdown events carry a small day-count badge (Phase 1.5 #21).
//
// Two variants:
//   grid — compact, one line, truncated; packed into a month day cell.
//   list — roomier, for the day panel and week columns, with a clock label.

const BAND_CAP = 3;

/** Bands actually painted: 4+ colors collapse to the single "everyone" fill. */
function bandsFor(colors: string[]): string[] {
  if (colors.length === 0) return [EVERYONE_COLOR]; // defensive; never empty
  if (colors.length > BAND_CAP) return [EVERYONE_COLOR];
  return colors;
}

/** The color strips behind the chip content. Hard edges, no blend. */
function BandLayer({ bands }: { bands: string[] }) {
  return (
    <div className="absolute inset-0 flex" aria-hidden>
      {bands.map((c, i) => (
        <div
          key={`${c}-${i}`}
          className="h-full flex-1"
          style={{ backgroundColor: `var(${colorVar(c)})` }}
        />
      ))}
    </div>
  );
}

/** Short badge for a countdown chip: "today", "1d", "12d". */
function countdownBadge(event: CalendarEvent, now: Date): string {
  const days = countdownDays(event, now);
  if (days <= 0) return "today";
  return `${days}d`;
}

export function EventChip({
  event,
  variant = "grid",
  now,
}: {
  event: CalendarEvent;
  variant?: "grid" | "list";
  /** Required to render a countdown badge; omit where "now" isn't available. */
  now?: Date;
}) {
  const bands = bandsFor(event.colors);
  const solid = bands.length === 1;

  // Text: dark ink only when every band wants it (all light fills); otherwise
  // white, with a hairline shadow on multi-band chips so it stays legible where
  // a light band (amber, neutral) sits under it.
  const allDark = bands.every((c) => textOn(c) === "dark");
  const textClass = allDark ? "text-ink" : "text-white";
  const textStyle =
    !solid && !allDark ? { textShadow: "0 1px 2px rgba(0,0,0,0.4)" } : undefined;

  const showBadge = event.countdown && now != null;

  if (variant === "list") {
    return (
      <div className={`relative overflow-hidden rounded-lg ${textClass}`}>
        <BandLayer bands={bands} />
        <div
          className="relative flex items-baseline gap-3 px-4 py-3"
          style={textStyle}
        >
          <span className="shrink-0 text-label font-medium tabular-nums opacity-90">
            {eventClockLabel(event)}
          </span>
          <span className="text-body leading-tight">{event.title}</span>
          {showBadge && (
            <span className="ml-auto shrink-0 rounded-full bg-black/20 px-2.5 py-0.5 text-label font-semibold tabular-nums">
              {countdownBadge(event, now)}
            </span>
          )}
        </div>
      </div>
    );
  }

  const time = eventTimeLabel(event);
  return (
    <div
      className={`relative overflow-hidden rounded-md ${textClass}`}
      title={event.title}
    >
      <BandLayer bands={bands} />
      <div
        className="relative flex items-baseline gap-1.5 truncate px-2 py-0.5 text-label leading-tight"
        style={textStyle}
      >
        {time && (
          <span className="shrink-0 font-semibold tabular-nums opacity-90">{time}</span>
        )}
        <span className="truncate">{event.title}</span>
        {showBadge && (
          <span className="ml-auto shrink-0 rounded-full bg-black/20 px-1.5 font-semibold tabular-nums">
            {countdownBadge(event, now)}
          </span>
        )}
      </div>
    </div>
  );
}
