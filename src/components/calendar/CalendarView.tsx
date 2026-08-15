"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { ViewFrame } from "@/components/layout/ViewFrame";
import { useUpstream } from "@/hooks/useUpstream";
import { useIdleReset } from "@/hooks/useIdleReset";
import type { CalendarEvent, CalendarPayload } from "@/lib/calendar/types";
import { memberConcerns, soonestCountdown } from "@/lib/calendar/event";
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
import { CountdownStrip } from "./CountdownStrip";
import { MonthGrid } from "./MonthGrid";
import { WeekView } from "./WeekView";
import { DayPanel } from "./DayPanel";
import { AddEventPanel } from "./AddEventPanel";

// The calendar, assembled (Phase 1, extended in Phase 1.5). Owns view state,
// polls /api/calendar every 60s through the shared stale-data hook (Phase 1 #13),
// and returns itself to the resting state — current month, unfiltered, no open
// panels — after five idle minutes (Phase 1 #14, Phase 1.5 #22). Month view is
// the default (spec §4.1).
//
// Phase 1.5 adds event creation: an Add panel reachable from a floating button
// or by tapping an empty day, colored member bands, and a countdown strip. A
// just-created event is merged into local state immediately, keyed by id, so the
// next poll dedupes rather than duplicating (Phase 1.5 #19).
//
// Everything time-dependent is gated behind a mount flag so the server render
// and first client render agree (no hydration mismatch on "today").

type ViewMode = "month" | "week";

export function CalendarView() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<string | null>(null); // member key
  const [openDay, setOpenDay] = useState<Date | null>(null);

  // Add Event panel + entry state.
  const [addDate, setAddDate] = useState<Date | null>(null);
  const [mruCalendarId, setMruCalendarId] = useState<string | null>(null);
  // Locally-created events, merged over polled data until a poll returns them.
  const [optimistic, setOptimistic] = useState<CalendarEvent[]>([]);

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

  // Return to the resting state after five idle minutes (incl. any open panels).
  useIdleReset(
    useCallback(() => {
      setAnchor(new Date());
      setMode("month");
      setFilter(null);
      setOpenDay(null);
      setAddDate(null);
    }, []),
    { enabled: mounted },
  );

  const members = data?.members ?? [];
  const calendars = data?.calendars ?? [];
  const baseEvents = data?.events ?? [];

  // Merge locally-created events over polled data, keyed by id so a poll that
  // has caught up wins and there is never a duplicate chip (Phase 1.5 #13, #19).
  const events = useMemo(() => {
    if (optimistic.length === 0) return baseEvents;
    const ids = new Set(baseEvents.map((e) => e.id));
    return [...baseEvents, ...optimistic.filter((e) => !ids.has(e.id))];
  }, [baseEvents, optimistic]);

  // Drop optimistic entries once the poll has them, so the set can't grow forever.
  useEffect(() => {
    if (optimistic.length === 0) return;
    const ids = new Set(baseEvents.map((e) => e.id));
    if (optimistic.some((e) => ids.has(e.id))) {
      setOptimistic((prev) => prev.filter((e) => !ids.has(e.id)));
    }
  }, [baseEvents, optimistic]);

  const filtered = filter
    ? events.filter((e) => memberConcerns(e, filter))
    : events;

  const nextCountdown = useMemo(
    () => soonestCountdown(filtered, now),
    [filtered, now],
  );

  const step = (dir: number) =>
    setAnchor((a) => (mode === "month" ? addMonths(a, dir) : addDays(a, dir * 7)));
  const goToday = () => setAnchor(new Date());
  const toggleFilter = (key: string) =>
    setFilter((cur) => (cur === key ? null : key));

  const openAdd = useCallback((date: Date) => {
    setOpenDay(null);
    setAddDate(date);
  }, []);

  const handleCreated = useCallback(
    (event: CalendarEvent, calendarId: string) => {
      setOptimistic((prev) => [...prev.filter((e) => e.id !== event.id), event]);
      setMruCalendarId(calendarId);
      setAddDate(null);
      refetch(); // reconcile against the server (which has already seeded it)
    },
    [refetch],
  );

  // Quiet skeleton until mounted — matches the server render exactly.
  if (!mounted) {
    return <ViewFrame title="Calendar">{null}</ViewFrame>;
  }

  const title = mode === "month" ? monthTitle(anchor) : weekTitle(anchor);
  const canAdd = calendars.length > 0;

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
            activeMemberKey={filter}
            onToggle={toggleFilter}
          />
        )}
        {nextCountdown && <CountdownStrip event={nextCountdown} now={now} />}
        <div className="min-h-0 flex-1">
          {mode === "month" ? (
            <MonthGrid
              anchor={anchor}
              events={filtered}
              now={now}
              onOpenDay={setOpenDay}
              onAddDay={openAdd}
            />
          ) : (
            <WeekView
              anchor={anchor}
              events={filtered}
              now={now}
              onOpenDay={setOpenDay}
              onAddDay={openAdd}
            />
          )}
        </div>
      </div>

      {/* Floating add button — the secondary entry point (Phase 1.5 #10). */}
      {canAdd && (
        <button
          type="button"
          onClick={() => openAdd(new Date())}
          aria-label="Add event"
          className="fixed bottom-8 right-8 z-30 flex size-16 items-center justify-center rounded-full bg-ink text-surface shadow-[0_12px_30px_-8px_rgba(43,38,32,0.55)] transition-transform active:scale-95"
        >
          <Plus className="size-9" strokeWidth={2.5} aria-hidden />
        </button>
      )}

      {openDay && (
        <DayPanel
          date={openDay}
          events={filtered}
          now={now}
          onClose={() => setOpenDay(null)}
          onAddDay={openAdd}
        />
      )}

      {addDate && (
        <AddEventPanel
          initialDate={addDate}
          now={now}
          members={members}
          calendars={calendars}
          defaultCalendarId={mruCalendarId}
          onClose={() => setAddDate(null)}
          onCreated={handleCreated}
        />
      )}
    </ViewFrame>
  );
}
