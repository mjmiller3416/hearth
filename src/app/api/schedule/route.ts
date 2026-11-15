import { type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { toResponse } from "@/lib/action";
import { scheduleWeek } from "@/lib/tandem/actions";

// GET /api/schedule?week=YYYY-MM-DD
//
// Lincoln's and Ollie's Monday–Friday week from Tandem: school days and
// activities, read-only. `week` is any date in the week and comes from the
// client, because "which week is now" is the wall's local calendar, not the
// server's. `configured` is false when Tandem isn't wired yet (spec §6.2).
//
// SECURITY: `requireDevice()` is the first statement, and the Tandem key never
// reaches the browser (Phase 0.1, spec §3.2).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireDevice();
  if (denied) return denied;
  return toResponse(await scheduleWeek(req.nextUrl.searchParams.get("week") ?? ""));
}
