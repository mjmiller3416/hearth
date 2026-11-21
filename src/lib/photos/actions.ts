import { fail, noContent, ok, type ActionResult } from "@/lib/action";
import {
  addPhoto,
  idForBytes,
  isPhotoId,
  listPhotos,
  looksLikeJpeg,
  MAX_BYTES,
  MAX_PHOTOS,
  removePhoto,
} from "./store";
import type { PhotosPayload } from "./types";

// The rules for the family photos, shared by the wall's routes and the
// importer's. SERVER-ONLY. The caller has already authenticated.

/** GET /api/photos */
export async function photoList(): Promise<ActionResult> {
  const { photos, durable } = await listPhotos();
  return ok({ photos, durable, max: MAX_PHOTOS } satisfies PhotosPayload);
}

/** A valid ISO date-time, or null. */
function parseTaken(value: string | null): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Keep one uploaded JPEG. `id` is given by the importer (stable per source
 * file) and worked out from the bytes for a phone upload. `byPerson` is a
 * person adding it on purpose, which also brings back one that was removed.
 */
export async function keepPhoto(
  bytes: Uint8Array,
  options: { id?: string; takenAt: string | null; byPerson: boolean },
): Promise<ActionResult> {
  if (bytes.length === 0) return fail("Send the photo as the request body.");
  if (bytes.length > MAX_BYTES) return fail("That photo is too large. Resize it first.", 413);
  if (!looksLikeJpeg(bytes)) return fail("Photos must be JPEG.", 415);
  const id = options.id ?? idForBytes(bytes);
  if (!isPhotoId(id)) return fail("Bad photo id.");

  const result = await addPhoto(id, bytes, parseTaken(options.takenAt), options.byPerson);
  if (result === "full") return fail(`Hearth keeps at most ${MAX_PHOTOS} photos. Remove some first.`, 409);
  return ok({ id, status: result }, result === "added" ? 201 : 200);
}

/** DELETE /api/photos/<id> */
export async function dropPhoto(id: string): Promise<ActionResult> {
  if (!isPhotoId(id)) return fail("Bad photo id.");
  return (await removePhoto(id)) ? noContent() : fail("That photo isn't here anymore.", 404);
}

/** GET /api/photos/import : what the importer needs to skip. */
export async function importState(): Promise<ActionResult> {
  const { photos, removed } = await listPhotos();
  return ok({ have: photos.map((p) => p.id), removed, max: MAX_PHOTOS });
}
