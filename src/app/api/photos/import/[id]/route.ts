import { toResponse } from "@/lib/action";
import { keepPhoto } from "@/lib/photos/actions";
import { requirePhotosToken } from "@/lib/photos/auth";

// PUT /api/photos/import/<id> : the bulk importer adds one photo under a
// stable id (a hash of where it came from), so running it again changes
// nothing. A photo someone removed on the wall is not put back.
export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: RouteContext<"/api/photos/import/[id]">) {
  const denied = await requirePhotosToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const bytes = new Uint8Array(await req.arrayBuffer());
  return toResponse(
    await keepPhoto(bytes, { id, takenAt: req.headers.get("x-photo-taken"), byPerson: false }),
  );
}
