import { requireDevice } from "@/lib/auth";
import { toResponse } from "@/lib/action";
import { listRooms } from "@/lib/tada/actions";

// GET /api/tasks/rooms  (Phase 2 #4)
//
// The Clean view's context: the rooms a session can be scoped to, plus the adult
// whose session this is (Maryann, HEARTH_ADULT_ID) — the acting member for every
// completion made here (spec §5.3, §6.3). `configured` is false when Tada! isn't
// wired yet, so the view renders a calm "not connected" state, never an error
// (spec §6.2). Mock-first for local dev (HEARTH_TASKS_MOCK=1).
//
// SECURITY: `requireDevice()` is the first statement, before any other work — the
// device token never reaches the browser (Phase 0.1, spec §3.2).
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDevice();
  if (denied) return denied;
  return toResponse(await listRooms());
}
