import { NextResponse, type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { toResponse } from "@/lib/action";
import { listEvents } from "@/lib/calendar/actions";
import { parseBoundary } from "@/lib/calendar/dates";

// GET /api/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD  (Phase 1 #2)
//
// Returns every event overlapping [start, end) across the family calendars,
// normalized for the wall, plus the member list for the filter chips. `start`
// and `end` come from the client, computed for whichever view (month grid or
// week) is showing, so the server stays view-agnostic.
//
// Credentials never reach the browser (spec §3.2): the Google refresh token is
// read only server-side. This handler self-authorizes — the (protected) layout
// does not gate route handlers, so per the Phase 0.1 auth model every /api
// handler verifies the device token itself, before any other work.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireDevice();
  if (denied) return denied;

  const { searchParams } = req.nextUrl;
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  if (!startParam || !endParam) {
    return NextResponse.json(
      { error: "start and end are required (YYYY-MM-DD)" },
      { status: 400 },
    );
  }
  return toResponse(await listEvents(parseBoundary(startParam), parseBoundary(endParam)));
}
