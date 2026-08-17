import type {
  Room,
  SessionTask,
  Completion,
  KidChore,
} from "./types";

// The Tada! HTTP client (Phase 2). Server-side only: the device token is read
// here and attached as a bearer header, and never reaches the browser (spec
// §3.2). Mirrors the Phase 1 Google client's shape — thin HTTP + normalization,
// errors thrown for the route to turn into a 502 so the stale-data contract
// keeps the last good render (§6.2).
//
// ── TARGET CONTRACT, NOT YET LIVE ───────────────────────────────────────────
// This client calls the device-scoped Tada! endpoints the spec's manual setup
// assumes (§5.2–5.3, checklist #2–7). As of this build the Tada! backend does
// NOT expose them: it authenticates by user session cookie (PIN login) with no
// inbound device token, its completion `source` is a closed enum that rejects
// "hearth", and it has no acting-member override or single-next-by-room /
// per-kid-chores endpoint. Those are the upstream additions tracked in
// docs/tada-integration-requirements.md.
//
// Because of that, the route handlers run MOCK-FIRST (HEARTH_TASKS_MOCK=1 for
// local dev) and otherwise report `configured: false` until the endpoints land —
// this client is never invoked against the live wall until Tada! ships them, at
// which point wiring is just setting TADA_API_URL + TADA_DEVICE_TOKEN. The shape
// below is the exact request/response contract Tada! must implement.
//
// All routes are under `${TADA_API_URL}/api/hearth`. Auth: Bearer device token.

const SOURCE = "hearth"; // stamped on every completion (spec §5.3).

function baseUrl(): string {
  const url = process.env.TADA_API_URL?.replace(/\/+$/, "");
  if (!url) throw new Error("TADA_API_URL is not set");
  return `${url}/api/hearth`;
}

function authHeaders(): HeadersInit {
  const token = process.env.TADA_DEVICE_TOKEN;
  if (!token) throw new Error("TADA_DEVICE_TOKEN is not set");
  return { authorization: `Bearer ${token}` };
}

async function tadaGet<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Tada! GET ${path} failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as T;
}

async function tadaPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Tada! POST ${path} failed (${res.status}): ${detail}`);
  }
  // Undo returns 204; complete returns JSON.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** GET /rooms → the rooms a Clean session can be scoped to (checklist #4). */
export async function getRooms(): Promise<Room[]> {
  const data = await tadaGet<{ rooms: Room[] }>("/rooms");
  return (data.rooms ?? []).map((r) => ({ id: String(r.id), name: r.name }));
}

/**
 * GET /next?room=&member= → the single highest-decay task for the session
 * (checklist #3). Tada! ranks; Hearth strips everything but id/name/room. Null
 * when nothing is due for the scope — a rest state, not an error (checklist #10).
 */
export async function getNextTask(
  roomId: string | null,
  memberId: string,
): Promise<SessionTask | null> {
  const params = new URLSearchParams({ member: memberId });
  if (roomId) params.set("room", roomId);
  const data = await tadaGet<{ task: SessionTask | null }>(
    `/next?${params.toString()}`,
  );
  if (!data.task) return null;
  return {
    id: String(data.task.id),
    name: data.task.name,
    room: data.task.room ?? null,
  };
}

/** GET /done-today?member= → the adult's completions today (checklist #5). */
export async function getDoneToday(memberId: string): Promise<Completion[]> {
  const data = await tadaGet<{ completions: Completion[] }>(
    `/done-today?member=${encodeURIComponent(memberId)}`,
  );
  return (data.completions ?? []).map((c) => ({
    completionId: String(c.completionId),
    taskName: c.taskName,
    room: c.room ?? null,
    completedAt: c.completedAt,
  }));
}

/**
 * GET /kids → outstanding + completed chores per kid for today (checklist #6),
 * as a map keyed by Tada! member id. The route pairs these with the configured
 * kids so a kid with no chores still gets a column.
 */
export async function getKidsChores(): Promise<Map<string, KidChore[]>> {
  const data = await tadaGet<{
    kids: Array<{ memberId: string; chores: KidChore[] }>;
  }>("/kids");
  const byId = new Map<string, KidChore[]>();
  for (const entry of data.kids ?? []) {
    byId.set(
      String(entry.memberId),
      (entry.chores ?? []).map((c) => ({
        id: String(c.id),
        name: c.name,
        done: Boolean(c.done),
        completionId:
          c.completionId != null ? String(c.completionId) : undefined,
      })),
    );
  }
  return byId;
}

/**
 * POST /complete → mark a task complete as `memberId`, stamped source="hearth"
 * (spec §5.3, checklist #7). Returns the completion id so it can be undone.
 */
export async function completeTask(
  taskId: string,
  memberId: string,
): Promise<string> {
  const data = await tadaPost<{ completionId: string }>("/complete", {
    taskId,
    memberId,
    source: SOURCE,
  });
  return String(data.completionId);
}

/** POST /undo → reverse a completion within the day (Q5, checklist #14). */
export async function undoCompletion(
  completionId: string,
  memberId: string,
): Promise<void> {
  await tadaPost<void>("/undo", { completionId, memberId });
}
