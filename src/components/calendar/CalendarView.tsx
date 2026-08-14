"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ViewFrame } from "@/components/layout/ViewFrame";
import { useUpstream } from "@/hooks/useUpstream";
import { useIdleReset } from "@/hooks/useIdleReset";
import type { CalendarPayload } from "@/lib/calendar/types";
import {
  addDays,
  addMonths,
  monthGridRange,
  weekRange,
  toDateParam,
  monthTitle,
  weekTitle,
} from "@/lib/calendar/dates";
import { MemberChips } from "./MemberChips";
import { CalendarControls } from "./CalendarControls";
import { MonthGrid } from "./MonthGrid";
import { WeekView } from "./WeekView";
import { DayPanel } from "./DayPanel";

// The calendar, assembled (Phase 1). Owns view state, polls /api/calendar every
// 60s through the shared stale-data hook (Phase 1 #13), and returns itself to
// the resting state — current month, unfiltered — after five idle minutes
// (Phase 1 #14). Month view is the default (spec §4.1).
//
// Everything time-dependent is gated behind a mount flag so the server render
// and first client render agree (no hydration mismatch on "today"); the wall
// only ever sees the mounted view.

type ViewMode = "month" | "week";

export function CalendarView() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<Date | null>(null);

  useEffect(() => setMounted(true), []);

  // Keep "today" current on an always-on display so the marker moves at midnight.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // The visible range drives the fetch; the server stays view-agnostic.
  const range = mode === "month" ? monthGridRange(anchor) : weekRange(anchor);
  const startParam = toDateParam(range.start);
  const endParam = toDateParam(range.end);

  const fetcher = useCallback(async (): Promise<CalendarPayload> => {
    const res = await fetch(
      `/api/calendar?start=${startParam}&end=${endParam}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`calendar ${res.status}`);
    return res.json();
  }, [startParam, endParam]);

  const { data, isStale, lastUpdated, refetch } = useUpstream<CalendarPayload>(
    fetcher,
    { intervalMs: 60_000, enabled: mounted },
  );

  // Refetch immediately when the range changes (month/week navigation). The
  // hook itself handles the initial load, so skip that first invocation.
  const firstRange = useRef(true);
  useEffect(() => {
    if (!mounted) return;
    if (firstRange.current) {
      firstRange.current = false;
      return;
    }
    refetch();
  }, [startParam, endParam, mounted, refetch]);

  // Return to the resting state after five idle minutes.
  useIdleReset(
    useCallback(() => {
      setAnchor(new Date());
      setMode("month");
      setFilter(null);
      setOpenDay(null);
    }, []),
    { enabled: mounted },
  );

  const members = data?.members ?? [];
  const events = data?.events ?? [];
  const filtered = filter
    ? events.filter((e) => e.calendarId === filter)
    : events;

  const step = (dir: number) =>
    setAnchor((a) => (mode === "month" ? addMonths(a, dir) : addDays(a, dir * 7)));
  const goToday = () => setAnchor(new Date());
  const toggleFilter = (id: string) =>
    setFilter((cur) => (cur === id ? null : id));

  // Quiet skeleton until mounted — matches the server render exactly.
  if (!mounted) {
    return <ViewFrame title="Calendar">{null}</ViewFrame>;
  }

  const title = mode === "month" ? monthTitle(anchor) : weekTitle(anchor);

  return (
    <ViewFrame
      title={title}
      isStale={isStale}
      lastUpdated={lastUpdated}
      actions={
        <CalendarControls
          mode={mode}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToday={goToday}
          onSetMode={setMode}
        />
      }
    >
      <div className="flex h-full flex-col gap-4">
        {members.length > 0 && (
          <MemberChips
            members={members}
            activeCalendarId={filter}
            onToggle={toggleFilter}
          />
        )}
        <div className="min-h-0 flex-1">
          {mode === "month" ? (
            <MonthGrid
              anchor={anchor}
              events={filtered}
              now={now}
              onOpenDay={setOpenDay}
            />
          ) : (
            <WeekView
              anchor={anchor}
              events={filtered}
              now={now}
              onOpenDay={setOpenDay}
            />
          )}
        </div>
      </div>

      {openDay && (
        <DayPanel
          date={openDay}
          events={filtered}
          onClose={() => setOpenDay(null)}
        />
      )}
    </ViewFrame>
  );
}
