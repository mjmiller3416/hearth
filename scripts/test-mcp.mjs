// End-to-end test of the ChatGPT connector: the OAuth 2.1 server and the MCP
// endpoint, against a real `next dev` with every upstream mocked.
//
//   npm run test:mcp                  # starts next dev on a spare port, runs, stops it
//   node scripts/test-mcp.mjs --base http://localhost:3000
//                                     # against a server you started yourself with the
//                                     # env below (TEST_ENV) — mocks on, same secrets
//
// Covers: discovery documents, DCR (public + confidential, bad redirect), the
// consent page (password form and device-cookie path, CSRF token, cancel, wrong
// password, rate limit), token exchange (PKCE failure, wrong redirect_uri,
// reused code revoking its tokens), MCP initialize / ping / tools/list /
// tools/call (read, write, delete, error), refresh rotation, an expired token,
// revocation, and that the wall's own routes still refuse a bearer token.
// Needs no dependencies (Node 20+: fetch, node:crypto, node:test-free asserts).

import { spawn, execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const baseArg = args.includes("--base") ? args[args.indexOf("--base") + 1] : null;
const PORT = 3917;
const BASE = baseArg ?? `http://localhost:${PORT}`;

const SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
const PASSWORD = "Maple Otter-lantern 42"; // checks the case/space normalization too
const DEVICE = "test-device-token";
// Hearth's own files (colors, allowance) go to a throwaway directory, so the
// suite never touches a developer's local .hearth-data.
const DATA_DIR = baseArg ? null : mkdtempSync(join(tmpdir(), "hearth-test-"));
const TEST_ENV = {
  ...(DATA_DIR ? { HEARTH_DATA_DIR: DATA_DIR } : {}),
  HEARTH_PUBLIC_URL: BASE,
  HEARTH_MCP_SECRET: SECRET,
  HEARTH_MCP_PASSWORD: "maple-otter-lantern-42",
  HEARTH_MCP_ENABLED: "1",
  HEARTH_DEVICE_TOKEN: DEVICE,
  HEARTH_CALENDAR_MOCK: "1",
  HEARTH_TASKS_MOCK: "1",
  HEARTH_MEALS_MOCK: "1",
  HEARTH_SCHEDULE_MOCK: "1",
  HOUSEHOLD_TIMEZONE: "America/New_York",
};

const RESOURCE = `${BASE}/api/mcp`;
const CHATGPT_REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const LOCAL_REDIRECT = "http://localhost:9/callback";

// ── Tiny test harness ──
let passed = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** "YYYY-MM-DD" plus whole days. */
const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const pkce = () => {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
};

async function req(path, opts = {}) {
  return fetch(`${BASE}${path}`, { redirect: "manual", ...opts });
}
const form = (obj) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", ...(obj.__headers ?? {}) },
  body: new URLSearchParams(Object.fromEntries(Object.entries(obj).filter(([k]) => k !== "__headers"))),
});

let rpcId = 0;
async function rpc(token, method, params) {
  const body = { jsonrpc: "2.0", method, ...(params ? { params } : {}) };
  if (!method.startsWith("notifications/")) body.id = ++rpcId;
  const res = await req("/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { res, json: text ? JSON.parse(text) : null };
}
const call = (token, name, args = {}) => rpc(token, "tools/call", { name, arguments: args });

// ── The consent page ──
function authorizeQuery(clientId, redirectUri, challenge, extra = {}) {
  return new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st-123",
    scope: "mcp",
    resource: RESOURCE,
    ...extra,
  });
}

/** Load the consent page; return its hidden fields and the nonce cookie. */
async function openConsent(query, cookie = "") {
  const res = await req(`/api/oauth/authorize?${query}`, { headers: cookie ? { cookie } : {} });
  const html = await res.text();
  const hidden = {};
  for (const m of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) {
    hidden[m[1]] = m[2].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  const nonce = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("hearth_oauth_nonce="));
  return { res, html, hidden, cookie: [cookie, nonce].filter(Boolean).join("; ") };
}

async function submitConsent(page, fields) {
  return req("/api/oauth/authorize", { ...form({ ...page.hidden, ...fields }), headers: {
    "content-type": "application/x-www-form-urlencoded", cookie: page.cookie } });
}

/** Run the whole browser half: consent with the password, return the code. */
async function getCode(clientId, redirectUri, challenge) {
  const page = await openConsent(authorizeQuery(clientId, redirectUri, challenge));
  const res = await submitConsent(page, { decision: "allow", password: PASSWORD });
  return new URL(res.headers.get("location")).searchParams.get("code");
}

async function exchange(fields, headers = {}) {
  const res = await req("/api/oauth/token", form({ ...fields, __headers: headers }));
  return { res, json: await res.json().catch(() => null) };
}

/** Sign a token exactly like src/lib/mcp/tokens.ts does (the test knows the secret). */
function forge(kind, prefix, payload) {
  const key = createHmac("sha256", SECRET).update(`hearth-mcp/${kind}`).digest();
  const head = `${prefix}.${b64url(JSON.stringify(payload))}`;
  return `${head}.${createHmac("sha256", key).update(head).digest("base64url")}`;
}

// ── Server lifecycle ──
let server = null;
async function startServer() {
  const nextBin = join("node_modules", "next", "dist", "bin", "next");
  server = spawn(process.execPath, [nextBin, "dev", "-p", String(PORT)], {
    env: { ...process.env, ...TEST_ENV, NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (server.exitCode !== null) throw new Error(`next dev exited:\n${log}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`next dev didn't come up:\n${log}`);
}
function stopServer() {
  if (!server || server.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // already gone
    }
  } else server.kill("SIGTERM");
}

// ── The tests ──
async function run() {
  console.log("Discovery");
  {
    const { res, json } = await rpc(null, "initialize", {});
    const www = res.headers.get("www-authenticate") ?? "";
    check("POST /api/mcp without a token → 401", res.status === 401, `got ${res.status}`);
    check(
      "401 carries resource_metadata and scope",
      www.includes(`resource_metadata="${BASE}/.well-known/oauth-protected-resource"`) &&
        www.includes('scope="mcp"'),
      www,
    );
    check("401 without a token has no invalid_token error", !www.includes("invalid_token") && json?.error === "unauthorized");

    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp"]) {
      const r = await req(path);
      const m = await r.json();
      check(`${path} is RFC 9728 metadata`, r.ok && m.resource === RESOURCE && m.authorization_servers?.[0] === BASE);
    }
    const as = await (await req("/.well-known/oauth-authorization-server")).json();
    check("AS metadata: issuer is the origin", as.issuer === BASE);
    check("AS metadata: S256 + iss parameter", as.code_challenge_methods_supported?.includes("S256") &&
      as.authorization_response_iss_parameter_supported === true);
    check("AS metadata: endpoints", as.token_endpoint === `${BASE}/api/oauth/token` &&
      as.registration_endpoint === `${BASE}/api/oauth/register` && as.authorization_endpoint === `${BASE}/api/oauth/authorize`);
    const oidc = await req("/.well-known/openid-configuration");
    check("no openid-configuration", oidc.status === 404, `got ${oidc.status}`);
  }

  console.log("Dynamic client registration");
  const reg = async (body) => {
    const r = await req("/api/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res: r, json: await r.json() };
  };
  const bad = await reg({ redirect_uris: ["https://evil.example/cb"] });
  check("foreign redirect URI refused", bad.res.status === 400 && bad.json.error === "invalid_redirect_uri");
  const pub = await reg({ redirect_uris: [LOCAL_REDIRECT], token_endpoint_auth_method: "none", client_name: "test" });
  check("public client registered (201, no secret)", pub.res.status === 201 && pub.json.client_id && !pub.json.client_secret);
  const conf = await reg({ redirect_uris: [CHATGPT_REDIRECT], client_name: "ChatGPT" });
  check("confidential client registered with a secret", conf.res.status === 201 && conf.json.client_secret &&
    conf.json.token_endpoint_auth_method === "client_secret_basic");
  const clientId = pub.json.client_id;

  console.log("Authorize");
  {
    const { challenge } = pkce();
    const unknown = await req(`/api/oauth/authorize?${authorizeQuery("hcl.bogus.sig", LOCAL_REDIRECT, challenge)}`);
    check("unknown client → error page, no redirect", unknown.status === 400 && !unknown.headers.get("location"));
    const wrongUri = await req(`/api/oauth/authorize?${authorizeQuery(clientId, "http://localhost:9/other", challenge)}`);
    check("unregistered redirect_uri → error page, no redirect", wrongUri.status === 400 && !wrongUri.headers.get("location"));
    const noPkce = await req(`/api/oauth/authorize?${authorizeQuery(clientId, LOCAL_REDIRECT, "", { code_challenge_method: "" })}`);
    const loc = new URL(noPkce.headers.get("location") ?? "http://x/");
    check("missing PKCE → redirect with error, state and iss",
      noPkce.status === 302 && loc.searchParams.get("error") === "invalid_request" &&
        loc.searchParams.get("state") === "st-123" && loc.searchParams.get("iss") === BASE);

    const page = await openConsent(authorizeQuery(clientId, LOCAL_REDIRECT, challenge));
    check("consent page asks for the password", page.res.status === 200 && page.html.includes('type="password"') &&
      page.html.includes("see and change everything you can"));
    check("consent page sets the CSRF nonce cookie", page.cookie.includes("hearth_oauth_nonce="));

    const wrong = await submitConsent(page, { decision: "allow", password: "nope" });
    check("wrong password → page again with a message", wrong.status === 400 && (await wrong.text()).includes("That password isn&#39;t right"));

    const forged = await submitConsent({ ...page, hidden: { ...page.hidden, form_token: "hfm.x.y" } }, { decision: "allow", password: PASSWORD });
    check("bad form token → expired page, no code", forged.status === 400 && !forged.headers.get("location"));

    const noCookie = await submitConsent({ ...page, cookie: "" }, { decision: "allow", password: PASSWORD });
    check("form without its nonce cookie → refused", noCookie.status === 400 && !noCookie.headers.get("location"));

    const cancel = await submitConsent(page, { decision: "cancel" });
    const cl = new URL(cancel.headers.get("location") ?? "http://x/");
    check("cancel → access_denied with state and iss", cl.searchParams.get("error") === "access_denied" &&
      cl.searchParams.get("state") === "st-123" && cl.searchParams.get("iss") === BASE);

    const device = await openConsent(authorizeQuery(clientId, LOCAL_REDIRECT, challenge), `hearth_device=${DEVICE}`);
    check("wall browser (device cookie) skips the password", device.res.status === 200 && !device.html.includes('type="password"'));
    const deviceAllow = await submitConsent(device, { decision: "allow" });
    const dl = new URL(deviceAllow.headers.get("location") ?? "http://x/");
    check("device-cookie consent issues a code", dl.searchParams.get("code")?.startsWith("hco.") && dl.searchParams.get("iss") === BASE);
  }

  console.log("Token exchange");
  const { verifier, challenge } = pkce();
  const code = await getCode(clientId, LOCAL_REDIRECT, challenge);
  check("password consent issues a code", Boolean(code));
  {
    const wrongUri = await exchange({ grant_type: "authorization_code", client_id: clientId, code,
      redirect_uri: "http://localhost:9/other", code_verifier: verifier });
    check("wrong redirect_uri → invalid_grant", wrongUri.res.status === 400 && wrongUri.json.error === "invalid_grant");
    const badPkce = await exchange({ grant_type: "authorization_code", client_id: clientId, code,
      redirect_uri: LOCAL_REDIRECT, code_verifier: pkce().verifier });
    check("PKCE mismatch → invalid_grant", badPkce.json?.error === "invalid_grant");
  }
  const good = await exchange({ grant_type: "authorization_code", client_id: clientId, code,
    redirect_uri: LOCAL_REDIRECT, code_verifier: verifier, resource: RESOURCE });
  check("code + verifier → tokens", good.res.status === 200 && good.json.token_type === "Bearer" &&
    good.json.expires_in === 3600 && good.json.scope === "mcp" && good.json.refresh_token);
  check("token response is no-store", good.res.headers.get("cache-control") === "no-store");
  let access = good.json.access_token;
  let refresh = good.json.refresh_token;

  {
    // A second connection, to show that reusing its code revokes its tokens.
    const p2 = pkce();
    const code2 = await getCode(clientId, LOCAL_REDIRECT, p2.challenge);
    const first = await exchange({ grant_type: "authorization_code", client_id: clientId, code: code2,
      redirect_uri: LOCAL_REDIRECT, code_verifier: p2.verifier });
    const again = await exchange({ grant_type: "authorization_code", client_id: clientId, code: code2,
      redirect_uri: LOCAL_REDIRECT, code_verifier: p2.verifier });
    check("reused code → invalid_grant", again.json?.error === "invalid_grant");
    const after = await rpc(first.json.access_token, "ping");
    check("reusing a code revokes the tokens it issued", after.res.status === 401);
  }
  {
    const p3 = pkce();
    const code3 = await getCode(conf.json.client_id, CHATGPT_REDIRECT, p3.challenge);
    const basic = (secret) => ({ authorization: `Basic ${Buffer.from(`${encodeURIComponent(conf.json.client_id)}:${encodeURIComponent(secret)}`).toString("base64")}` });
    const wrong = await exchange({ grant_type: "authorization_code", code: code3, redirect_uri: CHATGPT_REDIRECT,
      code_verifier: p3.verifier }, basic("wrong-secret"));
    check("confidential client with a wrong secret → 401 invalid_client", wrong.res.status === 401 && wrong.json.error === "invalid_client");
    const right = await exchange({ grant_type: "authorization_code", code: code3, redirect_uri: CHATGPT_REDIRECT,
      code_verifier: p3.verifier }, basic(conf.json.client_secret));
    check("confidential client with client_secret_basic → tokens", right.res.status === 200 && right.json.access_token);
  }

  console.log("MCP");
  {
    const init = await rpc(access, "initialize", {
      protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" },
    });
    check("initialize", init.json?.result?.serverInfo?.name === "hearth" &&
      init.json.result.protocolVersion === "2025-06-18" && init.json.result.capabilities?.tools);
    const note = await rpc(access, "notifications/initialized");
    check("notifications/initialized → 202", note.res.status === 202);
    const ping = await rpc(access, "ping");
    check("ping", ping.json?.result && Object.keys(ping.json.result).length === 0);
    const list = await rpc(access, "tools/list");
    const tools = list.json?.result?.tools ?? [];
    check("tools/list returns 22 tools", tools.length === 22, `got ${tools.length}`);
    check("every tool has a schema and annotations", tools.every((t) =>
      t.inputSchema?.type === "object" && typeof t.annotations?.readOnlyHint === "boolean" &&
      t.annotations.openWorldHint === false && t.description));
    const del = tools.find((t) => t.name === "delete_event");
    check("delete_event is marked destructive", del?.annotations?.destructiveHint === true);

    const hh = await call(access, "get_household");
    const household = hh.json?.result?.structuredContent;
    check("get_household (read)", household?.timezone === "America/New_York" && household.members?.length > 0);
    const today = household?.today;

    const events = await call(access, "list_events", { start_date: today, end_date: today.slice(0, 8) + "28" });
    const evs = events.json?.result?.structuredContent?.events;
    check("list_events (read)", Array.isArray(evs) && events.json.result.content?.[0]?.type === "text", JSON.stringify(events.json).slice(0, 300));

    check("list_events gives each event's Google copies", Array.isArray(evs) && evs.length > 0 &&
      evs.every((e) => Array.isArray(e.copies) && e.copies.length > 0 && e.copies.every((c) => c.calendar_id && c.event_id)));

    // ── Reminders (Maryann's own; mock store) ──
    const month = await call(access, "list_events", { start_date: today, end_date: addDays(today, 27) });
    const all = month.json?.result?.structuredContent?.events ?? [];
    const timed = all.find((e) => !e.all_day && Number(e.start.slice(11, 13)) >= 10);
    const allDay = all.find((e) => e.all_day);
    check("reminder fixtures: a timed event after 10 a.m. and an all-day event", Boolean(timed && allDay));
    if (timed) {
      const got = await call(access, "get_event_reminders", { target: timed.target });
      const info = got.json?.result?.structuredContent;
      check("get_event_reminders lists copies with refs, access, time zone",
        info?.copies?.length > 0 && info.copies.every((c) => c.calendar_id && c.event_id && c.access_role && c.time_zone) &&
        info.suggested_copy?.event_id, JSON.stringify(got.json).slice(0, 300));
      const ref = info?.suggested_copy ?? {};
      const dry = await call(access, "update_event_reminders", { ...ref, preset: "appointment", dry_run: true });
      const plan = dry.json?.result?.structuredContent;
      check("dry run plans five pop-ups without saving", plan?.saved === false && plan.would_set?.length === 5,
        JSON.stringify(dry.json).slice(0, 300));
      const saved = await call(access, "update_event_reminders", { ...ref, preset: "appointment" });
      const res = saved.json?.result?.structuredContent;
      const morning = res?.after?.popups?.find((p) => p.label === "8:00 AM the morning of");
      check("appointment preset saves, reads back verified and preserved",
        res?.saved === true && res.verified === true && res.preserved === true && res.after.popups.length === 5,
        JSON.stringify(saved.json).slice(0, 400));
      check("the 8 a.m. reminder fires at 8:00 on the event's day",
        morning?.fires_at === `${timed.start.slice(0, 10)}T08:00`, JSON.stringify(morning));
      check("1 week / 3 days / 1 day / 1 hour are in the set",
        [10080, 4320, 1440, 60].every((m) => res?.after?.popups?.some((p) => p.minutes === m)));
      const again = await call(access, "get_event_reminders", { target: timed.target });
      const copy = again.json?.result?.structuredContent?.copies?.find((c) => c.event_id === ref.event_id);
      check("get_event_reminders then reports appointment_set", copy?.appointment_check?.status === "appointment_set");
      const checked = await call(access, "check_appointment_reminders", { start_date: today, end_date: addDays(today, 27) });
      check("check_appointment_reminders sees it up to date",
        (checked.json?.result?.structuredContent?.up_to_date ?? []).some((c) => c.event_id === ref.event_id),
        JSON.stringify(checked.json).slice(0, 300));
      const custom = await call(access, "update_event_reminders", { ...ref, minutes: [30, 30, 120] });
      check("custom minutes save (deduped)", custom.json?.result?.structuredContent?.after?.popups?.length === 2);
      const tooFar = await call(access, "update_event_reminders", { ...ref, minutes: [50000] });
      check("minutes past 4 weeks are refused", tooFar.json?.result?.isError === true);
      const both = await call(access, "update_event_reminders", { ...ref, minutes: [30], preset: "appointment" });
      check("preset and minutes together are refused", both.json?.result?.isError === true);
    }
    if (allDay) {
      const got = await call(access, "get_event_reminders", { target: allDay.target });
      const ref = got.json?.result?.structuredContent?.suggested_copy ?? {};
      const flagged = await call(access, "update_event_reminders", { ...ref, preset: "appointment" });
      check("all-day events are flagged, not guessed",
        flagged.json?.result?.isError === true && /all-day/.test(flagged.json.result.content[0].text));
    }
    // Edge times, when the mock happens to have them: 8:00 (flagged) and 9:00 (four, not five).
    for (const [hour, expect] of [["08", "flag"], ["09", 4]]) {
      const e = all.find((x) => !x.all_day && x.start.slice(11, 16) === `${hour}:00`);
      if (!e) continue;
      const got = await call(access, "get_event_reminders", { target: e.target });
      const ref = got.json?.result?.structuredContent?.suggested_copy ?? {};
      const dry = await call(access, "update_event_reminders", { ...ref, preset: "appointment", dry_run: true });
      if (expect === "flag") {
        check("an 8:00 start is flagged, not guessed",
          dry.json?.result?.isError === true && /8 a\.m\./.test(dry.json.result.content[0].text));
      } else {
        const plan = dry.json?.result?.structuredContent;
        check("a 9:00 start gets four reminders and says why", plan?.would_set?.length === 4 && plan.notes?.length === 1);
      }
    }
    const outside = await call(access, "update_event_reminders", { calendar_id: "evil@example.com", event_id: "x", minutes: [30] });
    check("update_event_reminders refuses a calendar Hearth doesn't read", outside.json?.result?.isError === true);

    const member = household.members[0].key;
    const created = await call(access, "create_event", {
      title: "MCP test dentist", start: `${today}T15:00`, members: [member], reminder_minutes: 30,
    });
    const ev = created.json?.result?.structuredContent?.event;
    check("create_event (write)", !created.json?.result?.isError && ev?.title === "MCP test dentist",
      JSON.stringify(created.json).slice(0, 300));

    check("a one-person event also gets a copy on the family calendar",
      (ev?.copies ?? []).some((c) => c.calendarId === "family@example.com") && ev.copies.length === 2,
      JSON.stringify(ev?.copies));
    const everyone = await call(access, "create_event", { title: "MCP test family dinner", start: `${today}T18:00` });
    const fam = everyone.json?.result?.structuredContent?.event;
    check("a whole-family event is one event on the family calendar",
      fam?.copies?.length === 1 && fam.copies[0].calendarId === "family@example.com", JSON.stringify(fam?.copies));
    if (fam?.hearthGroupId) await call(access, "delete_event", { target: { hearth_group_id: fam.hearthGroupId } });

    const badMember = await call(access, "create_event", { title: "x", start: `${today}T15:00`, members: ["nobody"] });
    check("a refused write comes back as isError with a sentence",
      badMember.json?.result?.isError === true && /Unknown member/.test(badMember.json.result.content[0].text));

    const target = ev?.hearthGroupId ? { hearth_group_id: ev.hearthGroupId } : { calendar_id: ev?.calendarId, event_id: ev?.id };
    const removed = await call(access, "delete_event", { target });
    check("delete_event (delete)", removed.json?.result?.structuredContent?.ok === true, JSON.stringify(removed.json).slice(0, 300));
    const synthetic = await call(access, "delete_event", { target: { calendar_id: "evil@example.com", event_id: "x" } });
    check("delete_event refuses a calendar Hearth doesn't read", synthetic.json?.result?.isError === true);

    const next = await call(access, "get_next_cleaning_task");
    const task = next.json?.result?.structuredContent?.task;
    check("get_next_cleaning_task", next.json?.result && !next.json.result.isError);
    if (task) {
      const done = await call(access, "complete_task", { task_id: task.id });
      const completionId = done.json?.result?.structuredContent?.completionId;
      check("complete_task", Boolean(completionId), JSON.stringify(done.json).slice(0, 300));
      const undone = await call(access, "undo_task_completion", { completion_id: completionId });
      check("undo_task_completion", undone.json?.result?.structuredContent?.ok === true);
    }
    const outsider = await call(access, "complete_task", { task_id: "t1", member_id: "u-stranger" });
    check("complete_task refuses a member off the allowlist", outsider.json?.result?.isError === true);

    const added = await call(access, "add_shopping_item", { name: "mcp test milk" });
    check("add_shopping_item", ["added", "reactivated", "already_listed"].includes(added.json?.result?.structuredContent?.status));
    const listed = await call(access, "get_shopping_list");
    check("get_shopping_list sees it", (listed.json?.result?.structuredContent?.items ?? []).some((i) => /mcp test milk/i.test(i.name)));
    // Allowance: parent-entered balances (nothing is synced from Greenlight).
    const setBal = await call(access, "set_allowance_balance", { member: "Lincoln", amount: "$12.50", note: "mcp test" });
    const setRow = (setBal.json?.result?.structuredContent?.balances ?? []).find((b) => b.memberKey === "lincoln");
    check("set_allowance_balance stores cents and labels the source", setRow?.cents === 1250 && setRow.source === "manual" && setRow.note === "mcp test");
    const getBal = await call(access, "get_allowance");
    const getRows = getBal.json?.result?.structuredContent?.balances ?? [];
    check("get_allowance lists every kid, unset ones as null", getRows.length === 2 && getRows.find((b) => b.memberKey === "ollie")?.cents === null);
    const badKid = await call(access, "set_allowance_balance", { member: "mitchell", amount: "5" });
    check("set_allowance_balance refuses someone who isn't a kid", badKid.json?.result?.isError === true);
    const badAmt = await call(access, "set_allowance_balance", { member: "lincoln", amount: "a lot" });
    check("set_allowance_balance refuses a non-amount", badAmt.json?.result?.isError === true);

    const plan = await call(access, "list_meal_plan");
    check("list_meal_plan", Array.isArray(plan.json?.result?.structuredContent?.meals));
    const sched = await call(access, "get_kids_schedule");
    check("get_kids_schedule", Array.isArray(sched.json?.result?.structuredContent?.activities));

    const unknown = await call(access, "no_such_tool");
    check("unknown tool → JSON-RPC error", unknown.json?.error?.code === -32602);
    const get = await req("/api/mcp", { headers: { authorization: `Bearer ${access}` } });
    check("GET /api/mcp → 405", get.status === 405);
  }

  console.log("Wall routes stay device-only");
  {
    const anon = await req("/api/calendar?start=2026-01-01&end=2026-01-02");
    check("GET /api/calendar without the device cookie → 401", anon.status === 401);
    const bearer = await req("/api/calendar?start=2026-01-01&end=2026-01-02", { headers: { authorization: `Bearer ${access}` } });
    check("an MCP access token doesn't open wall routes", bearer.status === 401);

    // The wall's routes now run the shared actions; make sure they still answer as before.
    const cookie = { cookie: `hearth_device=${DEVICE}` };
    const cal = await req("/api/calendar?start=2026-01-01&end=2026-02-01", { headers: cookie });
    const calJson = await cal.json();
    check("wall: GET /api/calendar with the device cookie → events", cal.status === 200 && Array.isArray(calJson.events) && calJson.configured === true);
    const notJson = await req("/api/calendar/events", { method: "POST", headers: { ...cookie, "content-type": "application/json" }, body: "{" });
    check("wall: bad JSON → 400 with the wall's message", notJson.status === 400 && (await notJson.json()).error === "Request body must be JSON.");
    const noTitle = await req("/api/calendar/events", { method: "POST", headers: { ...cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "", allDay: true, start: "2026-01-01", end: "2026-01-01", memberKeys: [] }) });
    check("wall: create validation unchanged", noTitle.status === 400 && (await noTitle.json()).error === "Give the event a title.");
    const shop = await req("/api/shopping/items", { method: "POST", headers: { ...cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "wall test eggs" }) });
    check("wall: POST /api/shopping/items → 200", shop.status === 200 && (await shop.json()).status);
    const rooms = await req("/api/tasks/rooms", { headers: cookie });
    check("wall: GET /api/tasks/rooms → 200", rooms.status === 200 && Array.isArray((await rooms.json()).rooms));
    const undoBad = await req("/api/tasks/undo", { method: "POST", headers: { ...cookie, "content-type": "application/json" }, body: JSON.stringify({ completionId: "c", memberId: "u-stranger" }) });
    check("wall: undo as a stranger → 403", undoBad.status === 403);
    // Allowance on the wall: who can read what, and the parent PIN.
    const jsonPost = (path, method, body) => req(path, { method, headers: { ...cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
    const own = await (await req("/api/allowance?viewer=lincoln", { headers: cookie })).json();
    check("wall: a kid's lens reads their own balance", own.balance?.cents === 1250 && own.balance.source === "manual");
    const sibling = await (await req("/api/allowance?viewer=ollie", { headers: cookie })).json();
    check("wall: a sibling's lens never gets the other kid's", sibling.balance?.memberKey === "ollie" && sibling.balance.cents === null);
    const adultView = await (await req("/api/allowance?viewer=maryann", { headers: cookie })).json();
    check("wall: an adult's lens gets no amounts without the PIN", adultView.balance === null);
    const status0 = await (await req("/api/allowance", { headers: cookie })).json();
    check("wall: no PIN yet, and no amounts without a viewer", status0.pinSet === false && status0.balance === null);
    const noPin = await jsonPost("/api/allowance/unlock", "POST", { pin: "1234" });
    check("wall: unlock before a PIN exists → 409", noPin.status === 409);
    const shortPin = await jsonPost("/api/allowance/pin", "POST", { next: "12" });
    check("wall: a too-short PIN → 400", shortPin.status === 400);
    const madePin = await jsonPost("/api/allowance/pin", "POST", { next: "4821" });
    check("wall: first PIN is created", madePin.status === 200);
    const rePin = await jsonPost("/api/allowance/pin", "POST", { next: "9999" });
    check("wall: changing the PIN needs the current one", rePin.status === 403);
    const wrong = await jsonPost("/api/allowance/unlock", "POST", { pin: "0000" });
    check("wall: wrong PIN → 403", wrong.status === 403);
    const wrongPut = await jsonPost("/api/allowance", "PUT", { pin: "0000", memberKey: "ollie", amount: "100" });
    check("wall: wrong PIN can't set a balance", wrongPut.status === 403);
    const unlocked = await jsonPost("/api/allowance/unlock", "POST", { pin: "4821" });
    check("wall: right PIN lists both kids", unlocked.status === 200 && (await unlocked.json()).balances.length === 2);
    const put = await jsonPost("/api/allowance", "PUT", { pin: "4821", memberKey: "ollie", amount: "7" });
    check("wall: right PIN sets a balance", put.status === 200 && (await put.json()).balances.find((b) => b.memberKey === "ollie").cents === 700);
    const cleared = await jsonPost("/api/allowance", "PUT", { pin: "4821", memberKey: "ollie", amount: "" });
    check("wall: an empty amount clears it", cleared.status === 200 && (await cleared.json()).balances.find((b) => b.memberKey === "ollie").cents === null);
    const noCookie = await req("/api/allowance?viewer=lincoln");
    check("wall: allowance without the device cookie → 401", noCookie.status === 401);
    // Four more wrong PINs (two above) trip the limit; then even the right one waits.
    for (let i = 0; i < 4; i++) await jsonPost("/api/allowance/unlock", "POST", { pin: "0000" });
    const lockedOut = await jsonPost("/api/allowance/unlock", "POST", { pin: "4821" });
    check("wall: too many wrong PINs → 429", lockedOut.status === 429);

    const sched = await req("/api/schedule?week=2026-11-16", { headers: cookie });
    check("wall: GET /api/schedule → 200", sched.status === 200 && (await sched.json()).weekStart === "2026-11-16");
    const card = await req("/api/meals/nope", { headers: cookie });
    check("wall: GET /api/meals/[id] → 200", card.status === 200);
  }

  console.log("Refresh, expiry, revocation");
  {
    const r1 = await exchange({ grant_type: "refresh_token", client_id: clientId, refresh_token: refresh });
    check("refresh → new pair", r1.res.status === 200 && r1.json.refresh_token && r1.json.refresh_token !== refresh);
    const r2 = await exchange({ grant_type: "refresh_token", client_id: clientId, refresh_token: refresh });
    check("the old refresh token is refused after rotation", r2.json?.error === "invalid_grant");
    const otherClient = await exchange({ grant_type: "refresh_token", client_id: conf.json.client_id,
      client_secret: conf.json.client_secret, refresh_token: r1.json.refresh_token });
    check("another client can't use the refresh token", otherClient.json?.error === "invalid_grant");
    access = r1.json.access_token;
    refresh = r1.json.refresh_token;
    check("the new access token works", (await rpc(access, "ping")).res.status === 200);

    const cid = createHash("sha256").update(clientId).digest("base64url").slice(0, 22);
    const expired = forge("access", "hat", { cid, fam: "x", sc: "mcp", aud: RESOURCE, exp: Math.floor(Date.now() / 1000) - 5 });
    const ex = await rpc(expired, "ping");
    const www = ex.res.headers.get("www-authenticate") ?? "";
    check("expired token → 401 with invalid_token and resource_metadata",
      ex.res.status === 401 && www.includes('error="invalid_token"') && www.includes("resource_metadata="));
    const wrongAud = forge("access", "hat", { cid, fam: "y", sc: "mcp", aud: "https://elsewhere/api/mcp", exp: Math.floor(Date.now() / 1000) + 600 });
    check("token for another resource → 401", (await rpc(wrongAud, "ping")).res.status === 401);

    const rev = await req("/api/oauth/revoke", form({ client_id: clientId, token: refresh }));
    check("revoke → 200", rev.status === 200);
    check("revoked connection's access token → 401", (await rpc(access, "ping")).res.status === 401);
    const r3 = await exchange({ grant_type: "refresh_token", client_id: clientId, refresh_token: refresh });
    check("revoked connection's refresh token → invalid_grant", r3.json?.error === "invalid_grant");
  }

  console.log("Password rate limit");
  {
    const { challenge: c } = pkce();
    let last = "";
    for (let i = 0; i < 6; i++) {
      const page = await openConsent(authorizeQuery(clientId, LOCAL_REDIRECT, c));
      last = await (await submitConsent(page, { decision: "allow", password: `wrong-${i}` })).text();
    }
    check("too many wrong passwords → told to wait", last.includes("Too many wrong tries"));
    const page = await openConsent(authorizeQuery(clientId, LOCAL_REDIRECT, c));
    const blocked = await submitConsent(page, { decision: "allow", password: PASSWORD });
    check("even the right password waits out the limit", blocked.status === 400 && !blocked.headers.get("location"));
  }
}

try {
  if (!baseArg) {
    console.log(`Starting next dev on :${PORT} with mocks…`);
    await startServer();
  }
  await run();
} catch (err) {
  failures.push(`crashed: ${err.stack ?? err}`);
  console.error(err);
} finally {
  stopServer();
  if (DATA_DIR) rmSync(DATA_DIR, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
