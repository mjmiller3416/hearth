// End-to-end test of the Home Base feed (GET /api/home-base/summary) against a
// real `next dev` with every Hearth upstream mocked, plus a fake Homeroom and
// Every Cent served from this process.
//
//   npm run test:home-base     # starts next dev on :3918, runs, stops it
//
// Covers: token auth (missing, wrong, device cookie, the token on a wall route),
// date/days validation, the envelope for every source, today-only chores, the
// two remote apps' mapping (data_as_of from their own freshness), an upstream
// key mismatch, an upstream timeout, that upstream keys never echo back, and
// the rate limit. Run it on its own: two `next dev`s can't share `.next`.

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { join } from "node:path";

const PORT = 3918;
const FAKE_PORT = 3919;
const BASE = `http://localhost:${PORT}`;
const TOKEN = "hb_test-token-for-home-base-0123456789";
const HOMEROOM_KEY = "hb_homeroom-key-abc";
const EVERY_CENT_KEY = "hb_every-cent-key-xyz";
const sha = (s) => createHash("sha256").update(s).digest("hex");

const TEST_ENV = {
  HEARTH_DEVICE_TOKEN: "test-device-token",
  HEARTH_MCP_ENABLED: "0",
  HEARTH_CALENDAR_MOCK: "1",
  HEARTH_TASKS_MOCK: "1",
  HEARTH_MEALS_MOCK: "1",
  HEARTH_SCHEDULE_MOCK: "1",
  HOUSEHOLD_TIMEZONE: "America/New_York",
  // Two digests: rotation means any listed token works.
  HOME_BASE_TOKEN_SHA256: `${sha("hb_old-token")},${sha(TOKEN)}`,
  HOMEROOM_API_URL: `http://localhost:${FAKE_PORT}/homeroom`,
  HOMEROOM_HOME_BASE_KEY: HOMEROOM_KEY,
  EVERY_CENT_API_URL: `http://localhost:${FAKE_PORT}/every-cent`,
  EVERY_CENT_HOME_BASE_KEY: EVERY_CENT_KEY,
};

// ── Tiny harness ──
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

// ── Fake Homeroom + Every Cent ──
// `mode` switches what they answer, per test.
const mode = { homeroom: "ok", everyCent: "ok" };
const seen = { homeroomAuth: null, everyCentAuth: null, homeroomDate: null };

const HOMEROOM_BODY = {
  generated_at: "2026-11-15T20:00:00.000Z",
  date: "2026-11-15",
  time_zone: "America/New_York",
  school_hours: {
    status: "ok",
    error: null,
    record_updated_at: "2026-11-15T18:30:00.000Z",
    children: [{ child: "lincoln", name: "Lincoln", date_minutes: 95, week_minutes: null }],
  },
  lessons: {
    status: "partial",
    error: { code: "bridge_timeout", message: "Ollie's planner didn't load." },
    children: [
      { child: "lincoln", status: "ok", fetched_at: "2026-11-15T19:55:00.000Z", cached: true, lessons: [] },
      { child: "ollie", status: "error", fetched_at: null, cached: false, lessons: null },
    ],
  },
};
const EVERY_CENT_BODY = {
  generated_at: "2026-11-15T20:00:00.000Z",
  date: "2026-11-15",
  month: "2026-11",
  safe_to_spend_cents: 12345,
  freshness: {
    budget_updated_at: "2026-11-15T17:00:00.000Z",
    bank_sync: { last_success_at: "2026-11-15T12:00:00.000Z", status: "fresh" },
  },
};

const fake = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${FAKE_PORT}`);
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/homeroom/api/home-base/summary") {
    seen.homeroomAuth = req.headers.authorization ?? null;
    seen.homeroomDate = url.searchParams.get("date");
    if (mode.homeroom === "unauthorized") return send(401, { error: "no" });
    return send(200, HOMEROOM_BODY);
  }
  if (url.pathname === "/every-cent/api/home-base/budget-summary") {
    seen.everyCentAuth = req.headers.authorization ?? null;
    if (mode.everyCent === "slow") {
      setTimeout(() => send(200, EVERY_CENT_BODY), 11_000);
      return;
    }
    return send(200, EVERY_CENT_BODY);
  }
  send(404, { error: "not found" });
});

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
      if ((await fetch(`${BASE}/health`)).ok) return;
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

let requests = 0;
async function summary(query = "", headers = { authorization: `Bearer ${TOKEN}` }) {
  requests++;
  const res = await fetch(`${BASE}/api/home-base/summary${query}`, { headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { res, json, text };
}

/** The household's today in New York, like the server works it out. */
function nyToday() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

const SOURCES = ["calendar", "school_schedule", "lessons", "school_hours", "meals", "chores", "budget"];
const isIso = (v) => typeof v === "string" && !Number.isNaN(Date.parse(v));

async function run() {
  console.log("Authentication");
  {
    const none = await summary("", {});
    check("no token → 401", none.res.status === 401);
    check("401 names the Bearer scheme", (none.res.headers.get("www-authenticate") ?? "").startsWith("Bearer"));
    check("wrong token → 401", (await summary("", { authorization: "Bearer hb_nope" })).res.status === 401);
    check("token without Bearer → 401", (await summary("", { authorization: TOKEN })).res.status === 401);
    const cookie = await summary("", { cookie: `hearth_device=${TEST_ENV.HEARTH_DEVICE_TOKEN}` });
    check("the wall's device cookie doesn't open the feed", cookie.res.status === 401);
    const wall = await fetch(`${BASE}/api/calendar?start=2026-11-01&end=2026-11-30`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    check("the Home Base token doesn't open a wall route", wall.status === 401);
    const post = await fetch(`${BASE}/api/home-base/summary`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    check("POST is not allowed", post.status === 405, `got ${post.status}`);
    const old = await summary("", { authorization: "Bearer hb_old-token" });
    check("a second listed digest also works (rotation)", old.res.status === 200);
  }

  console.log("Validation");
  {
    check("bad date → 400", (await summary("?date=15-11-2026")).res.status === 400);
    check("impossible date → 400", (await summary("?date=2026-02-30")).res.status === 400);
    check("days=8 → 400", (await summary("?days=8")).res.status === 400);
    check("days=0 → 400", (await summary("?days=0")).res.status === 400);
  }

  const today = nyToday();
  console.log("Today's summary");
  {
    const { res, json, text } = await summary();
    check("200", res.status === 200, `got ${res.status}`);
    check("no-store", res.headers.get("cache-control") === "no-store");
    check("schema_version + generated_at", typeof json?.schema_version === "string" && isIso(json?.generated_at));
    check("date defaults to the household's today", json?.date === today, `got ${json?.date}`);
    check("days defaults to 1", json?.days === 1);
    check("time_zone", json?.time_zone === "America/New_York");
    check("every source has an envelope", SOURCES.every((s) => json?.sources?.[s] && "status" in json.sources[s]
      && "fetched_at" in json.sources[s] && "data_as_of" in json.sources[s] && "error" in json.sources[s] && "data" in json.sources[s]));

    const cal = json?.sources?.calendar;
    check("calendar ok with events", cal?.status === "ok" && Array.isArray(cal?.data?.events));
    const ev = cal?.data?.events?.[0];
    if (ev) {
      check("calendar ids are stable and carry no calendar address", /^(hearth:|gcal:)/.test(ev.id) && !ev.id.includes("@"));
      check("each event lists the requested days it touches", Array.isArray(ev.dates) && ev.dates.every((d) => d === today));
      check("timed events carry the zone; all-day ones don't",
        cal.data.events.every((e) => (e.all_day ? e.time_zone === null : e.time_zone === "America/New_York")));
    }
    check("calendar has no raw calendar ids", !JSON.stringify(cal).includes("calendarId"));

    const chores = json?.sources?.chores;
    check("chores ok today", chores?.status === "ok" && Array.isArray(chores?.data?.kids));
    check("chores carry no scores or counts", !/decay|score|streak|count/i.test(JSON.stringify(chores?.data ?? {})));
    check("meals ok", json?.sources?.meals?.status === "ok" && Array.isArray(json.sources.meals.data?.scheduled));
    check("schedule ok", json?.sources?.school_schedule?.status === "ok");

    const hours = json?.sources?.school_hours;
    check("school_hours ok, data_as_of = Homeroom's record time",
      hours?.status === "ok" && hours?.data_as_of === "2026-11-15T18:30:00.000Z");
    check("school_hours keeps nulls as nulls", hours?.data?.children?.[0]?.week_minutes === null);
    check("school_hours envelope fields aren't duplicated into data", hours?.data && !("status" in hours.data));
    const lessons = json?.sources?.lessons;
    check("lessons partial with Homeroom's error", lessons?.status === "partial" && lessons?.error?.code === "bridge_timeout");
    check("lessons data_as_of = the stalest child's fetch", lessons?.data_as_of === "2026-11-15T19:55:00.000Z");
    const budget = json?.sources?.budget;
    check("budget ok, data_as_of = the bank's sync time, not the last Assigned change",
      budget?.status === "ok" && budget?.data_as_of === "2026-11-15T12:00:00.000Z");
    check("budget keeps the bank freshness", budget?.data?.freshness?.bank_sync?.status === "fresh");
    check("Hearth sent each app its own key", seen.homeroomAuth === `Bearer ${HOMEROOM_KEY}`
      && seen.everyCentAuth === `Bearer ${EVERY_CENT_KEY}`);
    check("Hearth passed the date to Homeroom", seen.homeroomDate === today);
    check("no upstream key or Home Base token in the response",
      !text.includes(HOMEROOM_KEY) && !text.includes(EVERY_CENT_KEY) && !text.includes(TOKEN));
  }

  console.log("Another date");
  {
    const tomorrow = addDays(today, 1);
    const { json } = await summary(`?date=${tomorrow}&days=3`);
    check("date and days echo back", json?.date === tomorrow && json?.days === 3);
    check("chores say today-only for another date",
      json?.sources?.chores?.status === "unavailable_for_date" && json.sources.chores.data === null);
    const dates = new Set([tomorrow, addDays(tomorrow, 1), addDays(tomorrow, 2)]);
    check("calendar events fall in the range",
      (json?.sources?.calendar?.data?.events ?? []).every((e) => e.dates.every((d) => dates.has(d))));
  }

  console.log("Upstream failures");
  {
    mode.homeroom = "unauthorized";
    mode.everyCent = "slow";
    const started = Date.now();
    const { res, json } = await summary();
    const took = Date.now() - started;
    check("still 200 when two apps fail", res.status === 200);
    check("Homeroom key mismatch → integration_misconfigured on both its sections",
      json?.sources?.school_hours?.error?.code === "integration_misconfigured"
        && json?.sources?.lessons?.status === "error" && json.sources.lessons.data === null);
    check("Every Cent too slow → timeout", json?.sources?.budget?.error?.code === "timeout");
    check("the other sources are unaffected", json?.sources?.calendar?.status === "ok");
    check("the response is bounded by the time limit", took < 15_000, `${took} ms`);
    mode.homeroom = "ok";
    mode.everyCent = "ok";
  }

  console.log("Rate limit");
  {
    let limited = null;
    for (let i = requests; i < 40 && !limited; i++) {
      const r = await summary("?days=1");
      if (r.res.status === 429) limited = r;
    }
    check("too many requests → 429 with Retry-After", limited?.res.headers.get("retry-after") === "60");
  }
}

try {
  await new Promise((r) => fake.listen(FAKE_PORT, r));
  console.log(`Starting next dev on :${PORT} with mocks…`);
  await startServer();
  await run();
} catch (err) {
  failures.push(`crashed: ${err.stack ?? err}`);
  console.error(err);
} finally {
  stopServer();
  fake.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
process.exit(0);
