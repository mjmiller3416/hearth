import { requireDevice } from "@/lib/auth";
import { toResponse } from "@/lib/action";
import { kidsChores } from "@/lib/tada/actions";

// GET /api/tasks/kids  (Phase 2 #6)
//
// One column per kid: today's outstanding and completed chores. Pairs the
// configured kids (from TADA_MEMBERS) with the chores Tada! returns, so a kid
// with nothing left still gets a column. No score, streak, badge, or star — the
// kids' surface tracks; it does not gamify (spec D5, checklist #18).
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDevice();
  if (denied) return denied;
  return toResponse(await kidsChores());
}
