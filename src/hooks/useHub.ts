"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUpstream, type UpstreamState } from "@/hooks/useUpstream";
import { useMounted } from "@/lib/prefs";
import type {
  ChoresPayload,
  CompleteResult,
  Completion,
  DoneTodayPayload,
  KidChore,
  NextTaskPayload,
  Room,
  RoomsPayload,
  SessionTask,
  TadaMember,
} from "@/lib/tada/types";
import type {
  AddShoppingItemResult,
  MealPlanPayload,
  PlannedMeal,
  ShoppingItem,
  ShoppingListPayload,
} from "@/lib/spoon/types";
import type { SchedulePayload } from "@/lib/tandem/types";
import type { PhotosPayload } from "@/lib/photos/types";
import type { WeatherPayload } from "@/lib/weather/types";

// One hook per household source. Each owns its polling (on the stale-data
// contract in useUpstream) and its optimistic writes, so Today's cards and the
// full pages run the SAME logic and can't drift: a chore checked on Today and a
// chore checked on the Chores page are one code path to one route.
//
// Every write is optimistic and reverts on failure with a message for that row
// only; nothing here ever raises a global error (spec §6.2).

const JSON_HEADERS = { "content-type": "application/json" } as const;
/** How long a just-completed row keeps its Undo. */
const UNDO_WINDOW_MS = 4500;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json() as Promise<T>;
}

/** Refetch when `key` changes (a new range, week or room), but not on mount. */
export function useRefetchOn(key: string, refetch: () => Promise<void>, enabled: boolean): void {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (last.current !== null && last.current !== key) void refetch();
    last.current = key;
  }, [key, refetch, enabled]);
}

// ── School week (Tandem) ────────────────────────────────────────────────────

/** The kids' Monday–Friday week containing `monday`. */
export function useSchoolWeek(monday: string): UpstreamState<SchedulePayload> {
  const mounted = useMounted();
  const fetcher = useCallback(
    () => getJson<SchedulePayload>(`/api/schedule?week=${monday}`),
    [monday],
  );
  const state = useUpstream<SchedulePayload>(fetcher, { enabled: mounted });
  useRefetchOn(monday, state.refetch, mounted);
  return state;
}

// ── Kids' chores (Tada!) ────────────────────────────────────────────────────

interface ChoreOverride {
  done: boolean;
  completionId: string | null;
}

/** One chore as a row should draw it. */
export interface ChoreRowState {
  chore: KidChore;
  done: boolean;
  /** Just completed here: offer Undo for a few seconds. */
  showUndo: boolean;
  canUndo: boolean;
  error: string | null;
}

export interface KidChoreColumn {
  kid: TadaMember;
  /** Outstanding first, then done; stable within each group. */
  chores: ChoreRowState[];
}

export interface KidsChores {
  state: UpstreamState<ChoresPayload>;
  configured: boolean;
  columns: KidChoreColumn[];
  complete: (kidId: string, chore: KidChore) => void;
  undo: (kidId: string, chore: KidChore) => void;
}

/**
 * Today's chores per kid, with tap-to-complete and a brief Undo (spec D5, Q5).
 * Completion is optimistic: the row settles into done at once, the write goes
 * to Tada! attributed to that kid, and a failure puts the row back with a note.
 */
export function useKidsChores(): KidsChores {
  const mounted = useMounted();
  const [overrides, setOverrides] = useState<Map<string, ChoreOverride>>(new Map());
  const [undoWindow, setUndoWindow] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const baseDone = useRef<Map<string, boolean>>(new Map());
  const windowRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((t) => clearTimeout(t));
  }, []);

  // Drop an optimistic override once the poll agrees with it, but never while
  // the row is still in its Undo window (the override holds the completionId).
  const prune = useCallback(() => {
    setOverrides((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [key, ov] of prev) {
        if (windowRef.current.has(key)) continue;
        if (baseDone.current.get(key) === ov.done) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const fetcher = useCallback(() => getJson<ChoresPayload>("/api/tasks/kids"), []);
  const state = useUpstream<ChoresPayload>(fetcher, {
    enabled: mounted,
    onData: (payload) => {
      const map = new Map<string, boolean>();
      for (const col of payload.kids) {
        for (const c of col.chores) map.set(`${col.kid.id}:${c.id}`, c.done);
      }
      baseDone.current = map;
      prune();
    },
  });
  const { refetch } = state;

  const closeWindow = useCallback(
    (key: string) => {
      windowRef.current.delete(key);
      setUndoWindow(new Set(windowRef.current));
      prune();
    },
    [prune],
  );

  const complete = useCallback(
    async (kidId: string, chore: KidChore) => {
      const key = `${kidId}:${chore.id}`;
      setErrors((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      setOverrides((prev) => new Map(prev).set(key, { done: true, completionId: null }));
      windowRef.current.add(key);
      setUndoWindow(new Set(windowRef.current));

      try {
        const res = await fetch("/api/tasks/complete", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ taskId: chore.id, memberId: kidId }),
        });
        if (!res.ok) throw new Error(`complete ${res.status}`);
        const { completionId } = (await res.json()) as CompleteResult;
        setOverrides((prev) => new Map(prev).set(key, { done: true, completionId }));
        void refetch();
        timers.current.set(key, setTimeout(() => closeWindow(key), UNDO_WINDOW_MS));
      } catch {
        // Revert this row only; the rest of the screen is untouched.
        setOverrides((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        closeWindow(key);
        setErrors((prev) => new Map(prev).set(key, "Didn't save. Tap to try again."));
      }
    },
    [refetch, closeWindow],
  );

  const undo = useCallback(
    async (kidId: string, chore: KidChore) => {
      const key = `${kidId}:${chore.id}`;
      const completionId = overrides.get(key)?.completionId;
      if (!completionId) return;
      const timer = timers.current.get(key);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(key);
      }
      // Optimistically return the row to outstanding until the poll agrees.
      setOverrides((prev) => new Map(prev).set(key, { done: false, completionId: null }));
      closeWindow(key);
      try {
        await fetch("/api/tasks/undo", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ completionId, memberId: kidId }),
        });
      } catch {
        // Best effort: the poll reconciles whatever actually happened.
      }
      void refetch();
    },
    [overrides, refetch, closeWindow],
  );

  const columns = useMemo<KidChoreColumn[]>(() => {
    return (state.data?.kids ?? []).map((col) => {
      const rows = col.chores.map((chore): ChoreRowState => {
        const key = `${col.kid.id}:${chore.id}`;
        const ov = overrides.get(key);
        const done = ov?.done ?? chore.done;
        return {
          chore,
          done,
          showUndo: done && undoWindow.has(key),
          canUndo: (ov?.completionId ?? null) !== null,
          error: errors.get(key) ?? null,
        };
      });
      return {
        kid: col.kid,
        chores: [...rows.filter((r) => !r.done), ...rows.filter((r) => r.done)],
      };
    });
  }, [state.data, overrides, undoWindow, errors]);

  return {
    state,
    configured: state.data?.configured ?? false,
    columns,
    complete: (kidId, chore) => void complete(kidId, chore),
    undo: (kidId, chore) => void undo(kidId, chore),
  };
}

// ── Cleaning session (Tada!) ────────────────────────────────────────────────

interface CleanData {
  rooms: Room[];
  adult: TadaMember | null;
  configured: boolean;
  task: SessionTask | null;
  completions: Completion[];
}

export interface CleanSession {
  state: UpstreamState<CleanData>;
  configured: boolean;
  rooms: Room[];
  /** The adult whose session this is (the acting member for every completion). */
  adult: TadaMember | null;
  /** null = whole house. */
  roomId: string | null;
  setRoomId: (roomId: string | null) => void;
  roomName: string | null;
  /** The ONE task Tada! picked, or null when caught up. Never a queue (D4). */
  task: SessionTask | null;
  /** The task just completed here, lingering with its Undo. */
  justDone: { task: SessionTask; canUndo: boolean } | null;
  completions: Completion[];
  error: string | null;
  complete: () => void;
  undo: () => void;
  /** Back to whole-house, nothing lingering. */
  reset: () => void;
}

/**
 * Maryann's guided cleaning session (spec D4): one task at a time, optionally
 * scoped to a room, plus what she has finished today. Tada! picks the task;
 * this hook only renders the pick and writes the completion. There is no queue,
 * count or "up next" anywhere in this shape, on purpose.
 */
export function useCleanSession(): CleanSession {
  const mounted = useMounted();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<{ task: SessionTask; completionId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (dwell.current) clearTimeout(dwell.current);
    },
    [],
  );

  const fetcher = useCallback(async (): Promise<CleanData> => {
    const roomQ = roomId ? `?room=${encodeURIComponent(roomId)}` : "";
    const [rooms, next, done] = await Promise.all([
      getJson<RoomsPayload>("/api/tasks/rooms"),
      getJson<NextTaskPayload>(`/api/tasks/next${roomQ}`),
      getJson<DoneTodayPayload>("/api/tasks/done-today"),
    ]);
    return {
      rooms: rooms.rooms,
      adult: rooms.adult,
      configured: rooms.configured,
      task: next.task,
      completions: done.completions,
    };
  }, [roomId]);

  const state = useUpstream<CleanData>(fetcher, { enabled: mounted });
  const { refetch, data } = state;
  // Re-scope at once on a room change rather than waiting for the next poll.
  useRefetchOn(roomId ?? "", refetch, mounted);

  const adult = data?.adult ?? null;
  const task = data?.task ?? null;

  const complete = useCallback(async () => {
    if (!task || !adult) return;
    setError(null);
    setCompleting({ task, completionId: null });
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ taskId: task.id, memberId: adult.id }),
      });
      if (!res.ok) throw new Error(`complete ${res.status}`);
      const { completionId } = (await res.json()) as CompleteResult;
      setCompleting({ task, completionId });
      void refetch(); // advance the session and land the completion in done-today
      dwell.current = setTimeout(() => setCompleting(null), UNDO_WINDOW_MS);
    } catch {
      setCompleting(null);
      setError("Couldn't save that just now. Tap Done to try again.");
    }
  }, [task, adult, refetch]);

  const undo = useCallback(async () => {
    const c = completing;
    if (!c?.completionId || !adult) return;
    if (dwell.current) clearTimeout(dwell.current);
    setCompleting(null);
    try {
      await fetch("/api/tasks/undo", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ completionId: c.completionId, memberId: adult.id }),
      });
    } catch {
      // Best effort: the poll reconciles whatever actually happened.
    }
    void refetch();
  }, [completing, adult, refetch]);

  const reset = useCallback(() => {
    setRoomId(null);
    setCompleting(null);
    setError(null);
  }, []);

  const rooms = data?.rooms ?? [];
  return {
    state,
    configured: data?.configured ?? false,
    rooms,
    adult,
    roomId,
    setRoomId,
    roomName: rooms.find((r) => r.id === roomId)?.name ?? null,
    task,
    justDone: completing
      ? { task: completing.task, canUndo: completing.completionId !== null }
      : null,
    completions: data?.completions ?? [],
    error,
    complete: () => void complete(),
    undo: () => void undo(),
    reset,
  };
}

// ── Weather (Open-Meteo, for the town chosen in Settings) ───────────────────

/** How often a screen asks for the forecast (the server keeps it ten minutes). */
const WEATHER_REFRESH_MS = 10 * 60_000;

/** The forecast. `data.configured` is false until a town is chosen. */
export function useWeather(): UpstreamState<WeatherPayload> {
  const mounted = useMounted();
  const fetcher = useCallback(() => getJson<WeatherPayload>("/api/weather"), []);
  return useUpstream<WeatherPayload>(fetcher, { enabled: mounted, intervalMs: WEATHER_REFRESH_MS });
}

// ── Family photos (kept by Hearth itself) ───────────────────────────────────

/** The photos Home cycles through. The list changes rarely, so it polls slowly. */
export function usePhotos(): UpstreamState<PhotosPayload> {
  const mounted = useMounted();
  const fetcher = useCallback(() => getJson<PhotosPayload>("/api/photos"), []);
  return useUpstream<PhotosPayload>(fetcher, { enabled: mounted, intervalMs: 10 * 60_000 });
}

// ── Meal plan (Enchanted Spoon) ─────────────────────────────────────────────

export interface MealPlan {
  state: UpstreamState<MealPlanPayload>;
  configured: boolean;
  /** Every entry on the plan, cooked or not. */
  all: PlannedMeal[];
  /** What still shows: not cooked, and not just marked cooked here. */
  meals: PlannedMeal[];
  error: string | null;
  /** Mark one plan entry cooked. No undo: restoring lives in Enchanted Spoon. */
  cook: (meal: PlannedMeal) => void;
  clearError: () => void;
}

export function useMealPlan(): MealPlan {
  const mounted = useMounted();
  // Entries dropped by a "Mark cooked" tap, until the refetch reports them cooked.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(() => getJson<MealPlanPayload>("/api/meals"), []);
  const state = useUpstream<MealPlanPayload>(fetcher, { enabled: mounted });
  const { refetch } = state;

  const unhide = useCallback((entryId: string) => {
    setHidden((prev) => {
      if (!prev.has(entryId)) return prev;
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });
  }, []);

  const cook = useCallback(
    async (meal: PlannedMeal) => {
      setError(null);
      setHidden((prev) => new Set(prev).add(meal.entryId)); // vanish at once
      try {
        const res = await fetch("/api/meals/complete", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ entryId: meal.entryId }),
        });
        if (!res.ok) throw new Error(`complete ${res.status}`);
        await refetch();
      } catch {
        setError(`Couldn't mark ${meal.name} cooked just now. Try again.`);
      } finally {
        unhide(meal.entryId);
      }
    },
    [refetch, unhide],
  );

  const all = useMemo(() => state.data?.meals ?? [], [state.data]);
  const meals = useMemo(
    () => all.filter((m) => !m.isCompleted && !hidden.has(m.entryId)),
    [all, hidden],
  );

  return {
    state,
    configured: state.data?.configured ?? false,
    all,
    meals,
    error,
    cook: (meal) => void cook(meal),
    clearError: () => setError(null),
  };
}

// ── Shopping list (Enchanted Spoon) ─────────────────────────────────────────

/** The line shown after an add. */
export interface AddNotice {
  tone: "ok" | "info" | "error";
  text: string;
}

export interface ShoppingList {
  state: UpstreamState<ShoppingListPayload>;
  configured: boolean;
  /** Still-needed items only (checked-off ones stay in Enchanted Spoon). */
  needed: ShoppingItem[];
  adding: boolean;
  notice: AddNotice | null;
  /** Lower-cased name of the item just added, for a highlight. */
  fresh: string | null;
  /** Add one item by name. Resolves true when it was sent. */
  add: (name: string) => Promise<boolean>;
  clearNotice: () => void;
}

function noticeFor(result: AddShoppingItemResult): AddNotice {
  switch (result.status) {
    case "already_listed":
      return { tone: "info", text: `${result.name} is already on the list.` };
    case "reactivated":
      return { tone: "ok", text: `${result.name} is back on the list.` };
    default:
      return { tone: "ok", text: `Added ${result.name}.` };
  }
}

export function useShoppingList(): ShoppingList {
  const mounted = useMounted();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<AddNotice | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  const fetcher = useCallback(() => getJson<ShoppingListPayload>("/api/shopping"), []);
  const state = useUpstream<ShoppingListPayload>(fetcher, { enabled: mounted });
  const { refetch } = state;

  const add = useCallback(
    async (raw: string): Promise<boolean> => {
      const name = raw.trim();
      if (!name || adding) return false;
      setAdding(true);
      setNotice(null);
      try {
        const res = await fetch("/api/shopping/items", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error(`add ${res.status}`);
        const result = (await res.json()) as AddShoppingItemResult;
        setNotice(noticeFor(result));
        setFresh(result.name.toLowerCase());
        await refetch();
        return true;
      } catch {
        // Keep what was typed so a retry is one tap.
        setNotice({ tone: "error", text: "Couldn't add that just now. Try again." });
        return false;
      } finally {
        setAdding(false);
      }
    },
    [adding, refetch],
  );

  const needed = useMemo(
    () => (state.data?.items ?? []).filter((i) => !i.have),
    [state.data],
  );

  return {
    state,
    configured: state.data?.configured ?? false,
    needed,
    adding,
    notice,
    fresh,
    add,
    clearNotice: useCallback(() => {
      setNotice(null);
      setFresh(null);
    }, []),
  };
}
