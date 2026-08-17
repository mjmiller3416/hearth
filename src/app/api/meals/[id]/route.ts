import { NextResponse, type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { hasSpoonCredentials } from "@/lib/spoon/config";
import { getMealCard } from "@/lib/spoon/client";
import { isMealsMockEnabled, mockMealCard } from "@/lib/spoon/mock";
import type { MealCardPayload } from "@/lib/spoon/types";

// GET /api/meals/<id>  (Phase 4, §4.5, §5.4)
//
// One meal's card — main dish and sides, each with ingredients and recipe steps.
// The `id` is the Enchanted Spoon meal id carried by a plan row. Read-only (D6).
// `card: null` is a normal outcome (the meal left the plan since the last poll),
// not an error. Mock-first for local dev.
//
// SECURITY: `requireDevice()` is the first statement (spec §3.2).
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/meals/[id]">,
) {
  const denied = await requireDevice();
  if (denied) return denied;

  const { id } = await ctx.params;
  const mock = isMealsMockEnabled();

  if (!mock && !hasSpoonCredentials()) {
    return NextResponse.json({ card: null } satisfies MealCardPayload);
  }

  try {
    const card = mock ? mockMealCard(id) : await getMealCard(id);
    return NextResponse.json({ card } satisfies MealCardPayload);
  } catch (err) {
    console.error("[api/meals/[id]] upstream error:", err);
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}
