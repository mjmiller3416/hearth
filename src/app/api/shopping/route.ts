import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth";
import { hasSpoonCredentials } from "@/lib/spoon/config";
import { getShoppingList } from "@/lib/spoon/client";
import { isMealsMockEnabled, mockShoppingList } from "@/lib/spoon/mock";
import type { ShoppingListPayload } from "@/lib/spoon/types";

// GET /api/shopping  (Phase 4, §4.6, §5.5)
//
// The household shopping list from Enchanted Spoon — every row, needed and
// checked off; the view shows the needed ones grouped by category.
// `configured` is false when Enchanted Spoon isn't wired yet, so the view
// renders a calm "not connected" state rather than an error (spec §6.2).
// Mock-first for local dev (HEARTH_MEALS_MOCK=1).
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
    const items = mock ? mockShoppingList() : configured ? await getShoppingList() : [];
    return NextResponse.json({ items, configured } satisfies ShoppingListPayload);
  } catch (err) {
    console.error("[api/shopping] upstream error:", err);
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}
