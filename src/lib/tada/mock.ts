import type { Room, SessionTask, Completion, KidChore, TadaMember } from "./types";

// Synthetic Tada! data for LOCAL development only (Phase 2). The Clean session,
// its cross-fade to the next task, done-today, and the Chores columns are
// impossible to verify without task data, and the real Tada! device endpoints
// don't exist yet (see client.ts / docs/tada-integration-requirements.md). This
// lets the whole flow — including completion writes and undo — be exercised
// end-to-end against realistic shapes.
//
// Unlike the calendar mock, this one holds MUTABLE in-process state: completing
// a task must advance the session and land in done-today, and undo must reverse
// it, for the flow to feel real. That is NOT a database and does not violate D1
// — it lives only in the dev server's memory, resets on restart, and can never
// run in production.
//
// SAFETY: enabled only when HEARTH_TASKS_MOCK=1 AND NODE_ENV !== production, so
// no synthetic tasks can ever reach the real wall.

export function isTasksMockEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" && process.env.HEARTH_TASKS_MOCK === "1"
  );
}

const ROOMS: Room[] = [
  { id: "kitchen", name: "Kitchen" },
  { id: "bathroom", name: "Bathroom" },
  { id: "living", name: "Living Room" },
  { id: "bedrooms", name: "Bedrooms" },
  { id: "laundry", name: "Laundry" },
];

// The session pool, ordered as if by decay (first = surfaced next). Tada! would
// compute this order; the mock just fixes it so the wall is deterministic.
interface PoolTask {
  id: string;
  name: string;
  roomId: string;
}
const SESSION_POOL: PoolTask[] = [
  { id: "t-1", name: "Wipe down the counters", roomId: "kitchen" },
  { id: "t-2", name: "Scrub the bathroom sink", roomId: "bathroom" },
  { id: "t-3", name: "Vacuum the living room rug", roomId: "living" },
  { id: "t-4", name: "Change the sheets", roomId: "bedrooms" },
  { id: "t-5", name: "Fold the laundry", roomId: "laundry" },
  { id: "t-6", name: "Sweep the kitchen floor", roomId: "kitchen" },
  { id: "t-7", name: "Clean the mirror", roomId: "bathroom" },
  { id: "t-8", name: "Dust the shelves", roomId: "living" },
  { id: "t-9", name: "Empty the dishwasher", roomId: "kitchen" },
  { id: "t-10", name: "Take out the recycling", roomId: "kitchen" },
];

const roomName = (roomId: string): string | null =>
  ROOMS.find((r) => r.id === roomId)?.name ?? null;

// A fixed clock read at module load — the seeded "today" times are anchored to
// it. Declared before the state that uses it (offsetIso runs during seeding).
const MODULE_NOW = Date.now();

function offsetIso(minutesAgo: number): string {
  // The exact minute doesn't matter for a dev mock, only that it's "today".
  return new Date(MODULE_NOW + minutesAgo * 60_000).toISOString();
}

// ── Mutable in-process state (dev only) ─────────────────────────────────────
const completedSessionIds = new Set<string>();
// Newest first — the done-today order the view renders (checklist #11).
let adultCompletions: Completion[] = [
  // A couple already landed today (as if from a phone) so the celebration isn't
  // empty on first load, and the "no denominator" rule is visible with content.
  {
    completionId: "seed-1",
    taskName: "Water the plants",
    room: null,
    completedAt: offsetIso(-95),
  },
  {
    completionId: "seed-2",
    taskName: "Tidy the entryway",
    room: "Living Room",
    completedAt: offsetIso(-40),
  },
];

// Per-kid chore lists, seeded lazily against the configured kid ids.
const kidChores = new Map<string, KidChore[]>();
function seedKid(kidId: string, index: number): KidChore[] {
  const base: Array<Omit<KidChore, "id">> = [
    { name: "Make your bed", done: index === 0 },
    { name: "Feed the dog", done: false },
    { name: "Put away toys", done: false },
    { name: "Homework in backpack", done: false },
    { name: "Clear your plate", done: index === 1 },
  ];
  return base.map((c, i) => ({
    id: `c-${kidId}-${i}`,
    name: c.name,
    done: c.done,
    completionId: c.done ? `seed-${kidId}-${i}` : undefined,
  }));
}

let completionSeq = 100;
// completionId → how to reverse it (checklist #14 undo).
const undoIndex = new Map<
  string,
  { kind: "session"; taskId: string } | { kind: "chore"; kidId: string; choreId: string }
>();

// ── Read surface ────────────────────────────────────────────────────────────
export function mockRooms(): Room[] {
  return ROOMS;
}

export function mockNextTask(roomId: string | null): SessionTask | null {
  const next = SESSION_POOL.find(
    (t) => !completedSessionIds.has(t.id) && (!roomId || t.roomId === roomId),
  );
  if (!next) return null; // caught up for this scope → rest state
  return { id: next.id, name: next.name, room: roomName(next.roomId) };
}

export function mockDoneToday(): Completion[] {
  return adultCompletions;
}

export function mockKids(kids: TadaMember[]): Map<string, KidChore[]> {
  kids.forEach((kid, i) => {
    if (!kidChores.has(kid.id)) kidChores.set(kid.id, seedKid(kid.id, i));
  });
  return kidChores;
}

// ── Write surface ───────────────────────────────────────────────────────────
/** Complete a session task or a kid chore; returns the completion id. */
export function mockComplete(taskId: string): string {
  const completionId = `mock-c-${completionSeq++}`;

  const poolTask = SESSION_POOL.find((t) => t.id === taskId);
  if (poolTask) {
    completedSessionIds.add(poolTask.id);
    adultCompletions = [
      {
        completionId,
        taskName: poolTask.name,
        room: roomName(poolTask.roomId),
        completedAt: new Date().toISOString(),
      },
      ...adultCompletions,
    ];
    undoIndex.set(completionId, { kind: "session", taskId: poolTask.id });
    return completionId;
  }

  // Otherwise it's a kid chore: find and mark it done.
  for (const [kidId, chores] of kidChores) {
    const chore = chores.find((c) => c.id === taskId);
    if (chore) {
      chore.done = true;
      chore.completionId = completionId;
      undoIndex.set(completionId, { kind: "chore", kidId, choreId: chore.id });
      return completionId;
    }
  }

  // Unknown id (e.g. a chore not yet seeded): still return an id so the optimistic
  // client isn't reverted. Nothing to mutate.
  return completionId;
}

/** Reverse a completion made from the wall (Q5). */
export function mockUndo(completionId: string): void {
  const entry = undoIndex.get(completionId);
  if (!entry) {
    // Undo of a seeded completion: just drop it from whichever surface holds it.
    adultCompletions = adultCompletions.filter(
      (c) => c.completionId !== completionId,
    );
    for (const chores of kidChores.values()) {
      const chore = chores.find((c) => c.completionId === completionId);
      if (chore) {
        chore.done = false;
        chore.completionId = undefined;
      }
    }
    return;
  }
  if (entry.kind === "session") {
    completedSessionIds.delete(entry.taskId);
    adultCompletions = adultCompletions.filter(
      (c) => c.completionId !== completionId,
    );
  } else {
    const chore = kidChores.get(entry.kidId)?.find((c) => c.id === entry.choreId);
    if (chore) {
      chore.done = false;
      chore.completionId = undefined;
    }
  }
  undoIndex.delete(completionId);
}
