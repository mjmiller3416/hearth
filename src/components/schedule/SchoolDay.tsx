"use client";

import { Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { colorVar } from "@/lib/calendar/palette";
import type { ScheduleActivity, ScheduleKid } from "@/lib/tandem/types";
import { toMinutes } from "@/lib/tandem/week";

// One school day as a list, per kid: the form a kid reads ("what's now, what's
// next"), used by the School page on a phone and by Home everywhere. Blocks
// already over fade back; the one happening now is marked.

/** "9:00" / "1:45 PM" style label from a 24h "HH:MM". */
function clock(time: string): string {
  const minutes = toMinutes(time);
  const h = Math.floor(minutes / 60);
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function BlockRow({
  activity,
  kid,
  nowMinutes,
}: {
  activity: ScheduleActivity;
  kid: ScheduleKid;
  nowMinutes: number | null;
}) {
  const start = toMinutes(activity.start);
  const end = toMinutes(activity.end);
  const isNow = nowMinutes !== null && nowMinutes >= start && nowMinutes < end;
  const over = nowMinutes !== null && nowMinutes >= end;
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl py-2 pl-2 pr-3 ${over ? "opacity-50" : ""} ${
        isNow ? "bg-fill-2" : "bg-fill"
      }`}
    >
      <span
        className="w-1.5 shrink-0 self-stretch rounded-full shadow-[0_0_0_1.5px_rgba(255,255,255,0.55)]"
        style={{ backgroundColor: `var(${colorVar(kid.color)})` }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block text-tiny font-semibold tabular-nums text-fg-soft">
          {clock(activity.start)} to {clock(activity.end)}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-body font-medium leading-snug text-fg">
          {activity.important && (
            <Star className="size-4 shrink-0 fill-current text-spark" aria-label="Important" />
          )}
          <span className="truncate">{activity.name}</span>
        </span>
      </span>
      {isNow && (
        <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-tiny font-bold uppercase leading-none tracking-wide text-on-accent">
          Now
        </span>
      )}
    </li>
  );
}

export function SchoolDay({
  kids,
  activities,
  nowMinutes,
  limit,
}: {
  kids: ScheduleKid[];
  /** One day's activities (any kids). */
  activities: ScheduleActivity[];
  /** Minutes since midnight when the day shown is today, else null. */
  nowMinutes: number | null;
  /** Show at most this many blocks per kid, starting from what's on now. */
  limit?: number;
}) {
  if (kids.length === 0) return null;
  return (
    <div
      className="grid gap-x-5 gap-y-5"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 14rem), 1fr))` }}
    >
      {kids.map((kid) => {
        const all = activities
          .filter((a) => a.child === kid.child)
          .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
        // With a limit, skip what's already over so "now" and "next" lead.
        const upcoming =
          limit !== undefined && nowMinutes !== null
            ? all.filter((a) => toMinutes(a.end) > nowMinutes)
            : all;
        const shown = limit !== undefined ? upcoming.slice(0, limit) : upcoming;
        const more = upcoming.length - shown.length;
        return (
          <section key={kid.child} aria-label={`${kid.name}'s day`} className="min-w-0">
            <header className="mb-2.5 flex items-center gap-2.5">
              <Avatar name={kid.name} color={kid.color} size="sm" />
              <h3 className="font-display text-lead font-medium leading-none text-fg">{kid.name}</h3>
            </header>
            {all.length === 0 ? (
              <p className="text-body text-fg-soft">Nothing scheduled.</p>
            ) : shown.length === 0 ? (
              <p className="text-body text-fg-soft">Done for the day.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {shown.map((a) => (
                  <BlockRow key={a.id} activity={a} kid={kid} nowMinutes={nowMinutes} />
                ))}
              </ul>
            )}
            {more > 0 && <p className="mt-1.5 text-small text-fg-soft">+{more} later</p>}
          </section>
        );
      })}
    </div>
  );
}
