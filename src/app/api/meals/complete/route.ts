import { NextResponse, type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { hasSpoonCredentials } from "@/lib/spoon/config";
import { completeMeal } from "@/lib/spoon/client";
import { isMealsMockEnabled, mockCompleteMeal } from "@/lib/spoon/mock";
import type { CompleteMealBody } from "@/lib/spoon/types";

// POST /api/meals/complete  (Phase 4, Meals — "mark cooked")
//
// The wall's one write into Enchanted Spoon: mark a plan entry cooked (its
// `is_completed`) so the Meals view can drop it — the quick-access gesture the
// kitchen wanted. Everything else about Meals stays read-only (spec D6): no
// assign, swap, or edit, and no undo here — restoring an accidental completion
// lives in Enchanted Spoon. Mock-first for local dev (HEARTH_MEALS_MOCK=1).
//
// SECURITY: `requireDevice()` is the first statement — the device token never
// reaches the browser (Phase 0.1, spec §3.2). The completion targets a plan
// entry the account already owns; there is no member attribution to validate
// (unlike Tada!'s completions), so entry id + household scope is the whole gate.
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const denied = await requireDevice();
  if (denied) return denied;

  let body: Partial<CompleteMealBody>;
  try {
    body = (await req.json()) as Partial<CompleteMealBody>;
  } catch {
    return bad("invalid JSON body");
  }

  const { entryId } = body;
  if (typeof entryId !== "string" || !entryId) return bad("entryId is required");

  const mock = isMealsMockEnabled();
  if (!mock && !hasSpoonCredentials()) return bad("meals are not configured", 503);

  try {
    if (mock) mockCompleteMeal(entryId);
    else await completeMeal(entryId);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("[api/meals/complete] upstream error:", err);
    return bad("upstream unavailable", 502);
  }
}
