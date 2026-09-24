import { NextResponse, type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { getScheduleKids, hasTandemCredentials } from "@/lib/tandem/config";
import { getWeek } from "@/lib/tandem/client";
import { isScheduleMockEnabled, mockWeek } from "@/lib/tandem/mock";
import { mondayOf, parseIsoDate } from "@/lib/tandem/week";
import type { SchedulePayload } from "@/lib/tandem/types";

// GET /api/schedule?week=YYYY-MM-DD
//
// Lincoln's and Ollie's Monday–Friday week from Tandem: school days and
// activities, read-only. `week` is any date in the week and comes from the
// client, because "which week is now" is the wall's local calendar, not the
// server's. `configured` is false when Tandem isn't wired yet, so the view
// renders a calm "not connected" state rather than an error (spec §6.2).
// Mock-first for local dev (HEARTH_SCHEDULE_MOCK=1).
//
// SECURITY: `requireDevice()` is the first statement, and the Tandem key never
// reaches the browser (Phase 0.1, spec §3.2).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireDevice();
  if (denied) return denied;

  const week = req.nextUrl.searchParams.get("week") ?? "";
  if (!parseIsoDate(week)) {
    return NextResponse.json({ error: "week must be YYYY-MM-DD" }, { status: 400 });
  }

  const kids = getScheduleKids();
  const mock = isScheduleMockEnabled();
  const configured = mock || hasTandemCredentials();
  const monday = mondayOf(week);

  if (!configured) {
    return NextResponse.json({
      weekStart: monday,
      kids,
      activities: [],
      configured,
    } satisfies SchedulePayload);
  }

  try {
    const { weekStart, activities } = mock
      ? { weekStart: monday, activities: mockWeek(monday) }
      : await getWeek(week);
    return NextResponse.json({
      weekStart,
      kids,
      activities,
      configured,
    } satisfies SchedulePayload);
  } catch (err) {
    console.error("[api/schedule] upstream error:", err);
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}
