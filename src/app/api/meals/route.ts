import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth";
import { hasSpoonCredentials } from "@/lib/spoon/config";
import { getMealPlan } from "@/lib/spoon/client";
import { isMealsMockEnabled, mockMealPlan } from "@/lib/spoon/mock";
import type { MealPlanPayload } from "@/lib/spoon/types";

// GET /api/meals  (Phase 4, §4.5, §5.4)
//
// The current meal plan from Enchanted Spoon — the planner's entries in order,
// each a glanceable row (name, day when scheduled, main dish). Read-only (D6).
// `configured` is false when Enchanted Spoon isn't wired yet, so the view renders
// a calm "not connected" state rather than an error (spec §6.2). Mock-first for
// local dev (HEARTH_MEALS_MOCK=1).
//
// SECURITY: `requireDevice()` is the first statement — the device token never
// reaches the browser (Phase 0.1, spec §3.2).
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDevice();
  if (denied) return denied;

  const mock = isMealsMockEnabled();
  const configured = mock || hasSpoonCredentials();

  try {
    const meals = mock ? mockMealPlan() : configured ? await getMealPlan() : [];
    return NextResponse.json({ meals, configured } satisfies MealPlanPayload);
  } catch (err) {
    console.error("[api/meals] upstream error:", err);
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}
