import { toResponse } from "@/lib/action";
import { importState } from "@/lib/photos/actions";
import { requirePhotosToken } from "@/lib/photos/auth";

// GET /api/photos/import : for the bulk importer on the home server: which
// photo ids Hearth already has, and which were removed and must stay away.
// Authenticated by the importer's own token, not the device cookie.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requirePhotosToken(req);
  if (denied) return denied;
  return toResponse(await importState());
}
