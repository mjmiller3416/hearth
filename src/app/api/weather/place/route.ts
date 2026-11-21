import { requireDevice } from "@/lib/auth";
import { fail, NOT_JSON, readJson, toResponse } from "@/lib/action";
import { choosePlace, currentPlace } from "@/lib/weather/actions";

// GET /api/weather/place : the town the forecast is for.
// PUT /api/weather/place : choose it ({ name, latitude, longitude }), or
//                          { place: null } to clear it.
//
// A display setting, kept with the family colors in Hearth's settings file.
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDevice();
  if (denied) return denied;
  return toResponse(await currentPlace());
}

export async function PUT(req: Request) {
  const denied = await requireDevice();
  if (denied) return denied;
  const body = await readJson(req);
  if (body === NOT_JSON) return toResponse(fail("Request body must be JSON."));
  return toResponse(await choosePlace(body));
}
