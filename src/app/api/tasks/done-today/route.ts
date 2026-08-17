import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth";
import { getAdultId, hasTadaCredentials } from "@/lib/tada/config";
import { getDoneToday } from "@/lib/tada/client";
import { isTasksMockEnabled, mockDoneToday } from "@/lib/tada/mock";
import type { DoneTodayPayload } from "@/lib/tada/types";

// GET /api/tasks/done-today  (Phase 2 #5)
//
// Maryann's completions today, for the Clean done-today celebration, newest
// first. Each entry is name + room + time and NOTHING that could read as a total
// or a fraction — no count, no denominator, no progress (spec D4, checklist #11).
// A completion made on a phone appears here too on the next poll (spec §5.3).
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDevice();
  if (denied) return denied;

  const mock = isTasksMockEnabled();
  if (!mock && !hasTadaCredentials()) {
    return NextResponse.json({ completions: [] } satisfies DoneTodayPayload);
  }

  try {
    const completions = mock ? mockDoneToday() : await getDoneToday(getAdultId());
    return NextResponse.json({ completions } satisfies DoneTodayPayload);
  } catch (err) {
    console.error("[api/tasks/done-today] upstream error:", err);
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}
