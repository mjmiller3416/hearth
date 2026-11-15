import { requireDevice } from "@/lib/auth";
import { toResponse } from "@/lib/action";
import { shoppingList } from "@/lib/spoon/actions";

// GET /api/shopping  (Phase 4, §4.6, §5.5)
//
// The household shopping list from Enchanted Spoon — every row, needed and
// checked off; the view shows the needed ones grouped by category.
// `configured` is false when Enchanted Spoon isn't wired yet (spec §6.2).
//
// SECURITY: `requireDevice()` is the first statement — the device token never
// reaches the browser (Phase 0.1, spec §3.2).
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDevice();
  if (denied) return denied;
  return toResponse(await shoppingList());
}
