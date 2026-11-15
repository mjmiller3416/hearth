// Google OAuth: exchange a refresh token for an access token and cache it in
// memory until just before it expires (Phase 1 #1).
//
// Two Google accounts, one OAuth client (GOOGLE_CLIENT_ID / _SECRET):
//
//   * The HOUSEHOLD account (GOOGLE_REFRESH_TOKEN): a dedicated account every
//     family calendar is shared into with write access (spec §5.1). Every read
//     and every event write goes through it — one token, not four.
//   * The REMINDER account (GOOGLE_REMINDER_REFRESH_TOKEN, optional): the person
//     whose phone alarms the reminder tools set (Maryann). Google keeps an
//     event's reminders private to each user, so reminders written as the
//     household account only ever alert the household account. Reading and
//     setting someone's reminders needs their own token; it is used for nothing
//     else (src/lib/google/reminders.ts).
//
// Refresh tokens live only in the environment and never leave the server.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// Refresh a bit early so an in-flight request never races the expiry.
const EXPIRY_MARGIN_MS = 60_000;

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

/** One account's token cache: the cached access token and any refresh under way. */
interface TokenSlot {
  envKey: "GOOGLE_REFRESH_TOKEN" | "GOOGLE_REMINDER_REFRESH_TOKEN";
  cached: CachedToken | null;
  // Collapse concurrent refreshes (e.g. four calendars syncing at once) into one.
  inFlight: Promise<string> | null;
}

const household: TokenSlot = { envKey: "GOOGLE_REFRESH_TOKEN", cached: null, inFlight: null };
const reminder: TokenSlot = { envKey: "GOOGLE_REMINDER_REFRESH_TOKEN", cached: null, inFlight: null };

/** True when the OAuth client is configured (shared by both accounts). */
function hasClient(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** True when all three household Google OAuth secrets are present. */
export function isGoogleConfigured(): boolean {
  return hasClient() && Boolean(process.env.GOOGLE_REFRESH_TOKEN);
}

/** True when the reminder account's refresh token is present too. */
export function isReminderAccountConfigured(): boolean {
  return hasClient() && Boolean(process.env.GOOGLE_REMINDER_REFRESH_TOKEN);
}

/** Mint a new access token for one account and cache it. */
async function refresh(slot: TokenSlot): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: process.env[slot.envKey] ?? "",
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
    throw new Error(`Google token refresh failed for ${slot.envKey} (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  slot.cached = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000 - EXPIRY_MARGIN_MS,
  };
  return slot.cached.accessToken;
}

/** A valid access token for one account, from cache when fresh. */
function tokenFor(slot: TokenSlot, force: boolean): Promise<string> {
  if (!force && slot.cached && Date.now() < slot.cached.expiresAt) {
    return Promise.resolve(slot.cached.accessToken);
  }
  if (force) slot.cached = null;
  // Reuse an in-flight refresh so parallel callers share one network round-trip.
  if (!slot.inFlight) {
    slot.inFlight = refresh(slot).finally(() => {
      slot.inFlight = null;
    });
  }
  return slot.inFlight;
}

/**
 * A valid household access token, from cache when fresh. Pass `force` after a
 * 401 to discard the cache and mint a new one (the calendar client does this on
 * an unauthorized events.list — a token can be revoked before its stated expiry).
 */
export async function getAccessToken(force = false): Promise<string> {
  return tokenFor(household, force);
}

/** A valid access token for the reminder account (see the header). */
export async function getReminderAccessToken(force = false): Promise<string> {
  return tokenFor(reminder, force);
}
