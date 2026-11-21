import { requireDevice } from "@/lib/auth";
import { toResponse } from "@/lib/action";
import { getWeather } from "@/lib/weather/actions";

// GET /api/weather
//
// The forecast for the household's town: now, the next hours, the next few
// days. `configured: false` when no town has been chosen in Settings.
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDevice();
  if (denied) return denied;
  return toResponse(await getWeather());
}
