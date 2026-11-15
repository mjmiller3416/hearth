// One-time Google sign-in for the reminder account (Maryann), so Hearth can read
// and set HER event reminders. Google keeps reminders private to each user, so
// the household account's token can't do it (src/lib/google/token.ts).
//
// Run from D:\Dev\hearth (Windows; the folder is `railway link`ed to project
// hearth / production / service hearth) under `railway run`, which supplies
// GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and MEMBERS from Railway (they aren't
// in .env.local):
//
//   railway run -- node scripts/google-reminder-consent.mjs link
//       Prints the sign-in link. Maryann opens it, signs in with HER account and
//       allows access. Google sends her to the OAuth Playground page (the
//       redirect this OAuth client already has registered; the household token
//       was captured the same way). She copies that page's whole address.
//
//   railway run -- node scripts/google-reminder-consent.mjs finish <file>
//       <file> holds that address. Never pass the address itself on the command
//       line: `railway run` goes through cmd.exe on Windows, where its `&`s split
//       it into commands (`&code=…` once launched VS Code).
//       Within about 10 minutes (Google's codes are short-lived): exchanges the
//       code, checks the account is the reminder member's own calendar, and sets
//       GOOGLE_REMINDER_REFRESH_TOKEN on Railway through stdin (never printed,
//       never on a command line), which redeploys Hearth.
//       --print prints the token instead of setting it.
//       --force sets it even if the account isn't the member's calendar.
//
// Scopes: calendar.events (read an event's reminders and patch them) and
// calendar.calendarlist.readonly (her access role, time zone and default
// reminders per calendar).

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REDIRECT = "https://developers.google.com/oauthplayground";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
const STATE_FILE = join(tmpdir(), "hearth-reminder-consent.state");

const [mode, addressFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET aren't set. Run this under `railway run --`.");
  process.exit(1);
}

/** The reminder member's own calendar id, from MEMBERS. */
function memberCalendar() {
  const key = process.env.GOOGLE_REMINDER_MEMBER || "maryann";
  try {
    const m = JSON.parse(process.env.MEMBERS || "[]").find((x) => x.key === key);
    return { key, calendarId: m?.calendarId ?? null };
  } catch {
    return { key, calendarId: null };
  }
}

if (mode === "link") {
  const state = randomBytes(16).toString("hex");
  writeFileSync(STATE_FILE, state);
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    state,
  }).toString();
  console.log(auth.toString());
  process.exit(0);
}

if (mode !== "finish" || !addressFile) {
  console.error("Usage: railway run -- node scripts/google-reminder-consent.mjs link | finish <file-with-address> [--print] [--force]");
  process.exit(1);
}

// ── finish ──
let url;
try {
  url = new URL(readFileSync(addressFile, "utf8").trim());
} catch {
  console.error("That isn't an address.");
  process.exit(1);
}
if (url.searchParams.get("error")) {
  console.error(`Google said: ${url.searchParams.get("error")}`);
  process.exit(1);
}
let saved = "";
try {
  saved = readFileSync(STATE_FILE, "utf8").trim();
} catch {
  /* no link made on this machine */
}
if (!saved || url.searchParams.get("state") !== saved) {
  console.error("That address is from a different sign-in link. Make a new link and try again.");
  process.exit(1);
}
const code = url.searchParams.get("code");
if (!code) {
  console.error("No code in that address.");
  process.exit(1);
}

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
  console.error("(Codes expire after a few minutes and work once: make a new link.)");
  process.exit(1);
}
rmSync(STATE_FILE, { force: true });

const granted = String(tokens.scope ?? "").split(" ");
const missing = SCOPES.filter((s) => !granted.includes(s));
// Which account signed in: its primary calendar's id is its address.
const who = await fetch(
  "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary?fields=id",
  { headers: { authorization: `Bearer ${tokens.access_token}` } },
).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const member = memberCalendar();
console.log(`Signed in as: ${who?.id ?? "(couldn't read the account)"}`);
console.log(`${member.key}'s calendar in MEMBERS: ${member.calendarId ?? "(not found)"}`);
if (missing.length) {
  console.error(`Not all access was allowed (missing ${missing.join(", ")}). She needs to tick every box. Nothing was set.`);
  process.exit(1);
}
const matches = who?.id && member.calendarId && who.id.toLowerCase() === member.calendarId.toLowerCase();
if (!matches && !flags.has("--force")) {
  console.error(`That isn't ${member.key}'s own account, so her reminders wouldn't be the ones set. Nothing was set (--force to set it anyway).`);
  process.exit(1);
}

if (flags.has("--print")) {
  console.log(`GOOGLE_REMINDER_REFRESH_TOKEN=${tokens.refresh_token}`);
  process.exit(0);
}
const set = spawnSync("railway", ["variable", "set", "GOOGLE_REMINDER_REFRESH_TOKEN", "--stdin"], {
  input: tokens.refresh_token,
  encoding: "utf8",
  shell: process.platform === "win32", // railway is a .cmd/.exe shim on Windows
});
if (set.status !== 0) {
  console.error("Setting it on Railway failed:", (set.stderr || set.stdout || "").split("\n").filter((l) => !/Config as Code|Migrate|keep working/.test(l)).join("\n"));
  console.error("Run again with --print and set it by hand.");
  process.exit(1);
}
console.log("Set GOOGLE_REMINDER_REFRESH_TOKEN on Railway; Hearth is redeploying.");
