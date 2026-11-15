import { emptyEnvelope, errorEnvelope, notConfigured, okEnvelope } from "./envelope";
import type { SourceEnvelope } from "./types";

// The two Home Base sources Hearth doesn't otherwise read: Homeroom (school
// hours and today's Connexus lessons) and Every Cent (the budget card). Each app
// exposes ONE read-only summary route for this feed, authenticated with a key
// made only for it (the apps store its SHA-256 digest as HOME_BASE_KEY_SHA256).
// Hearth holds the raw keys server-side; they never reach Home Base, which only
// ever holds its own Hearth token.
//
// Env (Railway, Hearth):
//   HOMEROOM_API_URL         default https://web-production-c7c82.up.railway.app
//   HOMEROOM_HOME_BASE_KEY   the key Homeroom's HOME_BASE_KEY_SHA256 accepts
//   EVERY_CENT_API_URL       default https://frontend-production-9f56.up.railway.app
//   EVERY_CENT_HOME_BASE_KEY the key Every Cent's HOME_BASE_KEY_SHA256 accepts

const HOMEROOM_DEFAULT = "https://web-production-c7c82.up.railway.app";
const EVERY_CENT_DEFAULT = "https://frontend-production-9f56.up.railway.app";

/** Homeroom reads Connexus through a headless browser, so it gets longer. */
const HOMEROOM_TIMEOUT = 25_000;
const EVERY_CENT_TIMEOUT = 10_000;

/** Largest upstream body accepted (a summary is a few KB). */
const MAX_BODY = 512 * 1024;

class RemoteHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/** GET one summary route with its key. Throws on a non-2xx, timeout or junk. */
async function getSummary(
  baseUrl: string,
  path: string,
  key: string,
  timeoutMs: number,
): Promise<{ body: Record<string, unknown>; fetchedAt: number }> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new RemoteHttpError(res.status);
  const text = await res.text();
  if (text.length > MAX_BODY) throw new Error("summary too large");
  const body = JSON.parse(text) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("summary is not a JSON object");
  }
  return { body: body as Record<string, unknown>, fetchedAt: Date.now() };
}

/** Map a thrown fetch error to an envelope (AbortSignal timeouts included). */
function remoteError<T>(source: string, err: unknown): SourceEnvelope<T> {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return emptyEnvelope("error", { code: "timeout", message: `${source} didn't answer in time.` });
  }
  if (err instanceof RemoteHttpError && (err.status === 401 || err.status === 404)) {
    // 404 = the app's feed is switched off; 401 = keys don't match. Both are a
    // setup problem on our side, not something Home Base can fix by retrying.
    console.error(`[home-base] ${source} refused the summary request (${err.status})`);
    return emptyEnvelope("error", {
      code: "integration_misconfigured",
      message: `${source} refused Hearth's request; Mitchell needs to check the connection.`,
    });
  }
  return errorEnvelope(source, err);
}

/** A nested section of an upstream summary, or undefined. */
function section(body: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const v = body[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * Wrap an upstream section the app already shaped for this feed. The app's own
 * status/error become the envelope's; everything else is `data`, minus the
 * status keys. A section the app reports as failed has no data.
 */
function fromSection<T>(
  source: string,
  sec: Record<string, unknown> | undefined,
  fetchedAt: number,
  dataAsOf: string | null,
): SourceEnvelope<T> {
  if (!sec) {
    return emptyEnvelope("error", {
      code: "upstream_error",
      message: `${source} sent no data for this section.`,
    });
  }
  const { status, error, ...rest } = sec;
  const err =
    error && typeof error === "object"
      ? {
          code: str((error as Record<string, unknown>).code) ?? "upstream_error",
          message: str((error as Record<string, unknown>).message) ?? `${source} reported a problem.`,
        }
      : null;
  if (status === "not_configured") {
    return emptyEnvelope("not_configured", err ?? { code: "not_configured", message: `${source} isn't set up.` });
  }
  if (status === "error") {
    return emptyEnvelope("error", err ?? { code: "upstream_error", message: `${source} reported a problem.` });
  }
  // An "ok" section that still carries an error (e.g. one child's planner
  // failed) is partial: some of it is missing.
  return okEnvelope(rest as T, fetchedAt, dataAsOf, status === "partial" || err ? "partial" : "ok", err);
}

// ── Homeroom: school_hours + lessons ───────────────────────────────────────

export interface HomeroomEnvelopes {
  school_hours: SourceEnvelope<unknown>;
  lessons: SourceEnvelope<unknown>;
}

export async function homeroomSources(date: string): Promise<HomeroomEnvelopes> {
  const key = process.env.HOMEROOM_HOME_BASE_KEY?.trim();
  if (!key) {
    return { school_hours: notConfigured("Homeroom"), lessons: notConfigured("Homeroom") };
  }
  const base = process.env.HOMEROOM_API_URL?.trim() || HOMEROOM_DEFAULT;
  try {
    const { body, fetchedAt } = await getSummary(
      base,
      `/api/home-base/summary?date=${encodeURIComponent(date)}`,
      key,
      HOMEROOM_TIMEOUT,
    );
    const hours = section(body, "school_hours");
    const lessons = section(body, "lessons");
    return {
      // School hours are as current as the family record's last change.
      school_hours: fromSection("Homeroom", hours, fetchedAt, str(hours?.record_updated_at)),
      // Lessons carry a fetched_at per child (cached Connexus reads keep their
      // real time); the section as a whole is as old as its stalest child.
      lessons: fromSection("Connexus", lessons, fetchedAt, oldestChildFetch(lessons)),
    };
  } catch (err) {
    const env = remoteError<unknown>("Homeroom", err);
    return { school_hours: env, lessons: env };
  }
}

/** The stalest per-child `fetched_at` in the lessons section, or null. */
function oldestChildFetch(lessons: Record<string, unknown> | undefined): string | null {
  const children = Array.isArray(lessons?.children) ? (lessons.children as Record<string, unknown>[]) : [];
  const times = children
    .map((c) => str(c?.fetched_at))
    .filter((t): t is string => t !== null)
    .sort();
  return times[0] ?? null;
}

// ── Every Cent: budget ─────────────────────────────────────────────────────

export async function budgetSource(date: string): Promise<SourceEnvelope<unknown>> {
  const key = process.env.EVERY_CENT_HOME_BASE_KEY?.trim();
  if (!key) return notConfigured("Every Cent");
  const base = process.env.EVERY_CENT_API_URL?.trim() || EVERY_CENT_DEFAULT;
  try {
    const { body, fetchedAt } = await getSummary(
      base,
      `/api/home-base/budget-summary?date=${encodeURIComponent(date)}`,
      key,
      EVERY_CENT_TIMEOUT,
    );
    // The numbers are computed live, but they only know the transactions the
    // banks have delivered, so the budget is as current as its stalest bank
    // sync (detail stays in `freshness.bank_sync`; `budget_updated_at` is just
    // the last Assigned change, not freshness).
    const bank = section(section(body, "freshness") ?? {}, "bank_sync");
    const data: Record<string, unknown> = { ...body };
    for (const k of ["generated_at", "date", "time_zone"]) delete data[k];
    return okEnvelope(data, fetchedAt, str(bank?.oldest_success_at) ?? str(bank?.last_success_at));
  } catch (err) {
    return remoteError("Every Cent", err);
  }
}
