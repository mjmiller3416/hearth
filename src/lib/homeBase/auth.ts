import { createHash, timingSafeEqual } from "node:crypto";

// Authentication for the Home Base summary feed (GET /api/home-base/summary).
//
// Home Base is Maryann's own dashboard site. Its server calls this feed with a
// bearer token made for that one purpose; the token is NOT the wall's device
// cookie, NOT a ChatGPT OAuth token and grants nothing else in Hearth. Only the
// summary route accepts it, and the summary route accepts nothing else.
//
// Hearth has no database, so the accepted tokens are configured as SHA-256
// digests in HOME_BASE_TOKEN_SHA256 (comma-separated lowercase hex; more than one
// lets a new token go in before the old one comes out). The raw token is never
// stored here or logged. Make one with `node scripts/home-base-token.mjs`.
//   - Unset/empty  → the feed is off: the route answers 404.
//   - Revoke       → remove the digest on Railway (the redeploy drops it).
//
// A small in-process rate limit bounds the upstream fan-out a leaked token, or a
// runaway refresh loop, could cause.

const ENV = "HOME_BASE_TOKEN_SHA256";
const HEX64 = /^[0-9a-f]{64}$/;

/** Requests allowed per window, across all callers (one household, one site). */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const recent: number[] = [];

/** The configured digests, ignoring blanks and malformed entries. */
function acceptedDigests(): Buffer[] {
  const raw = process.env[ENV] ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => HEX64.test(s))
    .map((s) => Buffer.from(s, "hex"));
}

/** True when the feed is switched on (at least one valid digest configured). */
export function isHomeBaseEnabled(): boolean {
  return acceptedDigests().length > 0;
}

/** Constant-time check of a presented token against every accepted digest. */
export function tokenAccepted(token: string): boolean {
  if (!token) return false;
  const presented = createHash("sha256").update(token, "utf8").digest();
  let match = false;
  // Compare against every digest (no early exit) so timing can't tell which.
  for (const digest of acceptedDigests()) {
    if (timingSafeEqual(presented, digest)) match = true;
  }
  return match;
}

/** Record one request; false when the window is already full. */
function underRateLimit(now = Date.now()): boolean {
  while (recent.length && now - recent[0] >= RATE_WINDOW_MS) recent.shift();
  if (recent.length >= RATE_LIMIT) return false;
  recent.push(now);
  return true;
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });

/**
 * Route gate for the summary feed. Returns a Response to send back (404 off,
 * 401 bad/missing token, 429 over the limit) or null to proceed. Call as the
 * route handler's first statement:
 *
 *   const denied = await requireHomeBaseToken(req);
 *   if (denied) return denied;
 */
export async function requireHomeBaseToken(req: Request): Promise<Response | null> {
  if (!isHomeBaseEnabled()) return new Response("Not Found", { status: 404 });

  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match || !tokenAccepted(match[1])) {
    return json(
      401,
      { error: "A valid Home Base token is required." },
      { "www-authenticate": 'Bearer realm="home-base"' },
    );
  }

  if (!underRateLimit()) {
    return json(429, { error: "Too many requests; try again in a minute." }, { "retry-after": "60" });
  }
  return null;
}

/** Test hook: forget recorded requests. */
export function resetHomeBaseRateLimit(): void {
  recent.length = 0;
}
