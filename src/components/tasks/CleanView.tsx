"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, RotateCcw, Check } from "lucide-react";
import { ViewFrame } from "@/components/layout/ViewFrame";
import { useUpstream } from "@/hooks/useUpstream";
import { useIdleReset } from "@/hooks/useIdleReset";
import { useTimeZone } from "@/components/common/TimeZone";
import { useTextOn } from "@/components/common/ColorProvider";
import { colorVar } from "@/lib/calendar/palette";
import type {
  Room,
  SessionTask as SessionTaskT,
  Completion,
  TadaMember,
  RoomsPayload,
  NextTaskPayload,
  DoneTodayPayload,
  CompleteResult,
} from "@/lib/tada/types";
import { RoomPicker } from "./RoomPicker";
import { SessionTask } from "./SessionTask";
import { DoneToday } from "./DoneToday";

// The Clean view, assembled (Phase 2, spec §4.2, D4) — Maryann's guided session.
// Two parts: the session (one task at a time, room-scoped, with a big complete
// target) and done-today (the celebration). Tada! picks the task and computes
// decay; Hearth only renders the result and writes the completion. There is no
// queue, no remaining count, no "up next" — that is the whole point (D4).
//
// Completing writes to Tada! attributed to Maryann (source="hearth"), settles the
// task into a brief done state with an Undo (Q5), then cross-fades in the next
// task without waiting for the 60s poll (checklist #9, #16). An empty session is
// success, shown as a calm rest state, never a reproach (checklist #10).

const HEADERS = { "content-type": "application/json" } as const;
// The Undo window: how long the just-completed task lingers before the next
// fades in. Long enough to catch a mis-tap, short enough to keep moving.
const DWELL_MS = 4500;

interface CleanData {
  rooms: Room[];
  adult: TadaMember | null;
  configured: boolean;
  task: SessionTaskT | null;
  completions: Completion[];
}

interface Completing {
  task: SessionTaskT;
  completionId: string | null; // null until the POST resolves
}

export function CleanView() {
  const timeZone = useTimeZone();
  const textOn = useTextOn();
  const [mounted, setMounted] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null); // null = whole house
  const [completing, setCompleting] = useState<Completing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => () => {
    if (dwellRef.current) clearTimeout(dwellRef.current);
  }, []);

  const fetcher = useCallback(async (): Promise<CleanData> => {
    const roomQ = roomId ? `?room=${encodeURIComponent(roomId)}` : "";
    const [roomsRes, nextRes, doneRes] = await Promise.all([
      fetch("/api/tasks/rooms", { cache: "no-store" }),
      fetch(`/api/tasks/next${roomQ}`, { cache: "no-store" }),
      fetch("/api/tasks/done-today", { cache: "no-store" }),
    ]);
    if (!roomsRes.ok || !nextRes.ok || !doneRes.ok) {
      throw new Error("tasks fetch failed");
    }
    const rooms = (await roomsRes.json()) as RoomsPayload;
    const next = (await nextRes.json()) as NextTaskPayload;
    const done = (await doneRes.json()) as DoneTodayPayload;
    return {
      rooms: rooms.rooms,
      adult: rooms.adult,
      configured: rooms.configured,
      task: next.task,
      completions: done.completions,
    };
  }, [roomId]);

  const { data, isStale, lastUpdated, refetch } = useUpstream<CleanData>(fetcher, {
    intervalMs: 60_000,
    enabled: mounted,
  });

  // Re-fetch immediately on room change — the session must not wait up to 60s to
  // re-scope (checklist #16). The hook handles the initial load, so skip it once.
  const firstRoom = useRef(true);
  useEffect(() => {
    if (!mounted) return;
    if (firstRoom.current) {
      firstRoom.current = false;
      return;
    }
    refetch();
  }, [roomId, mounted, refetch]);

  // Idle reset: return the session to whole-house scope (checklist #17).
  useIdleReset(
    useCallback(() => {
      setRoomId(null);
      setCompleting(null);
      setError(null);
    }, []),
    { enabled: mounted },
  );

  const adult = data?.adult ?? null;

  const handleComplete = useCallback(async () => {
    const task = data?.task;
    if (!task || !adult) return;
    setError(null);
    setCompleting({ task, completionId: null });
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ taskId: task.id, memberId: adult.id }),
      });
      if (!res.ok) throw new Error(`complete ${res.status}`);
      const { completionId } = (await res.json()) as CompleteResult;
      setCompleting({ task, completionId });
      refetch(); // advance the session + land the completion in done-today
      dwellRef.current = setTimeout(() => setCompleting(null), DWELL_MS);
    } catch {
      // Never a global error (spec §6.2): revert the session, note it inline.
      setCompleting(null);
      setError("Couldn't save that just now — it'll retry.");
    }
  }, [data?.task, adult, refetch]);

  const handleUndo = useCallback(async () => {
    const c = completing;
    if (!c?.completionId || !adult) return;
    if (dwellRef.current) clearTimeout(dwellRef.current);
    setCompleting(null);
    try {
      await fetch("/api/tasks/undo", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ completionId: c.completionId, memberId: adult.id }),
      });
    } catch {
      // Best effort — the poll will reconcile whatever actually happened.
    }
    refetch();
  }, [completing, adult, refetch]);

  // Quiet skeleton until mounted — matches the server render exactly.
  if (!mounted) {
    return <ViewFrame title="Clean">{null}</ViewFrame>;
  }

  const configured = data?.configured ?? false;
  const rooms = data?.rooms ?? [];
  const task = data?.task ?? null;
  const completions = data?.completions ?? [];
  const scopedRoomName = rooms.find((r) => r.id === roomId)?.name ?? null;

  // The session area, keyed so each swap cross-fades in (spec §7).
  const sessionKey = completing
    ? `done-${completing.task.id}`
    : task
      ? `task-${task.id}`
      : `rest-${roomId ?? "all"}`;

  return (
    <ViewFrame
      title="Clean"
      isStale={isStale}
      lastUpdated={lastUpdated}
      actions={adult ? <ActingBadge member={adult} dark={textOn(adult.color) === "dark"} /> : undefined}
      filters={
        configured && rooms.length > 0 ? (
          <RoomPicker rooms={rooms} activeRoomId={roomId} onSelect={setRoomId} />
        ) : undefined
      }
    >
      {!configured ? (
        <NotConnected />
      ) : (
        <div className="flex h-full gap-10">
          <div className="flex min-h-0 flex-1 flex-col">
            <div key={sessionKey} className="min-h-0 flex-1 [animation:hearth-fade-in_400ms_ease-out]">
              {completing ? (
                <SessionDone
                  task={completing.task}
                  canUndo={completing.completionId !== null}
                  onUndo={handleUndo}
                />
              ) : task ? (
                <SessionTask task={task} onComplete={handleComplete} disabled={false} />
              ) : (
                <RestState roomName={scopedRoomName} />
              )}
            </div>
            {error && (
              <p className="shrink-0 pt-2 text-center text-label text-ink-faint" role="status">
                {error}
              </p>
            )}
          </div>

          <div className="w-[26rem] shrink-0 border-l border-hairline pl-10">
            <DoneToday
              completions={completions}
              accentColor={adult?.color ?? null}
              timeZone={timeZone}
            />
          </div>
        </div>
      )}
    </ViewFrame>
  );
}

// The "who's acting" indicator (spec §6.3). For Clean it's fixed to Maryann — her
// session — so it's a static badge rather than a selector.
function ActingBadge({ member, dark }: { member: TadaMember; dark: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <span
        className={`flex size-10 items-center justify-center rounded-full font-display text-[1.35rem] leading-none ${
          dark ? "text-ink" : "text-white"
        }`}
        style={{ backgroundColor: `var(${colorVar(member.color)})` }}
        aria-hidden
      >
        {member.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="text-label font-medium text-ink-soft">{member.name}</span>
    </span>
  );
}

// The just-completed task, settled into a brief done state with an Undo (Q5).
function SessionDone({
  task,
  canUndo,
  onUndo,
}: {
  task: SessionTaskT;
  canUndo: boolean;
  onUndo: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
      <span className="flex size-40 items-center justify-center rounded-full bg-ink text-surface">
        <Check className="size-20" strokeWidth={2.5} aria-hidden />
      </span>
      <div className="flex flex-col items-center gap-2">
        <span className="font-display text-title text-ink">Nice.</span>
        <span className="max-w-2xl text-balance text-body text-ink-soft">{task.name}</span>
      </div>
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="flex items-center gap-2.5 rounded-full px-6 py-3 text-label font-medium text-ink-soft shadow-[inset_0_0_0_1px_var(--color-hairline-strong)] transition-colors active:bg-surface disabled:opacity-40"
      >
        <RotateCcw className="size-5" strokeWidth={2} aria-hidden />
        Undo
      </button>
    </div>
  );
}

// The rest state — an empty session is success, not a reproach (checklist #10).
function RestState({ roomName }: { roomName: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <Sparkles className="size-16 text-ink-faint" strokeWidth={1.5} aria-hidden />
      <p className="font-display text-heading leading-tight text-ink">
        {roomName ? `All caught up in the ${roomName}.` : "All caught up."}
      </p>
    </div>
  );
}

// Calm state when Tada! isn't wired yet (spec §6.2) — never an error.
function NotConnected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-title text-ink-soft">Not connected to Tada! yet.</p>
      <p className="max-w-xl text-body text-ink-faint">
        The cleaning session appears here once Tada! is set up.
      </p>
    </div>
  );
}
