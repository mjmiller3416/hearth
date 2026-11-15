import { type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { toResponse } from "@/lib/action";
import { nextTask } from "@/lib/tada/actions";

// GET /api/tasks/next?room=<id>  (Phase 2 #3)
//
// The single next task for the Clean session — Tada!'s decay selection, scoped
// to a room when `room` is present, whole-house when omitted. Returns ONLY
// { id, name, room }: the decay score is never exposed, because the wall shows
// the task, not why it was chosen (spec D4, checklist #18). `task: null` is the
// caught-up rest state, not an error (checklist #10).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireDevice();
  if (denied) return denied;
  return toResponse(await nextTask(req.nextUrl.searchParams.get("room")));
}
