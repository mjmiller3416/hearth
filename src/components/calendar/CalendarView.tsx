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

// A locally-created or -edited event shown over polled data until the poll
// catches up. `supersedes` is the id of the pre-edit event to hide during the
// round-trip (a time edit or a personal→group promotion changes the id).
interface Overlay {
  event: CalendarEvent;
  supersedes: string | null;
}

// Content signature — an overlay retires once the polled copy matches it (not
// merely when the id reappears: a title-only edit keeps the same id).
function eventSig(e: CalendarEvent): string {
  return [
    e.title,
    e.start,
    e.end,
    e.allDay,
    [...e.memberKeys].sort().join(","),
    e.countdown,
  ].join("|");
}

export function CalendarView() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<string | null>(null); // member key
  const [openDay, setOpenDay] = useState<Date | null>(null);

  // Add/Edit panel + entry state.
  const [addDate, setAddDate] = useState<Date | null>(null);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  // Locally created/edited events, shown over polled data until the poll agrees.
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  // Groups being deleted, hidden immediately until the poll stops returning them.
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(
    () => new Set(),
  );

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
      setEditEvent(null);
    }, []),
    { enabled: mounted },
  );

  const members = data?.members ?? [];
  const configured = data?.configured ?? false;
  const baseEvents = data?.events ?? [];

  // Overlay locally created/edited events on the polled data: drop any base event
  // an overlay replaces (same id) or supersedes (the pre-edit id), add the
  // overlays, then hide any groups the user just deleted until the poll agrees.
  const events = useMemo(() => {
    let merged: CalendarEvent[];
    if (overlays.length === 0) {
      merged = baseEvents;
    } else {
      const hidden = new Set<string>();
      for (const o of overlays) {
        hidden.add(o.event.id);
        if (o.supersedes) hidden.add(o.supersedes);
      }
      merged = [
        ...baseEvents.filter((e) => !hidden.has(e.id)),
        ...overlays.map((o) => o.event),
      ];
    }
    if (pendingDeletes.size === 0) return merged;
    return merged.filter(
      (e) => !(e.hearthGroupId && pendingDeletes.has(e.hearthGroupId)),
    );
  }, [baseEvents, overlays, pendingDeletes]);

  // Retire an overlay once the poll returns the same id with matching content
  // (id alone is not enough — a title-only edit keeps the id).
  useEffect(() => {
    if (overlays.length === 0) return;
    const sigById = new Map(baseEvents.map((e) => [e.id, eventSig(e)]));
    const survivors = overlays.filter((o) => sigById.get(o.event.id) !== eventSig(o.event));
    if (survivors.length !== overlays.length) setOverlays(survivors);
  }, [baseEvents, overlays]);

  // Drop pending-delete markers once the poll no longer returns that group.
  useEffect(() => {
    if (pendingDeletes.size === 0) return;
    const liveGids = new Set(
      baseEvents.map((e) => e.hearthGroupId).filter((g): g is string => Boolean(g)),
    );
    let changed = false;
    const next = new Set(pendingDeletes);
    for (const gid of pendingDeletes) {
      if (!liveGids.has(gid)) {
        next.delete(gid);
        changed = true;
      }
    }
    if (changed) setPendingDeletes(next);
  }, [baseEvents, pendingDeletes]);

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

  const openEdit = useCallback((event: CalendarEvent) => {
    setOpenDay(null);
    setEditEvent(event);
  }, []);

  const handleCreated = useCallback(
    (event: CalendarEvent) => {
      // Show it immediately; the panel decides whether to close (it stays open to
      // report any per-member share failures).
      setOverlays((prev) => [
        ...prev.filter((o) => o.event.id !== event.id),
        { event, supersedes: null },
      ]);
      refetch(); // reconcile against the server (which has already seeded it)
    },
    [refetch],
  );

  const handleEdited = useCallback(
    (event: CalendarEvent, oldEvent: CalendarEvent) => {
      // Show the edited event over the stale one, hiding the pre-edit identity
      // (a time change or a personal→group promotion changes the id).
      const supersedes = oldEvent.id === event.id ? null : oldEvent.id;
      setOverlays((prev) => [
        ...prev.filter((o) => o.event.id !== event.id && o.event.id !== oldEvent.id),
        { event, supersedes },
      ]);
      refetch();
    },
    [refetch],
  );

  const handleDelete = useCallback(
    (event: CalendarEvent) => {
      const gid = event.hearthGroupId;
      if (!gid) return; // only Hearth-created events are deletable from the wall
      setPendingDeletes((prev) => new Set(prev).add(gid));
      setOverlays((prev) => prev.filter((o) => o.event.hearthGroupId !== gid));
      // Fire-and-forget; the pending-delete marker hides it until the poll agrees.
      fetch("/api/calendar/events", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hearthGroupId: gid }),
      })
        .catch(() => {})
        .finally(() => refetch());
    },
    [refetch],
  );

  // Quiet skeleton until mounted — matches the server render exactly.
  if (!mounted) {
    return <ViewFrame title="Calendar">{null}</ViewFrame>;
  }

  const title = mode === "month" ? monthTitle(anchor) : weekTitle(anchor);
  const canAdd = configured && members.length > 0;

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
          onEdit={openEdit}
        />
      )}

      {addDate && (
        <AddEventPanel
          initialDate={addDate}
          now={now}
          members={members}
          onClose={() => setAddDate(null)}
          onCreated={handleCreated}
        />
      )}

      {editEvent && (
        <AddEventPanel
          initialDate={now}
          now={now}
          members={members}
          initialEvent={editEvent}
          onClose={() => setEditEvent(null)}
          onCreated={handleCreated}
          onEdited={handleEdited}
          onDeleted={handleDelete}
        />
      )}
    </ViewFrame>
  );
}
