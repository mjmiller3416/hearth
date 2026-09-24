"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { ViewFrame } from "@/components/layout/ViewFrame";
import { useTextOn } from "@/components/common/ColorProvider";
import { useUpstream } from "@/hooks/useUpstream";
import { useIdleReset } from "@/hooks/useIdleReset";
import { colorVar } from "@/lib/calendar/palette";
import type { ScheduleActivity, ScheduleKid, SchedulePayload } from "@/lib/tandem/types";
import {
  addDays,
  hourLabel,
  isoDate,
  layoutLane,
  mondayOf,
  parseIsoDate,
  restingMonday,
  shortTime,
  toMinutes,
  visibleHours,
  weekRangeLabel,
  weekdays,
  type PlacedActivity,
} from "@/lib/tandem/week";

// The Schedule view: Lincoln's and Ollie's Monday–Friday week from Tandem, side
// by side. Each day is one column split into a lane per kid, with blocks placed
// by start and end time. Read-only (like Meals, spec D6): adding, editing, and
// copying weeks stays in Tandem on the phone.
//
// The kids wear their Hearth member colors (spec §7). A regular block is a soft
// tint with a solid edge, and an important one is a solid fill with a star, so
// "don't miss this" reads from across the room. The grid fits the hours actually
// used this week instead of Tandem's full 8 AM – 10 PM, keeping blocks large.
//
// The week is held as an OFFSET from the resting week (this week, or next week
// on a weekend), not a fixed date, so a wall left on this view rolls over to the
// new week by itself. Idle reset returns to offset 0. Polls every 60s on Hearth's
// stale-data contract (useUpstream); not connected → a calm state, never an error.

export function ScheduleView() {
  const [mounted, setMounted] = useState(false);
  const [offset, setOffset] = useState(0);
  useEffect(() => setMounted(true), []);

  // Recomputed every render; the 60s poll re-renders, so "today" keeps up.
  const today = isoDate(new Date());
  const monday = addDays(restingMonday(today), offset * 7);

  // useUpstream keeps the latest fetcher in a ref, so this closes over the
  // current week without memoizing.
  const fetcher = async (): Promise<SchedulePayload> => {
    const res = await fetch(`/api/schedule?week=${monday}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`schedule ${res.status}`);
    return res.json();
  };

  const { data, isStale, lastUpdated, refetch, isLoading } = useUpstream<SchedulePayload>(
    fetcher,
    { intervalMs: 60_000, enabled: mounted },
  );

  // Changing weeks fetches at once rather than waiting for the next poll.
  useEffect(() => {
    if (mounted) void refetch();
  }, [mounted, monday, refetch]);

  useIdleReset(
    useCallback(() => setOffset(0), []),
    { enabled: mounted },
  );

  if (!mounted) {
    return <ViewFrame title="Schedule">{null}</ViewFrame>;
  }

  const configured = data?.configured ?? false;
  // While a week switch is in flight, keep the old week on screen, faded, rather
  // than blanking the grid.
  const switching = data !== null && data.weekStart !== monday;

  return (
    <ViewFrame
      title="Schedule"
      isStale={isStale}
      lastUpdated={lastUpdated}
      actions={
        <WeekControls
          label={weekLabel(today, monday)}
          range={weekRangeLabel(monday)}
          atRest={offset === 0}
          onPrev={() => setOffset((o) => o - 1)}
          onNext={() => setOffset((o) => o + 1)}
          onReset={() => setOffset(0)}
        />
      }
    >
      {isLoading ? null : !configured ? (
        <NotConnected />
      ) : data ? (
        <div className={`h-full transition-opacity ${switching ? "opacity-40" : ""}`}>
          <WeekGrid
            days={weekdays(data.weekStart)}
            kids={data.kids}
            activities={data.activities}
            today={today}
          />
        </div>
      ) : null}
    </ViewFrame>
  );
}

/** "This week" / "Next week" / "Last week" relative to today, else null. */
function weekLabel(today: string, monday: string): string | null {
  const weeks = Math.round(
    ((parseIsoDate(monday)?.getTime() ?? 0) - (parseIsoDate(mondayOf(today))?.getTime() ?? 0)) /
      (7 * 86_400_000),
  );
  return { [-1]: "Last week", 0: "This week", 1: "Next week" }[weeks] ?? null;
}

function WeekControls({
  label,
  range,
  atRest,
  onPrev,
  onNext,
  onReset,
}: {
  label: string | null;
  range: string;
  atRest: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <p className="text-label text-ink-soft">
        {label && <span className="font-medium text-ink">{label} · </span>}
        {range}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous week"
          className="flex size-12 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface"
        >
          <ChevronLeft className="size-8" strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={atRest}
          className="rounded-full px-5 py-2 text-label font-medium text-ink transition-colors hover:bg-surface disabled:text-ink-faint disabled:hover:bg-transparent"
        >
          Today
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Next week"
          className="flex size-12 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface"
        >
          <ChevronRight className="size-8" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ── The grid ────────────────────────────────────────────────────────────────

const AXIS_WIDTH = "5.5rem";

function WeekGrid({
  days,
  kids,
  activities,
  today,
}: {
  days: string[];
  kids: ScheduleKid[];
  activities: ScheduleActivity[];
  today: string;
}) {
  const [firstHour, lastHour] = visibleHours(activities);
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);
  const columns = `${AXIS_WIDTH} repeat(${days.length}, minmax(0, 1fr))`;

  // Blocks are placed in pixels, so measure the body. The Stage canvas is fixed,
  // so this settles once; the observer covers the first layout.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBodyHeight(el.clientHeight));
    observer.observe(el);
    setBodyHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);
  const pxPerMin = bodyHeight / ((lastHour - firstHour) * 60);
  const y = (minutes: number) => (minutes - firstHour * 60) * pxPerMin;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl bg-surface shadow-[inset_0_0_0_1px_var(--color-hairline)]">
      {/* Day headers, each with its two lane labels */}
      <div className="grid shrink-0 border-b border-hairline" style={{ gridTemplateColumns: columns }}>
        <div />
        {days.map((day) => {
          const isToday = day === today;
          const date = parseIsoDate(day);
          return (
            <div
              key={day}
              className={`flex flex-col gap-2 border-l border-hairline px-3 pb-3 pt-4 ${isToday ? "bg-ground-2/60" : ""}`}
            >
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-label font-medium uppercase tracking-wide text-ink-soft">
                  {date?.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span
                  className={`rounded-full px-3 py-0.5 font-display text-title leading-none ${
                    isToday ? "bg-coral text-white" : "text-ink"
                  }`}
                  aria-current={isToday ? "date" : undefined}
                >
                  {date?.getDate()}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {kids.map((kid) => (
                  <span
                    key={kid.child}
                    className="flex items-center justify-center gap-2 truncate text-stamp font-medium text-ink-soft"
                  >
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: `var(${colorVar(kid.color)})` }}
                    />
                    {kid.name}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Body: hour axis, then a column per day split into a lane per kid */}
      <div ref={bodyRef} className="grid min-h-0 flex-1" style={{ gridTemplateColumns: columns }}>
        <div className="relative">
          {bodyHeight > 0 &&
            hours.map((hour, i) => (
              <span
                key={hour}
                className={`absolute right-3 whitespace-nowrap text-stamp tabular-nums text-ink-faint ${
                  i === 0 ? "translate-y-1" : i === hours.length - 1 ? "-translate-y-full" : "-translate-y-1/2"
                }`}
                style={{ top: y(hour * 60) }}
              >
                {hourLabel(hour)}
              </span>
            ))}
        </div>

        {days.map((day) => {
          const past = day < today;
          const isToday = day === today;
          return (
            <div
              key={day}
              className={`relative grid grid-cols-2 border-l border-hairline ${isToday ? "bg-ground-2/60" : ""}`}
            >
              {bodyHeight > 0 &&
                hours.slice(1, -1).map((hour) => (
                  <div
                    key={hour}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 border-t border-hairline/70"
                    style={{ top: y(hour * 60) }}
                  />
                ))}
              {kids.map((kid, i) => (
                <div
                  key={kid.child}
                  role="group"
                  aria-label={`${kid.name}, ${day}`}
                  className={`relative ${i > 0 ? "border-l border-dashed border-hairline/70" : ""} ${past ? "opacity-55" : ""}`}
                >
                  {bodyHeight > 0 &&
                    layoutLane(
                      activities.filter((a) => a.day === day && a.child === kid.child),
                    ).map((item) => (
                      <Block
                        key={item.activity.id}
                        item={item}
                        kid={kid}
                        top={y(toMinutes(item.activity.start))}
                        height={(toMinutes(item.activity.end) - toMinutes(item.activity.start)) * pxPerMin}
                      />
                    ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {activities.length === 0 && (
        <p className="shrink-0 border-t border-hairline py-3 text-center text-label text-ink-faint">
          Nothing scheduled this week. Add activities in Tandem and they’ll show up here.
        </p>
      )}
    </div>
  );
}

function Block({
  item,
  kid,
  top,
  height,
}: {
  item: PlacedActivity;
  kid: ScheduleKid;
  top: number;
  height: number;
}) {
  const textOn = useTextOn();
  const { activity, column, columns } = item;
  const color = `var(${colorVar(kid.color)})`;
  const h = Math.max(height - 3, 18);
  const range = `${shortTime(activity.start)} – ${shortTime(activity.end)}`;
  const solidText = textOn(kid.color) === "dark" ? "text-ink" : "text-white";

  return (
    <div
      aria-label={`${activity.name}, ${kid.name}, ${range}${activity.important ? ", important" : ""}`}
      className={`absolute flex flex-col overflow-hidden rounded-lg px-2 leading-tight ${
        h < 40 ? "justify-center py-0" : "py-1.5"
      } ${activity.important ? `${solidText} shadow-sm` : "text-ink"}`}
      style={{
        top: top + 1,
        height: h,
        left: `calc(${(column / columns) * 100}% + 3px)`,
        width: `calc(${100 / columns}% - 6px)`,
        backgroundColor: activity.important
          ? color
          : `color-mix(in srgb, ${color} 22%, var(--color-surface))`,
        boxShadow: activity.important ? undefined : `inset 4px 0 0 ${color}`,
      }}
    >
      <span className="flex min-w-0 items-center gap-1 text-stamp font-semibold">
        {activity.important && <Star className="size-4 shrink-0 fill-current" aria-hidden />}
        <span className="truncate">{activity.name}</span>
      </span>
      {h >= 44 && <span className="truncate text-stamp opacity-80">{range}</span>}
    </div>
  );
}

function NotConnected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-title text-ink-soft">Not connected to Tandem yet.</p>
      <p className="max-w-xl text-body text-ink-faint">
        Lincoln’s and Ollie’s school week appears here once Tandem is set up.
      </p>
    </div>
  );
}
