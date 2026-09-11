"use client";

import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar/types";
import { colorVar } from "@/lib/calendar/palette";
import { countdownParts, countdownRemainingMs } from "@/lib/calendar/event";
import { useCountdownEvent } from "@/components/common/Countdown";
import { useTextOn } from "@/components/common/ColorProvider";
import { useTimeZone } from "@/components/common/TimeZone";

// The live countdown in the main header: the calendar's soonest countdown event
// (D10), counting down by days · hours · minutes · seconds to its start — the
// moment an all-day event's day begins, or a timed event's start time. It sits
// between the date and the clock, where the header has room to spare on the
// 1920 canvas, and reads as "the next big thing" from across the room: a pill
// tinted and ringed in the event's member color, a solid hourglass badge, and
// the digits in the display face.
//
// It ticks every second by request — the household asked for a real timer —
// which is a deliberate exception to the header clock's minute-only rule
// (Phase 0 #6). It only exists while a countdown event does, so a wall with no
// countdown set has no second hand anywhere.
//
// Renders nothing until the calendar publishes an event (CountdownProvider), so
// the server render and the first client render agree.

export function HeaderCountdown() {
  const event = useCountdownEvent();
  if (!event) return null;
  // Keyed by id so a change of event restarts the ticker from a fresh "now"
  // (a poll refreshing the same event keeps the running instance).
  return <Ticker key={event.id} event={event} />;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function Segment({ value, unit }: { value: string | number; unit: string }) {
  return (
    <span className="flex items-baseline">
      <span>{value}</span>
      <span className="ml-0.5 font-body text-label font-medium text-ink-soft">
        {unit}
      </span>
    </span>
  );
}

function Ticker({ event }: { event: CalendarEvent }) {
  const timeZone = useTimeZone();
  const textOn = useTextOn();
  // Client-only by construction (mounted only after the calendar publishes), so
  // an initial Date.now() has no server render to disagree with.
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Tick on the top of each second so the digits flip cleanly, not on a
  // drifting offset (the same alignment the header clock uses for minutes).
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      setNowMs(Date.now());
      interval = setInterval(() => setNowMs(Date.now()), 1000);
    }, 1000 - (Date.now() % 1000));
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  const parts = countdownParts(countdownRemainingMs(event, nowMs, timeZone));
  const arrived =
    parts.days === 0 && parts.hours === 0 && parts.minutes === 0 && parts.seconds === 0;
  const color = event.colors[0] ?? "neutral";
  const fill = `var(${colorVar(color)})`;
  const onColor = textOn(color) === "dark" ? "text-ink" : "text-white";

  return (
    <div
      className="relative flex min-w-0 items-center gap-4 self-center overflow-hidden rounded-full py-1.5 pl-1.5 pr-7"
      style={{ boxShadow: `inset 0 0 0 2px ${fill}` }}
    >
      {/* Light tint wash in the event's color — the member-chip treatment. */}
      <span
        className="absolute inset-0"
        style={{ backgroundColor: fill, opacity: 0.16 }}
        aria-hidden
      />
      <span
        className={`relative flex size-11 shrink-0 items-center justify-center rounded-full ${onColor}`}
        style={{ backgroundColor: fill }}
        aria-hidden
      >
        <Hourglass className="size-6" strokeWidth={2.25} />
      </span>
      <span className="relative max-w-[22rem] truncate text-body font-semibold text-ink">
        {event.title}
      </span>
      <span className="relative flex shrink-0 items-baseline gap-2.5 font-display text-title leading-none tabular-nums text-ink">
        {arrived ? (
          "Today"
        ) : (
          <>
            {parts.days > 0 && <Segment value={parts.days} unit="d" />}
            <Segment value={pad(parts.hours)} unit="h" />
            <Segment value={pad(parts.minutes)} unit="m" />
            <Segment value={pad(parts.seconds)} unit="s" />
          </>
        )}
      </span>
    </div>
  );
}
