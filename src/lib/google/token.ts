// Google OAuth: exchange the household refresh token for an access token and
// cache it in memory until just before it expires (Phase 1 #1).
//
// There is ONE household Google account with read access to all four family
// calendars (spec §5.1) — one refresh token, not four. The refresh token lives
// only in the environment and never leaves the server. This module hands the
// calendar client a bearer token and refreshes it lazily.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// Refresh a bit early so an in-flight request never races the expiry.
const EXPIRY_MARGIN_MS = 60_000;

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cached: CachedToken | null = null;
// Collapse concurrent refreshes (e.g. four calendars syncing at once) into one.
let inFlight: Promise<string> | null = null;

/** True when all three Google OAuth secrets are present. */
export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN,
  );
}

async function refresh(): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? "",
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token refresh failed (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000 - EXPIRY_MARGIN_MS,
  };
  return cached.accessToken;
}

/**
 * A valid access token, from cache when fresh. Pass `force` after a 401 to
 * discard the cache and mint a new one (the calendar client does this on an
 * unauthorized events.list — a token can be revoked before its stated expiry).
 */
export async function getAccessToken(force = false): Promise<string> {
  if (!force && cached && Date.now() < cached.expiresAt) {
    return cached.accessToken;
  }
  if (force) cached = null;
  // Reuse an in-flight refresh so parallel callers share one network round-trip.
  if (!inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
