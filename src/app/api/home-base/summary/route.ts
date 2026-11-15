import { type NextRequest } from "next/server";
import { requireHomeBaseToken } from "@/lib/homeBase/auth";
import { homeBaseSummary } from "@/lib/homeBase/summary";

// GET /api/home-base/summary?date=YYYY-MM-DD&days=1..7
//
// The read-only household feed for Maryann's Home Base site: calendar, kids'
// school schedule, Connexus lessons, school hours, meals, chores and the budget
// card, each with its own status, timestamps and error. Contract and rules:
// src/lib/homeBase/types.ts; README → Home Base feed.
//
// SECURITY: authenticated with the Home Base token only (`requireHomeBaseToken`,
// first statement) — never the wall's device cookie or a ChatGPT token. GET
// only; there is no write on this path.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireHomeBaseToken(req);
  if (denied) return denied;
  const params = req.nextUrl.searchParams;
  const result = await homeBaseSummary(params.get("date"), params.get("days"));
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
