import { requireDevice } from "@/lib/auth";
import { toResponse } from "@/lib/action";
import { keepPhoto, photoList } from "@/lib/photos/actions";

// GET  /api/photos : the family photos Home cycles through (ids and dates).
// POST /api/photos : add one from this device. The body is the JPEG itself,
//                    already resized by the browser; `x-photo-taken` may carry
//                    when it was taken (ISO).
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDevice();
  if (denied) return denied;
  return toResponse(await photoList());
}

export async function POST(req: Request) {
  const denied = await requireDevice();
  if (denied) return denied;
  const bytes = new Uint8Array(await req.arrayBuffer());
  return toResponse(
    await keepPhoto(bytes, { takenAt: req.headers.get("x-photo-taken"), byPerson: true }),
  );
}
