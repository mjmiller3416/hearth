"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ViewFrame } from "@/components/layout/ViewFrame";
import { useUpstream } from "@/hooks/useUpstream";
import { useIdleReset } from "@/hooks/useIdleReset";
import type { ChoresPayload, KidChore } from "@/lib/tada/types";
import { KidColumn, type RenderChore } from "./KidColumn";

// The Chores view, assembled (Phase 2, spec §4.3, D5) — the kids' checklist. One
// column per kid, showing today's chores with a large tap target. The asymmetry
// with Clean is intentional: kids have a tracking problem, not a paralysis one,
// so their surface IS a list they can check off (D5). No streaks, badges, or
// stars — Tada! owns reward state (checklist #18).
//
// Completion is optimistic: a tapped row settles into done immediately, then the
// write goes to Tada! attributed to that kid (source="hearth"). On failure the
// row reverts with an inline message — never a global error (checklist #13). A
// just-completed row offers a brief Undo (Q5).

const HEADERS = { "content-type": "application/json" } as const;
const DWELL_MS = 4500; // how long a just-completed row keeps its Undo.

interface Override {
  done: boolean;
  completionId: string | null;
}

export function ChoresView() {
  const [mounted, setMounted] = useState(false);
  // Optimistic per-chore state, layered over the poll until it agrees.
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [undoWindow, setUndoWindow] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const dwellTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const timers = dwellTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const fetcher = useCallback(async (): Promise<ChoresPayload> => {
    const res = await fetch("/api/tasks/kids", { cache: "no-store" });
    if (!res.ok) throw new Error(`kids ${res.status}`);
    return res.json();
  }, []);

  const { data, isStale, lastUpdated, refetch } = useUpstream<ChoresPayload>(fetcher, {
    intervalMs: 60_000,
    enabled: mounted,
  });

  // Retire an optimistic override once the poll's base state matches it — but
  // NOT while the row is still in its Undo window. The post-complete refetch
  // confirms done=true almost immediately; retiring then would drop the override
  // that holds the completionId, disabling Undo before the window closes. Keeping
  // it until the window clears (this effect re-runs when undoWindow changes) keeps
  // Undo live for the full window, then retires the now-stale override.
  useEffect(() => {
    if (overrides.size === 0) return;
    const baseDone = new Map<string, boolean>();
    for (const col of data?.kids ?? []) {
      for (const c of col.chores) baseDone.set(c.id, c.done);
    }
    let changed = false;
    const next = new Map(overrides);
    for (const [id, ov] of overrides) {
      if (undoWindow.has(id)) continue;
      if (baseDone.get(id) === ov.done) {
        next.delete(id);
        changed = true;
      }
    }
    if (changed) setOverrides(next);
  }, [data, overrides, undoWindow]);

  // Idle reset: reset scroll and clear transient state (checklist #17).
  useIdleReset(
    useCallback(() => {
      scrollRef.current
        ?.querySelectorAll("ul")
        .forEach((ul) => ul.scrollTo({ top: 0 }));
      setUndoWindow(new Set());
      setErrors(new Map());
    }, []),
    { enabled: mounted },
  );

  const clearFromWindow = useCallback((choreId: string) => {
    setUndoWindow((prev) => {
      if (!prev.has(choreId)) return prev;
      const next = new Set(prev);
      next.delete(choreId);
      return next;
    });
  }, []);

  const completeChore = useCallback(
    async (kidId: string, chore: KidChore) => {
      setErrors((prev) => {
        const next = new Map(prev);
        next.delete(chore.id);
        return next;
      });
      setOverrides((prev) =>
        new Map(prev).set(chore.id, { done: true, completionId: null }),
      );
      setUndoWindow((prev) => new Set(prev).add(chore.id));

      try {
        const res = await fetch("/api/tasks/complete", {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify({ taskId: chore.id, memberId: kidId }),
        });
        if (!res.ok) throw new Error(`complete ${res.status}`);
        const { completionId } = (await res.json()) as { completionId: string };
        setOverrides((prev) =>
          new Map(prev).set(chore.id, { done: true, completionId }),
        );
        refetch();
        const timer = setTimeout(() => clearFromWindow(chore.id), DWELL_MS);
        dwellTimers.current.set(chore.id, timer);
      } catch {
        // Revert this row only; the rest of the screen is untouched (checklist #13).
        setOverrides((prev) => {
          const next = new Map(prev);
          next.delete(chore.id);
          return next;
        });
        clearFromWindow(chore.id);
        setErrors((prev) =>
          new Map(prev).set(chore.id, "Didn't save — tap to try again."),
        );
      }
    },
    [refetch, clearFromWindow],
  );

  const undoChore = useCallback(
    async (kidId: string, chore: KidChore) => {
      const completionId = overrides.get(chore.id)?.completionId;
      if (!completionId) return;
      const timer = dwellTimers.current.get(chore.id);
      if (timer) {
        clearTimeout(timer);
        dwellTimers.current.delete(chore.id);
      }
      clearFromWindow(chore.id);
      // Optimistically return the row to outstanding until the poll agrees.
      setOverrides((prev) =>
        new Map(prev).set(chore.id, { done: false, completionId: null }),
      );
      try {
        await fetch("/api/tasks/undo", {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify({ completionId, memberId: kidId }),
        });
      } catch {
        // Best effort — the poll reconciles whatever actually happened.
      }
      refetch();
    },
    [overrides, refetch, clearFromWindow],
  );

  // Merge base chores with optimistic overrides, outstanding first.
  const columns = useMemo(() => {
    return (data?.kids ?? []).map((col) => {
      const rendered: RenderChore[] = col.chores.map((chore) => {
        const ov = overrides.get(chore.id);
        const done = ov?.done ?? chore.done;
        return {
          chore,
          done,
          showUndo: done && undoWindow.has(chore.id),
          canUndo: (ov?.completionId ?? null) !== null,
          error: errors.get(chore.id) ?? null,
        };
      });
      // Outstanding rows first, completed after; stable within each group.
      const outstanding = rendered.filter((r) => !r.done);
      const complete = rendered.filter((r) => r.done);
      return { kid: col.kid, chores: [...outstanding, ...complete] };
    });
  }, [data, overrides, undoWindow, errors]);

  if (!mounted) {
    return <ViewFrame title="Chores">{null}</ViewFrame>;
  }

  const configured = data?.configured ?? false;

  return (
    <ViewFrame title="Chores" isStale={isStale} lastUpdated={lastUpdated}>
      {!configured ? (
        <NotConnected />
      ) : columns.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-body text-ink-faint">No kids set up yet.</p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex h-full gap-6">
          {columns.map((col) => (
            <KidColumn
              key={col.kid.id}
              kid={col.kid}
              chores={col.chores}
              onComplete={(chore) => completeChore(col.kid.id, chore)}
              onUndo={(chore) => undoChore(col.kid.id, chore)}
            />
          ))}
        </div>
      )}
    </ViewFrame>
  );
}

function NotConnected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-title text-ink-soft">Not connected to Tada! yet.</p>
      <p className="max-w-xl text-body text-ink-faint">
        The kids&rsquo; chores appear here once Tada! is set up.
      </p>
    </div>
  );
}
