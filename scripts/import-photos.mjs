// Bulk-import family photos into Hearth from folders on this computer.
//
//   node scripts/import-photos.mjs --url https://<hearth> --token-file <file> \
//        [--max 300] [--dry-run] <folder> [<folder> ...]
//
// For every JPEG or PNG in the folders (not their subfolders) it makes a copy
// no longer than 1600px on its long side, turned the right way up, and sends
// that to Hearth. The originals are only read. Running it again sends nothing
// that is already there, and never puts back a photo someone removed on the
// wall: a photo's id is a hash of the resized picture, so the same picture in
// two albums is one photo.
//
// "When taken" comes from a Google Takeout sidecar (<name>.supplemental-
// metadata.json or <name>.json) when there is one, else the file's own date.
//
// The token is the photo importer's own (HEARTH_PHOTOS_TOKEN_SHA256 on the
// server holds its digest). Make one with:
//   node scripts/home-base-token.mjs <file>
// It is read from the file and never printed.
//
// Needs `sharp`, which is already in node_modules (Next.js depends on it).
// Run with Windows Node from the repo folder.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const MAX_EDGE = 1600;
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args.splice(i, 2)[1] ?? null;
};
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};

const url = (opt("--url") ?? "").replace(/\/+$/, "");
const tokenFile = opt("--token-file");
const max = Number(opt("--max") ?? 300);
const dryRun = flag("--dry-run");
const folders = args;

if (!url || !tokenFile || folders.length === 0 || !Number.isFinite(max)) {
  console.error(
    "usage: node scripts/import-photos.mjs --url https://<hearth> --token-file <file> [--max 300] [--dry-run] <folder> [<folder> ...]",
  );
  process.exit(1);
}
const token = readFileSync(tokenFile, "utf8").trim();
const auth = { authorization: `Bearer ${token}` };

/** When a photo was taken: the Takeout sidecar's time, else the file's date. */
function takenAt(file) {
  for (const sidecar of [`${file}.supplemental-metadata.json`, `${file}.json`]) {
    if (!existsSync(sidecar)) continue;
    try {
      const seconds = Number(JSON.parse(readFileSync(sidecar, "utf8")).photoTakenTime?.timestamp);
      if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString();
    } catch {
      // An unreadable sidecar just means falling back to the file's date.
    }
  }
  return statSync(file).mtime.toISOString();
}

const files = [];
for (const folder of folders) {
  for (const name of readdirSync(folder).sort()) {
    if (/\.(jpe?g|png)$/i.test(name)) files.push(join(folder, name));
  }
}
console.log(`${files.length} picture(s) found in ${folders.length} folder(s).`);

const stateRes = await fetch(`${url}/api/photos/import`, { headers: auth });
if (!stateRes.ok) {
  console.error(`Hearth refused the importer (${stateRes.status}). Is HEARTH_PHOTOS_TOKEN_SHA256 set to this token's digest?`);
  process.exit(1);
}
const state = await stateRes.json();
const have = new Set(state.have);
const removed = new Set(state.removed);
console.log(`Hearth has ${have.size} photo(s); ${removed.size} were removed there and stay away.`);

let added = 0;
let skipped = 0;
let failed = 0;
for (const file of files) {
  if (have.size >= Math.min(max, state.max)) {
    console.log(`Stopping at ${have.size} photos (the limit for this run).`);
    break;
  }
  try {
    const jpeg = await sharp(file)
      .rotate() // apply the camera's orientation, then drop it
      .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const id = createHash("sha256").update(jpeg).digest("hex").slice(0, 32);
    if (have.has(id) || removed.has(id)) {
      skipped += 1;
      continue;
    }
    if (!dryRun) {
      const res = await fetch(`${url}/api/photos/import/${id}`, {
        method: "PUT",
        headers: { ...auth, "content-type": "image/jpeg", "x-photo-taken": takenAt(file) },
        body: jpeg,
      });
      if (!res.ok) throw new Error(`Hearth answered ${res.status}`);
    }
    have.add(id);
    added += 1;
  } catch (e) {
    failed += 1;
    console.error(`  could not import one picture: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`${dryRun ? "Would add" : "Added"} ${added}, already there or removed ${skipped}, failed ${failed}.`);
process.exit(failed > 0 ? 1 : 0);
