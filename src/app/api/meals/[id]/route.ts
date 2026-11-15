import { type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { toResponse } from "@/lib/action";
import { mealCard } from "@/lib/spoon/actions";

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
  return toResponse(await mealCard(id));
}
