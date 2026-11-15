import { fail, ok, type ActionResult } from "@/lib/action";
import { getScheduleKids, hasTandemCredentials } from "@/lib/tandem/config";
import { getWeek } from "@/lib/tandem/client";
import { isScheduleMockEnabled, mockWeek } from "@/lib/tandem/mock";
import { mondayOf, parseIsoDate } from "@/lib/tandem/week";
import type { SchedulePayload } from "@/lib/tandem/types";

// Tandem's one action: the kids' Monday–Friday week, read-only. Shared by
// GET /api/schedule and the MCP tools (src/lib/action.ts).

/** The week containing `week` (any "YYYY-MM-DD" in it). */
export async function scheduleWeek(week: string): Promise<ActionResult> {
  if (!parseIsoDate(week)) return fail("week must be YYYY-MM-DD");

  const kids = getScheduleKids();
  const mock = isScheduleMockEnabled();
  const configured = mock || hasTandemCredentials();
  const monday = mondayOf(week);

  if (!configured) {
    return ok({ weekStart: monday, kids, activities: [], configured } satisfies SchedulePayload);
  }

  try {
    const { weekStart, activities } = mock
      ? { weekStart: monday, activities: mockWeek(monday) }
      : await getWeek(week);
    return ok({ weekStart, kids, activities, configured } satisfies SchedulePayload);
  } catch (err) {
    console.error("[tandem] upstream error:", err);
    return fail("upstream unavailable", 502);
  }
}
