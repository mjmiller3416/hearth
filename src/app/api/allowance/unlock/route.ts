import { requireDevice } from "@/lib/auth";
import { fail, NOT_JSON, readJson, toResponse } from "@/lib/action";
import { parentAllowance } from "@/lib/allowance/actions";

// POST /api/allowance/unlock  { pin }
//
// Every kid's balance, for a parent. A POST so the PIN travels in the body, not
// a URL. Wrong PINs are limited (5 per 15 minutes).
//
// SECURITY: `requireDevice()` is the first statement (spec §3.2).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireDevice();
  if (denied) return denied;
  const body = await readJson(req);
  if (body === NOT_JSON) return toResponse(fail("Request body must be JSON."));
  return toResponse(await parentAllowance(body));
}
