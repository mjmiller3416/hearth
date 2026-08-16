"use client";

import type { CSSProperties } from "react";
import type { CalendarEvent } from "@/lib/calendar/types";
import { colorVar, EVERYONE_COLOR } from "@/lib/calendar/palette";
import { eventTimeLabel, eventClockLabel } from "@/lib/calendar/dates";
import { countdownDays } from "@/lib/calendar/event";
import { useTimeZone } from "@/components/common/TimeZone";
import { useTextOn } from "@/components/common/ColorProvider";

// A single event chip.
//
// Color comes from the event's resolved band colors (spec D3, amended in
// Phase 1.5). One color fills solid; two or three render as HARD-STOP vertical
// bands, never a blend — a blend at six feet reads as a smudge (Phase 1.5 #4).
// Four or more tagged members collapse to a single defined "everyone" treatment
// rather than four slivers (Phase 1.5 #5). The whole grid can still be parsed by
// color before a word is read (spec §7).
//
// Bands are painted as stacked full-size layers, each `background-color:
// var(--color-…)`, with the internal seams cut on a slight diagonal via
// `clip-path` (band 0 fills; each later band is clipped to a slanted slice and
// painted over). The diagonal reads more like a shared event than a vertical
// hard stop. (Deliberately NOT a linear-gradient: a custom property inside a
// gradient value is rejected by the CSS parser in the target engine, so the fill
// would silently vanish. `clip-path` + solid backgrounds always render.)
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

// How far each internal seam leans (px) from top to bottom — the diagonal split.
const SEAM_SKEW_PX = 7;

/** The color bands behind the chip content: diagonal hard edges, no blend. */
function BandLayer({ bands }: { bands: string[] }) {
  // One color → a plain solid fill (no seam to slant).
  if (bands.length <= 1) {
    return (
      <div
        className="absolute inset-0"
        style={{ backgroundColor: `var(${colorVar(bands[0] ?? EVERYONE_COLOR)})` }}
        aria-hidden
      />
    );
  }
  const n = bands.length;
  return (
    <div className="absolute inset-0" aria-hidden>
      {bands.map((c, i) => {
        const seam = (i / n) * 100; // this band's left seam, as a % of width
        const style: CSSProperties = { backgroundColor: `var(${colorVar(c)})` };
        // Band 0 fills the whole chip; each later band is clipped to a slanted
        // slice from its seam to the right edge and painted over the previous.
        if (i > 0) {
          style.clipPath = `polygon(calc(${seam}% + ${SEAM_SKEW_PX}px) 0, 100% 0, 100% 100%, calc(${seam}% - ${SEAM_SKEW_PX}px) 100%)`;
        }
        return <div key={`${c}-${i}`} className="absolute inset-0" style={style} />;
      })}
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
  const timeZone = useTimeZone();
  const textOn = useTextOn();
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
      <div
        className={`relative isolate overflow-hidden rounded-lg [transform:translateZ(0)] ${textClass}`}
      >
        <BandLayer bands={bands} />
        <div
          className="relative flex items-baseline gap-3 px-4 py-3"
          style={textStyle}
        >
          <span className="shrink-0 text-label font-medium tabular-nums opacity-90">
            {eventClockLabel(event, timeZone)}
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

  const time = eventTimeLabel(event, timeZone);
  return (
    <div
      className={`relative isolate overflow-hidden rounded-md [transform:translateZ(0)] ${textClass}`}
      title={event.title}
    >
      <BandLayer bands={bands} />
      <div
        className="relative flex min-w-0 items-baseline gap-1.5 px-2 py-px text-label leading-tight"
        style={textStyle}
      >
        {time && (
          <span className="shrink-0 font-semibold tabular-nums opacity-90">{time}</span>
        )}
        {/* min-w-0 + flex-1 is what actually lets the title shrink and show the
            ellipsis; without min-w-0 a flex child stays at content width and the
            older wall WebView hard-clips it (references photo-04 vs photo-05). */}
        <span className="min-w-0 flex-1 truncate">{event.title}</span>
        {showBadge && (
          <span className="ml-auto shrink-0 rounded-full bg-black/20 px-1.5 font-semibold tabular-nums">
            {countdownBadge(event, now)}
          </span>
        )}
      </div>
    </div>
  );
}
