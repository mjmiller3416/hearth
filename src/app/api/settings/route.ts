import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth";
import {
  getColorConfig,
  isCustomizableSlug,
  isSwatchId,
  setColorOverride,
} from "@/lib/settings/store";

// GET  /api/settings — the current color selection (slug -> swatch id | null).
// PUT  /api/settings — set or clear one slug's color: { slug, swatchId|null }.
//
// SECURITY: this is a device-token WRITE surface. `requireDevice()` is the FIRST
// statement in every handler (Phase 0.1). The slug must be a customizable color
// and the swatch must be one of the vetted palette entries — the client can't
// inject an arbitrary color or target an unknown slug.
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDevice();
  if (denied) return denied;
  const { selection } = await getColorConfig();
  return NextResponse.json({ colors: selection });
}

export async function PUT(req: Request) {
  const denied = await requireDevice();
  if (denied) return denied;

  let body: { slug?: unknown; swatchId?: unknown };
  try {
    body = (await req.json()) as { slug?: unknown; swatchId?: unknown };
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug : "";
  if (!slug || !isCustomizableSlug(slug)) {
    return NextResponse.json({ error: "Unknown color." }, { status: 400 });
  }

  // null clears the override (back to the default); otherwise a valid swatch id.
  const swatchId = body.swatchId === null ? null : String(body.swatchId ?? "");
  if (swatchId !== null && !isSwatchId(swatchId)) {
    return NextResponse.json({ error: "Unknown swatch." }, { status: 400 });
  }

  await setColorOverride(slug, swatchId);
  const { selection } = await getColorConfig();
  return NextResponse.json({ colors: selection });
}
