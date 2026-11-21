"use client";

import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar/types";
import { colorVar } from "@/lib/calendar/palette";
import { countdownParts, countdownRemainingMs } from "@/lib/calendar/event";
import { useCountdownEvent } from "@/components/common/Countdown";
import { useTextOn } from "@/components/common/ColorProvider";
import { useTimeZone } from "@/components/common/TimeZone";
import { tint } from "@/components/ui/Avatar";

// The live countdown: the household's soonest countdown event (D10), counting
// down by days, hours, minutes and seconds to its start. A pill tinted and
// ringed in the event's color, in the header on a wide screen and at the top of
// Today on a phone.
//
// It ticks every second by request (the household asked for a real timer). It
// only exists while a countdown event does, so a screen with no countdown set
// has no second hand anywhere.

export function HeaderCountdown({ className = "" }: { className?: string }) {
  const event = useCountdownEvent();
  if (!event) return null;
  // Keyed by id so a change of event restarts the ticker from a fresh "now".
  return <Ticker key={event.id} event={event} className={className} />;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function Segment({ value, unit }: { value: string | number; unit: string }) {
  return (
    <span className="flex items-baseline">
      <span>{value}</span>
      <span className="ml-0.5 font-body text-stamp font-semibold text-ink-soft">{unit}</span>
    </span>
  );
}

function Ticker({ event, className }: { event: CalendarEvent; className: string }) {
  const timeZone = useTimeZone();
  const textOn = useTextOn();
  // Client-only by construction (mounted only after the calendar read lands),
  // so an initial Date.now() has no server render to disagree with.
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Tick on the top of each second so the digits flip cleanly.
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

  return (
    <div
      className={`flex min-w-0 max-w-full items-center gap-3 rounded-full py-1 pl-1 pr-5 ${className}`}
      style={{ backgroundColor: tint(color, 16), boxShadow: `inset 0 0 0 2px ${fill}` }}
      role="timer"
      aria-label={`Countdown to ${event.title}`}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: fill, color: textOn(color) === "dark" ? "#27221c" : "#ffffff" }}
        aria-hidden
      >
        <Hourglass className="size-5" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 truncate text-label font-semibold text-ink">{event.title}</span>
      <span className="flex shrink-0 items-baseline gap-2 font-display text-title leading-none tabular-nums text-ink">
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
