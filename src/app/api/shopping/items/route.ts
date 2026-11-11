import { NextResponse, type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { hasSpoonCredentials } from "@/lib/spoon/config";
import { addShoppingItem } from "@/lib/spoon/client";
import { isMealsMockEnabled, mockAddShoppingItem } from "@/lib/spoon/mock";
import {
  SHOPPING_NAME_MAX,
  type AddShoppingItemBody,
  type AddShoppingItemResult,
} from "@/lib/spoon/types";

// POST /api/shopping/items  (Phase 4, Shopping — "add an item")
//
// Add one item to the Enchanted Spoon shopping list by name, typed on the wall.
// Enchanted Spoon owns everything after that (spec D6): which category it goes
// under, skipping an item that's already needed, and moving a checked-off match
// back to "need". The response says which of those happened so the view can
// confirm it. Mock-first for local dev (HEARTH_MEALS_MOCK=1).
//
// SECURITY: `requireDevice()` is the first statement — the device token never
// reaches the browser (Phase 0.1, spec §3.2). The list is shared and unowned,
// so there is no acting member to validate (spec §6.3); the device token plus
// the household scope Enchanted Spoon applies is the whole gate.
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const denied = await requireDevice();
  if (denied) return denied;

  let body: Partial<AddShoppingItemBody>;
  try {
    body = (await req.json()) as Partial<AddShoppingItemBody>;
  } catch {
    return bad("invalid JSON body");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return bad("name is required");
  if (name.length > SHOPPING_NAME_MAX) return bad("name is too long");

  const mock = isMealsMockEnabled();
  if (!mock && !hasSpoonCredentials()) return bad("shopping is not configured", 503);

  try {
    const result = mock ? mockAddShoppingItem(name) : await addShoppingItem(name);
    return NextResponse.json(result satisfies AddShoppingItemResult);
  } catch (err) {
    console.error("[api/shopping/items] upstream error:", err);
    return bad("upstream unavailable", 502);
  }
}
