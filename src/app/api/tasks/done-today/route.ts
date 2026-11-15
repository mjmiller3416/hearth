import { requireDevice } from "@/lib/auth";
import { toResponse } from "@/lib/action";
import { doneToday } from "@/lib/tada/actions";

// GET /api/tasks/done-today  (Phase 2 #5)
//
// Maryann's completions today, for the Clean done-today celebration, newest
// first. Each entry is name + room + time and NOTHING that could read as a total
// or a fraction — no count, no denominator, no progress (spec D4, checklist #11).
// A completion made on a phone appears here too on the next poll (spec §5.3).
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDevice();
  if (denied) return denied;
  return toResponse(await doneToday());
}
