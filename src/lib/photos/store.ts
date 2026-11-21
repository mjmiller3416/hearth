import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { dataDir, isDurable, readDataFile, writeDataFile } from "@/lib/settings/dataDir";
import type { PhotoInfo } from "./types";

// The family photos Home cycles through. SERVER-ONLY.
//
// They live in Hearth's own data directory (the Railway volume): one JPEG per
// photo under photos/, plus photos.json listing them. Photos arrive already
// resized (about 1600px on the long side), from a phone through Settings or
// from the bulk importer on the home server (scripts/import-photos.mjs).
//
// A photo someone removes is remembered by id in `removed`, so the importer
// doesn't put it straight back the next time it runs.

const INDEX = "photos.json";
const DIR = "photos";

/** The most photos kept. At ~300 KB each this is well under a gigabyte. */
export const MAX_PHOTOS = 1000;
/** The largest single upload accepted. A 1600px JPEG is a tenth of this. */
export const MAX_BYTES = 4 * 1024 * 1024;

const ID = /^[0-9a-f]{16,64}$/;

interface Index {
  photos: PhotoInfo[];
  removed: string[];
}

export function isPhotoId(id: string): boolean {
  return ID.test(id);
}

/** A JPEG starts FF D8 FF. Anything else is refused. */
export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** The id for a picture uploaded without one: a hash of its bytes. */
export function idForBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 32);
}

async function readIndex(): Promise<Index> {
  const parsed = await readDataFile<Partial<Index>>(INDEX);
  return {
    photos: Array.isArray(parsed?.photos)
      ? parsed.photos.filter((p) => p && typeof p.id === "string" && isPhotoId(p.id))
      : [],
    removed: Array.isArray(parsed?.removed) ? parsed.removed.filter((id) => typeof id === "string") : [],
  };
}

async function photoPath(id: string): Promise<string> {
  return path.join(await dataDir(), DIR, `${id}.jpg`);
}

// One read-modify-write of the index at a time (Hearth runs one instance).
let chain: Promise<unknown> = Promise.resolve();
function queued<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.catch(() => {});
  return run;
}

export async function listPhotos(): Promise<{ photos: PhotoInfo[]; removed: string[]; durable: boolean }> {
  const index = await readIndex();
  return { ...index, durable: await isDurable() };
}

export type AddResult = "added" | "exists" | "removed" | "full";

/**
 * Keep one photo. "exists" when it is already here, "removed" when someone
 * took it down (the importer must not put it back; `force` is a person adding
 * it again on purpose), "full" at the limit.
 */
export function addPhoto(
  id: string,
  bytes: Uint8Array,
  takenAt: string | null,
  force = false,
): Promise<AddResult> {
  return queued(async () => {
    const index = await readIndex();
    if (index.photos.some((p) => p.id === id)) return "exists";
    if (index.removed.includes(id) && !force) return "removed";
    if (index.photos.length >= MAX_PHOTOS) return "full";
    const file = await photoPath(id);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
    await writeDataFile(INDEX, {
      photos: [...index.photos, { id, takenAt }],
      removed: index.removed.filter((r) => r !== id),
    } satisfies Index);
    return "added";
  });
}

/** Take one photo down and remember that it was. False when it isn't here. */
export function removePhoto(id: string): Promise<boolean> {
  return queued(async () => {
    const index = await readIndex();
    if (!index.photos.some((p) => p.id === id)) return false;
    await writeDataFile(INDEX, {
      photos: index.photos.filter((p) => p.id !== id),
      removed: [...index.removed.filter((r) => r !== id), id],
    } satisfies Index);
    await fs.rm(await photoPath(id), { force: true });
    return true;
  });
}

/** The JPEG bytes of one listed photo, or null. */
export async function readPhoto(id: string): Promise<Buffer | null> {
  if (!isPhotoId(id)) return null;
  const index = await readIndex();
  if (!index.photos.some((p) => p.id === id)) return null;
  try {
    return await fs.readFile(await photoPath(id));
  } catch {
    return null;
  }
}
