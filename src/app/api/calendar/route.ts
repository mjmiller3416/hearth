import { NextResponse, type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { getMembers } from "@/lib/calendar/members";
import { getEvents } from "@/lib/google/calendar";
import { isGoogleConfigured } from "@/lib/google/token";
import { isMockEnabled } from "@/lib/google/mock";
import { parseBoundary } from "@/lib/calendar/dates";
import type { CalendarPayload } from "@/lib/calendar/types";

// GET /api/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD  (Phase 1 #2)
//
// Returns every event overlapping [start, end) across the four family calendars,
// normalized for the wall, plus the member list for the filter chips. `start`
// and `end` come from the client, computed for whichever view (month grid or
// week) is showing, so the server stays view-agnostic.
//
// Credentials never reach the browser (spec §3.2): the Google refresh token is
// read only here, server-side. This handler self-authorizes — the (protected)
// layout does not gate route handlers, so per the Phase 0.1 auth model every
// /api handler verifies the device token itself, before any other work.
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

  const start = parseBoundary(startParam);
  const end = parseBoundary(endParam);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "invalid range" }, { status: 400 });
  }

  const members = getMembers();
  const configured = isMockEnabled() || (isGoogleConfigured() && members.length > 0);

  try {
    const events = await getEvents(start, end);
    const payload: CalendarPayload = { events, members, configured };
    return NextResponse.json(payload);
  } catch (err) {
    // Upstream failure: surface a 502 so the client's stale-data contract keeps
    // the last good render and marks it quietly stale (spec §6.2). Never leak
    // the underlying error to the wall.
    console.error("[api/calendar] upstream error:", err);
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}
