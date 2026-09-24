import type { ScheduleActivity, TandemChild } from "./types";

// The Tandem HTTP client (Schedule view, read-only). Server-side only: the API
// key is read here and sent as the `X-API-Key` header, and never reaches the
// browser (spec §3.2). Same shape as the Enchanted Spoon client: thin HTTP plus
// normalization, with errors thrown for the route to turn into a 502 so the
// stale-data contract keeps the last good render (spec §6.2).
//
// Hearth calls `${TANDEM_API_URL}/api/hearth/week`. TANDEM_API_URL is Tandem's
// public frontend origin; its /api proxy forwards to the private backend. The
// wire shape (snake_case, "HH:MM:SS" times) is Tandem's HearthWeekOut, normalized
// here to Hearth's camelCase types with "HH:MM" times and string ids.

function baseUrl(): string {
  const url = process.env.TANDEM_API_URL?.replace(/\/+$/, "");
  if (!url) throw new Error("TANDEM_API_URL is not set");
  return `${url}/api/hearth`;
}

function authHeaders(): HeadersInit {
  const token = process.env.TANDEM_API_KEY;
  if (!token) throw new Error("TANDEM_API_KEY is not set");
  return { "x-api-key": token };
}

// ── Wire shapes (Tandem → Hearth) ───────────────────────────────────────────
interface RawActivity {
  id: number | string;
  child: string;
  name: string;
  day: string;
  start_time: string;
  end_time: string;
  important: boolean;
}

interface RawWeek {
  week_start: string;
  activities: RawActivity[];
}

/** "10:15:00" → "10:15". */
const hhmm = (time: string) => time.slice(0, 5);

function normalizeActivity(a: RawActivity): ScheduleActivity | null {
  // Tandem only knows these two children today; drop anything else rather than
  // render a lane Hearth has no color for.
  if (a.child !== "link" && a.child !== "ollie") return null;
  return {
    id: String(a.id),
    child: a.child as TandemChild,
    name: a.name,
    day: a.day,
    start: hhmm(a.start_time),
    end: hhmm(a.end_time),
    important: Boolean(a.important),
  };
}

/** GET /week → every activity in the Monday–Friday week containing `week`. */
export async function getWeek(
  week: string,
): Promise<{ weekStart: string; activities: ScheduleActivity[] }> {
  const res = await fetch(`${baseUrl()}/week?week=${encodeURIComponent(week)}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Tandem GET /week failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as RawWeek;
  return {
    weekStart: data.week_start,
    activities: (data.activities ?? [])
      .map(normalizeActivity)
      .filter((a): a is ScheduleActivity => a !== null),
  };
}
