import { createHash, timingSafeEqual } from "node:crypto";

// Authentication for the bulk photo importer (/api/photos/import…).
//
// The importer runs on the home server, not in a paired browser, so it has its
// own bearer token made for that one job. It can list which photos Hearth has
// and add photos; it cannot read a photo back, remove one, or touch anything
// else. Accepted tokens are SHA-256 digests in HEARTH_PHOTOS_TOKEN_SHA256
// (comma-separated hex). Unset → the import routes answer 404. Make a token
// with `node scripts/home-base-token.mjs <out-file>` (the same generator).

const ENV = "HEARTH_PHOTOS_TOKEN_SHA256";
const HEX64 = /^[0-9a-f]{64}$/;

function acceptedDigests(): Buffer[] {
  return (process.env[ENV] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => HEX64.test(s))
    .map((s) => Buffer.from(s, "hex"));
}

function tokenAccepted(token: string): boolean {
  const presented = createHash("sha256").update(token, "utf8").digest();
  let match = false;
  // Compare against every digest (no early exit) so timing can't tell which.
  for (const digest of acceptedDigests()) {
    if (timingSafeEqual(presented, digest)) match = true;
  }
  return match;
}

/**
 * Route gate for the import routes. Returns a Response to send back (404 when
 * importing is off, 401 for a bad or missing token) or null to proceed. Call
 * as the route handler's first statement.
 */
export async function requirePhotosToken(req: Request): Promise<Response | null> {
  if (acceptedDigests().length === 0) return new Response("Not Found", { status: 404 });
  const match = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
  if (!match || !tokenAccepted(match[1])) {
    return new Response(JSON.stringify({ error: "A valid photo import token is required." }), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="hearth-photos"' },
    });
  }
  return null;
}
