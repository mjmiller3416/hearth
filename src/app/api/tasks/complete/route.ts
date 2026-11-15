import { type NextRequest } from "next/server";
import { requireDevice } from "@/lib/auth";
import { fail, NOT_JSON, readJson, toResponse } from "@/lib/action";
import { complete } from "@/lib/tada/actions";

// POST /api/tasks/complete  (Phase 2 #7)
//
// The shared completion write for both surfaces: Maryann completing a task in her
// Clean session, and a kid checking off a chore (spec §5.3, D11). The acting
// member is fixed by the surface, not chosen here — the client sends whichever it
// is, and this handler credits it. Rules: src/lib/tada/actions.ts.
//
// SECURITY: `requireDevice()` is first. Then, before any write, the acting member
// is validated against the allowlist (the kids and Maryann only) — a crafted
// request naming any other member is rejected 403 (checklist #7, spec §5.3).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = await requireDevice();
  if (denied) return denied;
  const body = await readJson(req);
  if (body === NOT_JSON) return toResponse(fail("invalid JSON body"));
  return toResponse(await complete(body));
}
