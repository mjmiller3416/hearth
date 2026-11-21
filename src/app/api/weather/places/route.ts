import { requireDevice } from "@/lib/auth";
import { toResponse } from "@/lib/action";
import { findPlaces } from "@/lib/weather/actions";

// GET /api/weather/places?q=<text>
//
// Towns matching what was typed into Settings → Weather, for picking the one
// the forecast is for.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireDevice();
  if (denied) return denied;
  return toResponse(await findPlaces(new URL(req.url).searchParams.get("q") ?? ""));
}
