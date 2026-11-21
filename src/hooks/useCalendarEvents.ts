"use client";

import { useCallback, useMemo, useState } from "react";
import { useRefetchOn } from "@/hooks/useHub";
import { useUpstream, type UpstreamState } from "@/hooks/useUpstream";
import { useMounted } from "@/lib/prefs";
import type { CalendarEvent, CalendarPayload, Member } from "@/lib/calendar/types";

// The calendar's events for a date range, with the optimistic layer every
// calendar write needs: a created or edited event shows at once and stays until
// the poll returns the same thing; a deleted one hides at once and comes back
// only if the delete fails. Used by the Calendar page and by Today, so adding
// an event from either lands the same way.

/** A local event shown over polled data until the poll catches up. */
interface Overlay {
  event: CalendarEvent;
  /** The pre-edit id to hide meanwhile (a time edit can change the id). */
  supersedes: string | null;
}

/** Content signature: an overlay retires once the polled copy matches it. */
function eventSig(e: CalendarEvent): string {
  return [e.title, e.start, e.end, e.allDay, [...e.memberKeys].sort().join(","), e.countdown].join("|");
}

export interface CalendarEvents {
  state: UpstreamState<CalendarPayload>;
  configured: boolean;
  /** The taggable people, for the Assign control. */
  members: Member[];
  /** Polled events with local creates/edits/deletes applied. */
  events: CalendarEvent[];
  /** Whether events can be added (calendar connected and people configured). */
  canAdd: boolean;
  created: (event: CalendarEvent) => void;
  edited: (event: CalendarEvent, old: CalendarEvent) => void;
  remove: (event: CalendarEvent) => void;
}

export function useCalendarEvents(start: string, end: string): CalendarEvents {
  const mounted = useMounted();
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [pendingGroups, setPendingGroups] = useState<Set<string>>(() => new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  const fetcher = useCallback(async (): Promise<CalendarPayload> => {
    const res = await fetch(`/api/calendar?start=${start}&end=${end}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`calendar ${res.status}`);
    return res.json();
  }, [start, end]);

  // Retire local state the poll now agrees with (see useUpstream's onData).
  const onData = useCallback((payload: CalendarPayload) => {
    const sigById = new Map(payload.events.map((e) => [e.id, eventSig(e)]));
    setOverlays((prev) => {
      const next = prev.filter((o) => sigById.get(o.event.id) !== eventSig(o.event));
      return next.length === prev.length ? prev : next;
    });
    const liveGroups = new Set(payload.events.map((e) => e.hearthGroupId).filter(Boolean));
    setPendingGroups((prev) => {
      const next = new Set([...prev].filter((g) => liveGroups.has(g)));
      return next.size === prev.size ? prev : next;
    });
    setPendingIds((prev) => {
      const next = new Set([...prev].filter((id) => sigById.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  const state = useUpstream<CalendarPayload>(fetcher, { enabled: mounted, onData });
  const { refetch, data } = state;

  // A new range (another month or week) fetches at once.
  useRefetchOn(`${start}|${end}`, refetch, mounted);

  const events = useMemo(() => {
    const base = data?.events ?? [];
    const hidden = new Set<string>();
    for (const o of overlays) {
      hidden.add(o.event.id);
      if (o.supersedes) hidden.add(o.supersedes);
    }
    return [...base.filter((e) => !hidden.has(e.id)), ...overlays.map((o) => o.event)].filter(
      (e) => !(e.hearthGroupId && pendingGroups.has(e.hearthGroupId)) && !pendingIds.has(e.id),
    );
  }, [data, overlays, pendingGroups, pendingIds]);

  const created = useCallback(
    (event: CalendarEvent) => {
      setOverlays((prev) => [...prev.filter((o) => o.event.id !== event.id), { event, supersedes: null }]);
      void refetch();
    },
    [refetch],
  );

  const edited = useCallback(
    (event: CalendarEvent, old: CalendarEvent) => {
      const supersedes = old.id === event.id ? null : old.id;
      setOverlays((prev) => [
        ...prev.filter((o) => o.event.id !== event.id && o.event.id !== old.id),
        { event, supersedes },
      ]);
      void refetch();
    },
    [refetch],
  );

  const remove = useCallback(
    (event: CalendarEvent) => {
      const gid = event.hearthGroupId;
      // A Hearth event deletes every copy by group id; any other (phone-made)
      // event deletes the single copy by its real calendar + event id.
      const body = gid ? { hearthGroupId: gid } : { calendarId: event.calendarId, eventId: event.id };
      const hide = (on: boolean) => {
        const update = (prev: Set<string>, key: string) => {
          const next = new Set(prev);
          if (on) next.add(key);
          else next.delete(key);
          return next;
        };
        if (gid) setPendingGroups((prev) => update(prev, gid));
        else setPendingIds((prev) => update(prev, event.id));
      };

      hide(true);
      setOverlays((prev) =>
        prev.filter((o) => (gid ? o.event.hearthGroupId !== gid : o.event.id !== event.id)),
      );
      fetch("/api/calendar/events", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
        .then((res) => {
          if (!res.ok) hide(false); // the delete didn't take: show it again
        })
        .catch(() => hide(false))
        .finally(() => void refetch());
    },
    [refetch],
  );

  const members = data?.members ?? [];
  const configured = data?.configured ?? false;
  return {
    state,
    configured,
    members,
    events,
    canAdd: configured && members.length > 0,
    created,
    edited,
    remove,
  };
}
