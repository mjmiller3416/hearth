import { type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { fail, NOT_JSON, readJson, toResponse } from "@/lib/action";
import { undo } from "@/lib/tada/actions";

// POST /api/tasks/undo  (Phase 2 #14, resolves Q5)
//
// Reverse a completion made from the wall, within the day. A wall tap is more
// mis-tap-prone than a phone tap, so both Clean and Chores surface an Undo on the
// just-completed row (Q5, spec §5.3). Same allowlist gate as complete: only the
// kids and Maryann. Rules: src/lib/tada/actions.ts.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = await requireDevice();
  if (denied) return denied;
  const body = await readJson(req);
  if (body === NOT_JSON) return toResponse(fail("invalid JSON body"));
  return toResponse(await undo(body));
}
