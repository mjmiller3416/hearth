import { type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { fail, NOT_JSON, readJson, toResponse } from "@/lib/action";
import { markCooked } from "@/lib/spoon/actions";

// POST /api/meals/complete  (Phase 4, Meals — "mark cooked")
//
// The wall's one write into Enchanted Spoon's plan: mark a plan entry cooked (its
// `is_completed`) so the Meals view can drop it. Everything else about Meals
// stays read-only (spec D6): no assign, swap, or edit, and no undo here —
// restoring an accidental completion lives in Enchanted Spoon.
//
// SECURITY: `requireDevice()` is the first statement — the device token never
// reaches the browser (Phase 0.1, spec §3.2).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = await requireDevice();
  if (denied) return denied;
  const body = await readJson(req);
  if (body === NOT_JSON) return toResponse(fail("invalid JSON body"));
  return toResponse(await markCooked(body));
}
