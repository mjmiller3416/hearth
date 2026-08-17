import { NextResponse, type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { isAllowedMember, hasTadaCredentials } from "@/lib/tada/config";
import { undoCompletion } from "@/lib/tada/client";
import { isTasksMockEnabled, mockUndo } from "@/lib/tada/mock";
import type { UndoBody } from "@/lib/tada/types";

// POST /api/tasks/undo  (Phase 2 #14, resolves Q5)
//
// Reverse a completion made from the wall, within the day. A wall tap is more
// mis-tap-prone than a phone tap — and adults complete here now too — so both
// Clean and Chores surface an Undo on the just-completed row (Q5, spec §5.3).
// Same allowlist gate as complete: only the kids and Maryann.
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const denied = await requireDevice();
  if (denied) return denied;

  let body: Partial<UndoBody>;
  try {
    body = (await req.json()) as Partial<UndoBody>;
  } catch {
    return bad("invalid JSON body");
  }

  const { completionId, memberId } = body;
  if (typeof completionId !== "string" || !completionId)
    return bad("completionId is required");
  if (typeof memberId !== "string" || !memberId) return bad("memberId is required");

  if (!isAllowedMember(memberId)) {
    return bad("member is not permitted to undo completions from the wall", 403);
  }

  const mock = isTasksMockEnabled();
  if (!mock && !hasTadaCredentials()) return bad("tasks are not configured", 503);

  try {
    if (mock) mockUndo(completionId);
    else await undoCompletion(completionId, memberId);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("[api/tasks/undo] upstream error:", err);
    return bad("upstream unavailable", 502);
  }
}
