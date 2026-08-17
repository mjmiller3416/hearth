import { NextResponse, type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { getAdultId, hasTadaCredentials } from "@/lib/tada/config";
import { getNextTask } from "@/lib/tada/client";
import { isTasksMockEnabled, mockNextTask } from "@/lib/tada/mock";
import type { NextTaskPayload } from "@/lib/tada/types";

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

  const roomId = req.nextUrl.searchParams.get("room");
  const mock = isTasksMockEnabled();
  if (!mock && !hasTadaCredentials()) {
    return NextResponse.json({ task: null } satisfies NextTaskPayload);
  }

  try {
    const task = mock
      ? mockNextTask(roomId)
      : await getNextTask(roomId, getAdultId());
    return NextResponse.json({ task } satisfies NextTaskPayload);
  } catch (err) {
    console.error("[api/tasks/next] upstream error:", err);
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}
