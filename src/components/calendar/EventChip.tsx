"use client";

import type { CSSProperties } from "react";
import type { CalendarEvent, Member } from "@/lib/calendar/types";
import { colorVar, EVERYONE_COLOR } from "@/lib/calendar/palette";
import { eventClockRange, eventTimeLabel } from "@/lib/calendar/dates";
import { countdownDays } from "@/lib/calendar/event";
import { useTimeZone } from "@/components/common/TimeZone";
import { useTextOn } from "@/components/common/ColorProvider";
import { Avatar, FamilyAvatar, ON_LIGHT } from "@/components/ui/Avatar";
import { Hourglass, Repeat } from "lucide-react";

// How an event is drawn, in its two forms:
//
//   EventChip  the compact one-line chip packed into a month cell or week column
//   EventRow   the roomier row in a day's list (Home, the day sheet, a phone's
//              agenda): a color bar, the time over the title, and who it's for
//
// Color comes from the event's resolved band colors (spec D3). One color fills
// solid; two or three render as HARD-EDGED bands, never a blend (a blend at six
// feet reads as a smudge). Four or more collapse to the single "everyone"
// treatment. The whole calendar can be parsed by color before a word is read.
//
// Text on a fill is a fixed dark or white, never a theme token: a member color
// is the same in the light and evening themes, so its text must be too.

const BAND_CAP = 3;

/** Bands actually painted: 4+ colors collapse to the single "everyone" fill. */
export function bandsFor(colors: string[]): string[] {
  if (colors.length === 0 || colors.length > BAND_CAP) return [EVERYONE_COLOR];
  return colors;
}

// How far each internal seam leans (px) from top to bottom.
const SEAM_SKEW_PX = 7;

/**
 * The color bands behind a chip: diagonal hard edges, no blend. Painted as
 * stacked solid layers cut with `clip-path` rather than a gradient, because a
 * custom property inside a gradient was rejected by the wall's engine and the
 * fill silently vanished. Solid backgrounds always render.
 */
function BandLayer({ bands }: { bands: string[] }) {
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
        const seam = (i / n) * 100;
        const style: CSSProperties = { backgroundColor: `var(${colorVar(c)})` };
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
  return days <= 0 ? "today" : `${days}d`;
}

export function EventChip({ event, now }: { event: CalendarEvent; now?: Date }) {
  const timeZone = useTimeZone();
  const textOn = useTextOn();
  const bands = bandsFor(event.colors);
  // Dark ink only when every band wants it; otherwise white, with a hairline
  // shadow on multi-band chips so it stays legible over a light band.
  const allDark = bands.every((c) => textOn(c) === "dark");
  const style: CSSProperties = {
    color: allDark ? ON_LIGHT : "#ffffff",
    textShadow: bands.length > 1 && !allDark ? "0 1px 2px rgba(0,0,0,0.4)" : undefined,
  };
  const time = eventTimeLabel(event, timeZone);

  return (
    // w-full + min-w-0 pin the chip to the cell width explicitly: relying on the
    // parent's align-items: stretch let the chip shrink to its content in the
    // wall's WebView, so the title's truncate had nothing to clip.
    <div
      className="relative isolate w-full min-w-0 overflow-hidden rounded-lg [transform:translateZ(0)]"
      title={event.title}
    >
      <BandLayer bands={bands} />
      <div
        className="relative flex min-w-0 items-baseline gap-1.5 px-2 py-0.5 text-tiny font-medium leading-tight wide:text-small"
        style={style}
      >
        {time && <span className="shrink-0 font-semibold tabular-nums opacity-90">{time}</span>}
        <span className="min-w-0 flex-1 truncate">{event.title}</span>
        {event.countdown && now && (
          <span className="ml-auto shrink-0 rounded-full bg-black/20 px-1.5 font-semibold tabular-nums">
            {countdownBadge(event, now)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Who an event is for: the tagged members, the owning member of an untagged
 * personal event, or the whole family.
 */
export function eventPeople(
  event: CalendarEvent,
  members: Member[],
): { family: boolean; people: Member[] } {
  const everyone =
    event.colors.includes(EVERYONE_COLOR) ||
    event.colors.length > BAND_CAP ||
    (members.length > 0 && event.memberKeys.length === members.length);
  if (everyone) return { family: true, people: [] };
  const keys =
    event.memberKeys.length > 0
      ? event.memberKeys
      : event.defaultMemberKey
        ? [event.defaultMemberKey]
        : [];
  const people = keys
    .map((k) => members.find((m) => m.key === k))
    .filter((m): m is Member => Boolean(m));
  return { family: false, people };
}

/** The vertical color bar at the head of a row (one stripe per band). */
function ColorBar({ colors }: { colors: string[] }) {
  const bands = bandsFor(colors);
  return (
    <span
      className="flex w-2 shrink-0 flex-col self-stretch overflow-hidden rounded-full shadow-[0_0_0_1.5px_rgba(255,255,255,0.55)]"
      aria-hidden
    >
      {bands.map((c, i) => (
        <span key={`${c}-${i}`} className="flex-1" style={{ backgroundColor: `var(${colorVar(c)})` }} />
      ))}
    </span>
  );
}

export function EventRow({
  event,
  members,
  now,
  onOpen,
  dim = false,
}: {
  event: CalendarEvent;
  members: Member[];
  now?: Date;
  onOpen?: (event: CalendarEvent) => void;
  /** Already over today: fade it back. */
  dim?: boolean;
}) {
  const timeZone = useTimeZone();
  const { family, people } = eventPeople(event, members);

  const body = (
    <>
      <ColorBar colors={event.colors} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-x-3 overflow-hidden whitespace-nowrap text-tiny font-semibold uppercase tracking-[0.06em] text-fg-soft">
          {eventClockRange(event, timeZone)}
          {event.countdown && now && (
            <span className="flex items-center gap-1 normal-case tracking-normal">
              <Hourglass className="size-3.5" strokeWidth={2.25} aria-hidden />
              {countdownBadge(event, now) === "today" ? "Today" : `in ${countdownBadge(event, now)}`}
            </span>
          )}
          {event.recurring && (
            <span className="flex items-center gap-1 normal-case tracking-normal">
              <Repeat className="size-3.5" strokeWidth={2.25} aria-hidden />
              Repeats
            </span>
          )}
        </span>
        <span className="mt-0.5 line-clamp-2 font-display text-lead leading-tight text-fg">{event.title}</span>
      </span>
      <span className="flex shrink-0 items-center -space-x-1.5 self-center">
        {family ? (
          <FamilyAvatar size="sm" />
        ) : (
          people.map((m) => <Avatar key={m.key} name={m.name} color={m.color} size="sm" />)
        )}
      </span>
    </>
  );

  const cls = `flex w-full items-stretch gap-3.5 rounded-2xl px-2 py-2 text-left ${dim ? "opacity-50" : ""}`;
  return onOpen ? (
    <button
      type="button"
      onClick={() => onOpen(event)}
      aria-label={`Open ${event.title}`}
      className={`${cls} transition-colors active:bg-fill`}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
