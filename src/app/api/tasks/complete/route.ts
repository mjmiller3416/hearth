import { NextResponse, type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { isAllowedMember, hasTadaCredentials } from "@/lib/tada/config";
import { completeTask } from "@/lib/tada/client";
import { isTasksMockEnabled, mockComplete } from "@/lib/tada/mock";
import type { CompleteBody, CompleteResult } from "@/lib/tada/types";

// POST /api/tasks/complete  (Phase 2 #7)
//
// The shared completion write for both surfaces: Maryann completing a task in her
// Clean session, and a kid checking off a chore (spec §5.3, D11). The acting
// member is fixed by the surface, not chosen here — the client sends whichever it
// is, and this handler credits it.
//
// SECURITY: `requireDevice()` is first. Then, before any write, the acting member
// is validated against the allowlist (the kids and Maryann only) — a crafted
// request naming any other member is rejected 403 (checklist #7, spec §5.3). The
// completion is written with source="hearth" so it's distinguishable in Tada!'s
// CompletionLog. Only THIS closed write (plus its undo) is in scope for Phase 2;
// anything more is a spec amendment (D11).
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const denied = await requireDevice();
  if (denied) return denied;

  let body: Partial<CompleteBody>;
  try {
    body = (await req.json()) as Partial<CompleteBody>;
  } catch {
    return bad("invalid JSON body");
  }

  const { taskId, memberId } = body;
  if (typeof taskId !== "string" || !taskId) return bad("taskId is required");
  if (typeof memberId !== "string" || !memberId) return bad("memberId is required");

  // Acting-member allowlist gate — before any other work (checklist #7).
  if (!isAllowedMember(memberId)) {
    return bad("member is not permitted to complete tasks from the wall", 403);
  }

  const mock = isTasksMockEnabled();
  if (!mock && !hasTadaCredentials()) return bad("tasks are not configured", 503);

  try {
    const completionId = mock
      ? mockComplete(taskId)
      : await completeTask(taskId, memberId);
    return NextResponse.json({ completionId } satisfies CompleteResult);
  } catch (err) {
    console.error("[api/tasks/complete] upstream error:", err);
    return bad("upstream unavailable", 502);
  }
}
