import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth";
import { getKids, hasTadaCredentials } from "@/lib/tada/config";
import { getKidsChores } from "@/lib/tada/client";
import { isTasksMockEnabled, mockKids } from "@/lib/tada/mock";
import type { ChoresPayload, KidChores } from "@/lib/tada/types";

// GET /api/tasks/kids  (Phase 2 #6)
//
// One column per kid: today's outstanding and completed chores. Pairs the
// configured kids (from TADA_MEMBERS) with the chores Tada! returns, so a kid
// with nothing left still gets a column. No score, streak, badge, or star — the
// kids' surface tracks; it does not gamify (spec D5, checklist #18).
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDevice();
  if (denied) return denied;

  const kids = getKids();
  const mock = isTasksMockEnabled();
  const configured = mock || hasTadaCredentials();

  if (!configured) {
    return NextResponse.json({ kids: [], configured } satisfies ChoresPayload);
  }

  try {
    const choresById = mock ? mockKids(kids) : await getKidsChores();
    const columns: KidChores[] = kids.map((kid) => ({
      kid,
      chores: choresById.get(kid.id) ?? [],
    }));
    return NextResponse.json({ kids: columns, configured } satisfies ChoresPayload);
  } catch (err) {
    console.error("[api/tasks/kids] upstream error:", err);
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}
