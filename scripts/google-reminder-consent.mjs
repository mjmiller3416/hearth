// One-time Google sign-in for the reminder account (Maryann), so Hearth can read
// and set HER event reminders. Google keeps reminders private to each user, so
// the household account's token can't do it (src/lib/google/token.ts).
//
//   node --env-file=.env.local scripts/google-reminder-consent.mjs
//
// Uses the same OAuth client as the household token (GOOGLE_CLIENT_ID /
// GOOGLE_CLIENT_SECRET from the environment; nothing is read from or written to
// any file). It prints a Google sign-in link. Maryann opens it, signs in with HER
// account and allows access. Google then sends her browser to
// http://localhost:8765/callback:
//   * on this computer, the script catches it by itself;
//   * anywhere else the page won't load — copy the whole address from the
//     browser's address bar and paste it here.
// The script prints the refresh token and the account it belongs to. Set it on
// Railway as GOOGLE_REMINDER_REFRESH_TOKEN (and GOOGLE_REMINDER_MEMBER=maryann).
//
// Scopes: calendar.events (read an event's reminders and patch them) and
// calendar.calendarlist.readonly (her access role, time zone and default
// reminders per calendar). If Google answers "redirect_uri_mismatch", add
// http://localhost:8765/callback to the OAuth client's authorized redirect URIs
// in Google Cloud Console (APIs & Services → Credentials) and run it again.

import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";

const PORT = 8765;
const REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set (try --env-file=.env.local).");
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
auth.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT,
  response_type: "code",
  scope: SCOPES.join(" "),
  access_type: "offline",
  prompt: "consent", // always return a refresh token
  include_granted_scopes: "false",
  state,
}).toString();

console.log("\nSend this link to Maryann (she signs in with HER Google account):\n");
console.log(auth.toString());
console.log(`\nWaiting for the sign-in. If the browser ends on a page that won't load,`);
console.log("paste that page's whole address here and press Enter:\n");

/** The authorization code from a callback URL, checking state. */
function codeFrom(raw) {
  let url;
  try {
    url = new URL(raw.trim(), REDIRECT);
  } catch {
    return { error: "That isn't an address." };
  }
  if (url.searchParams.get("error")) return { error: `Google said: ${url.searchParams.get("error")}` };
  if (url.searchParams.get("state") !== state) return { error: "That address is from a different sign-in." };
  const code = url.searchParams.get("code");
  return code ? { code } : { error: "No code in that address." };
}

const code = await new Promise((resolve) => {
  const server = createServer((req, res) => {
    const got = codeFrom(req.url ?? "");
    res.writeHead(got.code ? 200 : 400, { "content-type": "text/plain; charset=utf-8" });
    res.end(got.code ? "Done. You can close this tab." : got.error);
    if (got.code) finish(got.code);
  });
  server.on("error", () => {}); // port busy: paste mode still works
  server.listen(PORT, "127.0.0.1");
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    const got = codeFrom(line);
    if (got.code) finish(got.code);
    else console.log(got.error);
  });
  function finish(c) {
    server.close();
    rl.close();
    resolve(c);
  }
});

const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT,
    grant_type: "authorization_code",
  }),
});
const tokens = await tokenRes.json();
if (!tokenRes.ok || !tokens.refresh_token) {
  console.error("Google didn't return a refresh token:", tokens.error_description ?? tokens.error ?? tokenRes.status);
  process.exit(1);
}

// Which account signed in: its primary calendar's id is its address.
const who = await fetch(
  "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary?fields=id",
  { headers: { authorization: `Bearer ${tokens.access_token}` } },
).then((r) => (r.ok ? r.json() : null)).catch(() => null);

console.log(`\nSigned in as: ${who?.id ?? "(couldn't read the account)"}`);
console.log(`Scopes granted: ${tokens.scope}`);
console.log("\nSet these on Railway (service hearth), then redeploy:");
console.log("  GOOGLE_REMINDER_MEMBER=maryann");
console.log(`  GOOGLE_REMINDER_REFRESH_TOKEN=${tokens.refresh_token}\n`);
