import { fail, noContent, ok, type ActionResult } from "@/lib/action";
import {
  getAdultId,
  getAdultMember,
  getKids,
  hasTadaCredentials,
  isAllowedMember,
} from "@/lib/tada/config";
import {
  completeTask,
  getDoneToday,
  getKidsChores,
  getNextTask,
  getRooms,
  undoCompletion,
} from "@/lib/tada/client";
import {
  isTasksMockEnabled,
  mockComplete,
  mockDoneToday,
  mockKids,
  mockNextTask,
  mockRooms,
  mockUndo,
} from "@/lib/tada/mock";
import type {
  ChoresPayload,
  CompleteBody,
  CompleteResult,
  DoneTodayPayload,
  KidChores,
  NextTaskPayload,
  RoomsPayload,
  UndoBody,
} from "@/lib/tada/types";

// Tada!'s actions (Clean and Chores): the reads behind both views and the one
// closed write, completion + undo (spec D4/D5/D11). Shared by the wall's
// /api/tasks/* route handlers and the MCP tools (src/lib/action.ts).
//
// Never expose a decay score, backlog, count or streak from here (spec D4): the
// shapes in ./types carry none, on purpose.
//
// SECURITY: callers authenticate first. Writes then validate the acting member
// against the allowlist (the kids and Maryann, TADA_MEMBERS) before anything
// else; a request naming anyone else is refused 403. Completions are stamped
// source="hearth" by the client.

/** The rooms a Clean session can be scoped to, plus whose session it is. */
export async function listRooms(): Promise<ActionResult> {
  const mock = isTasksMockEnabled();
  const configured = mock || hasTadaCredentials();
  const adult = getAdultMember();
  try {
    const rooms = mock ? mockRooms() : configured ? await getRooms() : [];
    return ok({ rooms, adult, configured } satisfies RoomsPayload);
  } catch (err) {
    console.error("[tada] rooms upstream error:", err);
    return fail("upstream unavailable", 502);
  }
}

/**
 * The single next task for the Clean session — Tada!'s pick, scoped to a room
 * when given. Only { id, name, room }; `task: null` means all caught up.
 */
export async function nextTask(roomId: string | null): Promise<ActionResult> {
  const mock = isTasksMockEnabled();
  if (!mock && !hasTadaCredentials()) return ok({ task: null } satisfies NextTaskPayload);
  try {
    const task = mock ? mockNextTask(roomId) : await getNextTask(roomId, getAdultId());
    return ok({ task } satisfies NextTaskPayload);
  } catch (err) {
    console.error("[tada] next upstream error:", err);
    return fail("upstream unavailable", 502);
  }
}

/** Maryann's completions today, newest first — no totals (spec D4). */
export async function doneToday(): Promise<ActionResult> {
  const mock = isTasksMockEnabled();
  if (!mock && !hasTadaCredentials()) {
    return ok({ completions: [] } satisfies DoneTodayPayload);
  }
  try {
    const completions = mock ? mockDoneToday() : await getDoneToday(getAdultId());
    return ok({ completions } satisfies DoneTodayPayload);
  } catch (err) {
    console.error("[tada] done-today upstream error:", err);
    return fail("upstream unavailable", 502);
  }
}

/** One column per kid: today's chores, outstanding and done. */
export async function kidsChores(): Promise<ActionResult> {
  const kids = getKids();
  const mock = isTasksMockEnabled();
  const configured = mock || hasTadaCredentials();
  if (!configured) return ok({ kids: [], configured } satisfies ChoresPayload);
  try {
    const choresById = mock ? mockKids(kids) : await getKidsChores();
    const columns: KidChores[] = kids.map((kid) => ({
      kid,
      chores: choresById.get(kid.id) ?? [],
    }));
    return ok({ kids: columns, configured } satisfies ChoresPayload);
  } catch (err) {
    console.error("[tada] kids upstream error:", err);
    return fail("upstream unavailable", 502);
  }
}

/** Complete a task as an allowlisted member (Maryann for Clean, a kid for Chores). */
export async function complete(input: unknown): Promise<ActionResult> {
  const body = (input && typeof input === "object" ? input : {}) as Partial<CompleteBody>;
  const { taskId, memberId } = body;
  if (typeof taskId !== "string" || !taskId) return fail("taskId is required");
  if (typeof memberId !== "string" || !memberId) return fail("memberId is required");

  // Acting-member allowlist gate — before any other work (checklist #7).
  if (!isAllowedMember(memberId)) {
    return fail("member is not permitted to complete tasks from the wall", 403);
  }

  const mock = isTasksMockEnabled();
  if (!mock && !hasTadaCredentials()) return fail("tasks are not configured", 503);

  try {
    const completionId = mock ? mockComplete(taskId) : await completeTask(taskId, memberId);
    return ok({ completionId } satisfies CompleteResult);
  } catch (err) {
    console.error("[tada] complete upstream error:", err);
    return fail("upstream unavailable", 502);
  }
}

/** Reverse a completion made from the wall, within the day (Q5). Same allowlist. */
export async function undo(input: unknown): Promise<ActionResult> {
  const body = (input && typeof input === "object" ? input : {}) as Partial<UndoBody>;
  const { completionId, memberId } = body;
  if (typeof completionId !== "string" || !completionId) {
    return fail("completionId is required");
  }
  if (typeof memberId !== "string" || !memberId) return fail("memberId is required");

  if (!isAllowedMember(memberId)) {
    return fail("member is not permitted to undo completions from the wall", 403);
  }

  const mock = isTasksMockEnabled();
  if (!mock && !hasTadaCredentials()) return fail("tasks are not configured", 503);

  try {
    if (mock) mockUndo(completionId);
    else await undoCompletion(completionId, memberId);
    return noContent();
  } catch (err) {
    console.error("[tada] undo upstream error:", err);
    return fail("upstream unavailable", 502);
  }
}
