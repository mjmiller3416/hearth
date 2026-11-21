import { requireDevice } from "@/lib/auth";
import { fail, NOT_JSON, readJson, toResponse } from "@/lib/action";
import { setPin } from "@/lib/allowance/actions";

// POST /api/allowance/pin  { current?, next }
//
// Create the parent PIN (when none exists) or change it (needs the current
// one). The PIN guards the kids' balances: seeing them all, and changing any.
//
// SECURITY: `requireDevice()` is the first statement (spec §3.2).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireDevice();
  if (denied) return denied;
  const body = await readJson(req);
  if (body === NOT_JSON) return toResponse(fail("Request body must be JSON."));
  return toResponse(await setPin(body));
}
