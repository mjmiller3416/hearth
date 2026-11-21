"use client";

import { Star } from "lucide-react";
import { Avatar, tint } from "@/components/ui/Avatar";
import { colorVar } from "@/lib/calendar/palette";
import type { ScheduleActivity, ScheduleKid } from "@/lib/tandem/types";
import { toMinutes } from "@/lib/tandem/week";

// One school day as a list, per kid: the form a kid reads ("what's now, what's
// next"), used by the School page on a phone and by Today everywhere. Blocks
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
      className={`flex items-center gap-3 rounded-xl py-2 pl-3 pr-3 ${over ? "opacity-45" : ""}`}
      style={{
        backgroundColor: isNow ? tint(kid.color, 26) : tint(kid.color, 10),
        boxShadow: `inset 4px 0 0 var(${colorVar(kid.color)})`,
      }}
    >
      <span className="w-[5.2em] shrink-0 text-label tabular-nums text-ink-soft">
        {clock(activity.start)}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-body leading-snug text-ink">
        {activity.important && (
          <Star className="size-4 shrink-0 fill-current text-ink" aria-label="Important" />
        )}
        <span className="truncate">{activity.name}</span>
      </span>
      {isNow ? (
        <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-stamp font-semibold uppercase leading-none tracking-wide text-on-ink">
          Now
        </span>
      ) : (
        <span className="shrink-0 text-stamp tabular-nums text-ink-faint">to {clock(activity.end)}</span>
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
            <header className="mb-2 flex items-center gap-2">
              <Avatar name={kid.name} color={kid.color} size="xs" />
              <h3 className="font-display text-title leading-none text-ink">{kid.name}</h3>
            </header>
            {all.length === 0 ? (
              <p className="text-body text-ink-faint">Nothing scheduled.</p>
            ) : shown.length === 0 ? (
              <p className="text-body text-ink-faint">Done for the day.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {shown.map((a) => (
                  <BlockRow key={a.id} activity={a} kid={kid} nowMinutes={nowMinutes} />
                ))}
              </ul>
            )}
            {more > 0 && <p className="mt-1.5 text-label text-ink-faint">+{more} later</p>}
          </section>
        );
      })}
    </div>
  );
}
