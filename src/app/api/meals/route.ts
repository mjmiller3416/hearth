import { requireDevice } from "@/lib/auth";
import { toResponse } from "@/lib/action";
import { mealPlan } from "@/lib/spoon/actions";

// GET /api/meals  (Phase 4, §4.5, §5.4)
//
// The current meal plan from Enchanted Spoon — the planner's entries in order,
// each a glanceable row (name, day when scheduled, main dish). Read-only (D6).
// `configured` is false when Enchanted Spoon isn't wired yet, so the view renders
// a calm "not connected" state rather than an error (spec §6.2).
//
// SECURITY: `requireDevice()` is the first statement — the device token never
// reaches the browser (Phase 0.1, spec §3.2).
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDevice();
  if (denied) return denied;
  return toResponse(await mealPlan());
}
