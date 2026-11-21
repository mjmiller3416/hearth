"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Backpack, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useHousehold } from "@/components/app/Household";
import { useTextOn } from "@/components/common/ColorProvider";
import { useTimeZone } from "@/components/common/TimeZone";
import { tint } from "@/components/ui/Avatar";
import { Button, IconButton } from "@/components/ui/Button";
import { AsOf, Card, EmptyState, SourceGate } from "@/components/ui/Card";
import { Page } from "@/components/ui/Page";
import { useSchoolWeek } from "@/hooks/useHub";
import { useIdleReset } from "@/hooks/useIdleReset";
import { useNow } from "@/hooks/useNow";
import { zonedNow } from "@/lib/calendar/dates";
import { colorVar } from "@/lib/calendar/palette";
import { useMounted } from "@/lib/prefs";
import type { ScheduleActivity, ScheduleKid } from "@/lib/tandem/types";
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
import { SchoolDay } from "./SchoolDay";

// School: Lincoln's and Ollie's Monday–Friday week from Tandem. Read-only (like
// Meals, spec D6): adding, editing and copying weeks stays in Tandem.
//
//   wide   the whole week as an hour grid, a lane per kid in each day, so both
//          days can be compared across the room. A line marks the current time.
//   phone  one day at a time as a list, which is what a kid actually wants:
//          "what do I have today, and what's next".
//
// A kid's lens narrows both to that kid. The week is held as an OFFSET from the
// resting week (this week, or next week on a weekend), so a screen left here
// rolls over to the new week by itself.

export function SchoolView() {
  const timeZone = useTimeZone();
  const { lens } = useHousehold();
  const now = useNow(timeZone);
  const [offset, setOffset] = useState(0);
  // The day a phone shows; null follows today (or Monday on another week).
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  // During SSR there is no clock: a placeholder Monday keeps the hooks in order,
  // and nothing is fetched until the first client render, which has the date.
  const mounted = useMounted();
  const today = now ? isoDate(now) : mounted ? isoDate(zonedNow(timeZone)) : "2000-01-03";
  const monday = addDays(restingMonday(today), offset * 7);
  const week = useSchoolWeek(monday);

  useIdleReset(
    useCallback(() => {
      setOffset(0);
      setPickedDay(null);
    }, []),
  );

  const data = week.data;
  const configured = data?.configured ?? false;
  // While a week switch is in flight, keep the old week on screen, faded.
  const switching = data !== null && data.weekStart !== monday;
  const days = weekdays(data?.weekStart ?? monday);
  const kids = (data?.kids ?? []).filter(
    (k) => !lens?.tandemChild || k.child === lens.tandemChild,
  );
  const activities = (data?.activities ?? []).filter(
    (a) => !lens?.tandemChild || a.child === lens.tandemChild,
  );
  const day = pickedDay && days.includes(pickedDay) ? pickedDay : days.includes(today) ? today : days[0];
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : null;

  const step = (dir: number) => {
    setOffset((o) => o + dir);
    setPickedDay(null);
  };

  return (
    <Page
      title="School"
      eyebrow={weekLabel(today, monday) ?? "Week of"}
      controls={
        <>
          <span className="font-display text-title text-ink">{weekRangeLabel(monday)}</span>
          <span className="flex items-center gap-1">
            <IconButton label="Previous week" onClick={() => step(-1)}>
              <ChevronLeft className="size-6" strokeWidth={2.25} aria-hidden />
            </IconButton>
            <Button size="sm" onClick={() => { setOffset(0); setPickedDay(null); }} disabled={offset === 0}>
              This week
            </Button>
            <IconButton label="Next week" onClick={() => step(1)}>
              <ChevronRight className="size-6" strokeWidth={2.25} aria-hidden />
            </IconButton>
          </span>
        </>
      }
    >
      <SourceGate state={week} configured={configured} app="Tandem" what="The kids' school week" rows={5}>
        <div className={`wide:h-full ${switching ? "opacity-40 transition-opacity" : ""}`}>
          {/* Phone: day pills, then that day as a list. */}
          <div className="flex flex-col gap-4 wide:hidden">
            <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Day">
              {days.map((d) => {
                const date = parseIsoDate(d);
                const active = d === day;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPickedDay(d)}
                    className={`flex flex-col items-center rounded-2xl py-2 leading-none transition-colors ${
                      active ? "bg-ink text-on-ink" : "bg-surface text-ink-soft ring-1 ring-inset ring-hairline"
                    }`}
                  >
                    <span className="text-stamp font-semibold uppercase">
                      {date?.toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                    <span className="mt-1 font-display text-title">{date?.getDate()}</span>
                    <span
                      className={`mt-1 size-1.5 rounded-full ${d === today ? "bg-ember" : "bg-transparent"}`}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
            <Card
              bodyClassName="pt-5"
              stamp={<AsOf isStale={week.isStale} lastUpdated={week.lastUpdated} />}
            >
              <SchoolDay
                kids={kids}
                activities={activities.filter((a) => a.day === day)}
                nowMinutes={day === today ? nowMinutes : null}
              />
            </Card>
          </div>

          {/* Wide: the week grid. */}
          <div className="hidden h-full wide:block">
            {activities.length === 0 ? (
              <Card className="h-full">
                <EmptyState icon={Backpack} title="Nothing scheduled this week">
                  Add activities in Tandem and they&rsquo;ll show up here.
                </EmptyState>
              </Card>
            ) : (
              <WeekGrid
                days={days}
                kids={kids}
                activities={activities}
                today={today}
                nowMinutes={nowMinutes}
              />
            )}
          </div>
        </div>
      </SourceGate>
    </Page>
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

// ── The week grid (wide) ────────────────────────────────────────────────────

const AXIS_WIDTH = "4.5rem";

function WeekGrid({
  days,
  kids,
  activities,
  today,
  nowMinutes,
}: {
  days: string[];
  kids: ScheduleKid[];
  activities: ScheduleActivity[];
  today: string;
  nowMinutes: number | null;
}) {
  const [firstHour, lastHour] = visibleHours(activities);
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);
  const columns = `${AXIS_WIDTH} repeat(${days.length}, minmax(0, 1fr))`;

  // Blocks are placed in pixels, so measure the body and follow its size.
  // The root font size comes along too: it scales with the viewport, and a
  // block needs to know how many lines of text fit inside it.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [rem, setRem] = useState(16);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setBodyHeight(el.clientHeight);
      setRem(parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const pxPerMin = bodyHeight / ((lastHour - firstHour) * 60);
  const y = (minutes: number) => (minutes - firstHour * 60) * pxPerMin;
  const nowInView =
    nowMinutes !== null && nowMinutes >= firstHour * 60 && nowMinutes <= lastHour * 60;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[1.5rem] bg-surface shadow-card ring-1 ring-hairline/70">
      {/* Day headers, each with its lane labels */}
      <div className="grid shrink-0 border-b border-hairline" style={{ gridTemplateColumns: columns }}>
        <div />
        {days.map((day) => {
          const isToday = day === today;
          const date = parseIsoDate(day);
          return (
            <div
              key={day}
              className={`flex flex-col gap-1.5 border-l border-hairline px-3 pb-2.5 pt-3 ${isToday ? "bg-surface-2" : ""}`}
            >
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-label font-semibold uppercase tracking-wide text-ink-soft">
                  {date?.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 font-display text-title leading-none ${
                    isToday ? "bg-ink text-on-ink" : "text-ink"
                  }`}
                  aria-current={isToday ? "date" : undefined}
                >
                  {date?.getDate()}
                </span>
              </div>
              {kids.length > 1 && (
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${kids.length}, minmax(0, 1fr))` }}>
                  {kids.map((kid) => (
                    <span
                      key={kid.child}
                      className="flex items-center justify-center gap-1.5 truncate text-stamp font-semibold text-ink-soft"
                    >
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: `var(${colorVar(kid.color)})` }}
                      />
                      {kid.name}
                    </span>
                  ))}
                </div>
              )}
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
                className={`absolute right-2.5 whitespace-nowrap text-stamp tabular-nums text-ink-faint ${
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
              className={`relative grid border-l border-hairline ${isToday ? "bg-surface-2" : ""}`}
              style={{ gridTemplateColumns: `repeat(${Math.max(kids.length, 1)}, minmax(0, 1fr))` }}
            >
              {bodyHeight > 0 &&
                hours.slice(1, -1).map((hour) => (
                  <div
                    key={hour}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 border-t border-hairline"
                    style={{ top: y(hour * 60) }}
                  />
                ))}
              {kids.map((kid, i) => (
                <div
                  key={kid.child}
                  role="group"
                  aria-label={`${kid.name}, ${day}`}
                  className={`relative ${i > 0 ? "border-l border-dashed border-hairline" : ""} ${past ? "opacity-55" : ""}`}
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
                        rem={rem}
                      />
                    ))}
                </div>
              ))}
              {/* The current time, across today's column. */}
              {isToday && nowInView && bodyHeight > 0 && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                  style={{ top: y(nowMinutes) }}
                >
                  <span className="-ml-1 size-2.5 -translate-y-1/2 rounded-full bg-ember" />
                  <span className="h-0.5 flex-1 -translate-y-1/2 bg-ember" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Block({
  item,
  kid,
  top,
  height,
  rem,
}: {
  item: PlacedActivity;
  kid: ScheduleKid;
  top: number;
  height: number;
  /** The root font size in px, to know how many lines fit. */
  rem: number;
}) {
  const textOn = useTextOn();
  const { activity, column, columns } = item;
  const color = `var(${colorVar(kid.color)})`;
  const h = Math.max(height - 3, rem);
  const range = `${shortTime(activity.start)} – ${shortTime(activity.end)}`;
  // Two lines of stamp text plus padding need about 2.9rem; below that the
  // name alone, centered.
  const roomy = h >= rem * 2.9;

  return (
    <div
      aria-label={`${activity.name}, ${kid.name}, ${range}${activity.important ? ", important" : ""}`}
      className={`absolute flex flex-col overflow-hidden rounded-lg px-2 leading-tight ${
        roomy ? "py-1.5" : "justify-center py-0"
      }`}
      style={{
        top: top + 1,
        height: h,
        left: `calc(${(column / columns) * 100}% + 3px)`,
        width: `calc(${100 / columns}% - 6px)`,
        backgroundColor: activity.important ? color : tint(kid.color, 24),
        color: activity.important
          ? textOn(kid.color) === "dark"
            ? "#27221c"
            : "#ffffff"
          : "var(--color-ink)",
        boxShadow: activity.important ? undefined : `inset 4px 0 0 ${color}`,
      }}
    >
      <span className="flex min-w-0 items-center gap-1 text-stamp font-semibold">
        {activity.important && <Star className="size-3.5 shrink-0 fill-current" aria-hidden />}
        <span className="truncate">{activity.name}</span>
      </span>
      {roomy && <span className="truncate text-stamp opacity-80">{range}</span>}
    </div>
  );
}
