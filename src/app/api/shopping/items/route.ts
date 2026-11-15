import { type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { fail, NOT_JSON, readJson, toResponse } from "@/lib/action";
import { addItem } from "@/lib/spoon/actions";

// POST /api/shopping/items  (Phase 4, Shopping — "add an item")
//
// Add one item to the Enchanted Spoon shopping list by name, typed on the wall.
// Enchanted Spoon owns everything after that (spec D6): which category it goes
// under, skipping an item that's already needed, and moving a checked-off match
// back to "need". The response says which of those happened.
//
// SECURITY: `requireDevice()` is the first statement — the device token never
// reaches the browser (Phase 0.1, spec §3.2).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = await requireDevice();
  if (denied) return denied;
  const body = await readJson(req);
  if (body === NOT_JSON) return toResponse(fail("invalid JSON body"));
  return toResponse(await addItem(body));
}
