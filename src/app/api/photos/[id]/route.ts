import { requireDevice } from "@/lib/auth";
import { toResponse } from "@/lib/action";
import { dropPhoto } from "@/lib/photos/actions";
import { readPhoto } from "@/lib/photos/store";

// GET    /api/photos/<id> : the picture (JPEG). Only a paired device gets it.
// DELETE /api/photos/<id> : take it down ("don't show this one").
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const denied = await requireDevice();
  if (denied) return denied;
  const { id } = await ctx.params;
  const bytes = await readPhoto(id);
  if (!bytes) return new Response("Not Found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/jpeg",
      // An id never changes what it points at, so a screen keeps its copy.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const denied = await requireDevice();
  if (denied) return denied;
  const { id } = await ctx.params;
  return toResponse(await dropPhoto(id));
}
