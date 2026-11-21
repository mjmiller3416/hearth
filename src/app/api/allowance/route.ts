import { type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { fail, NOT_JSON, readJson, toResponse } from "@/lib/action";
import { setBalance, viewAllowance } from "@/lib/allowance/actions";

// GET /api/allowance?viewer=<memberKey>   one kid's own balance (their lens)
// GET /api/allowance                      whether a parent PIN exists (settings)
// PUT /api/allowance                      set or clear one kid's balance (PIN)
//
// Amounts are parent-entered, never synced: Greenlight gives a household no way
// to read balances (README → Allowance). A viewer who isn't a kid gets no
// amounts at all; every kid's balance together is behind the parent PIN at
// /api/allowance/unlock.
//
// SECURITY: `requireDevice()` is the first statement (spec §3.2).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireDevice();
  if (denied) return denied;
  return toResponse(await viewAllowance(req.nextUrl.searchParams.get("viewer")));
}

export async function PUT(req: Request) {
  const denied = await requireDevice();
  if (denied) return denied;
  const body = await readJson(req);
  if (body === NOT_JSON) return toResponse(fail("Request body must be JSON."));
  return toResponse(await setBalance(body));
}
