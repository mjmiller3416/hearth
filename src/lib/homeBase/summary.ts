import { resolveTimeZone } from "@/lib/calendar/recurrence";
import { zonedFields } from "@/lib/calendar/dates";
import { fail, ok, type ActionResult } from "@/lib/action";
import { addDaysIso, calendarSource, choresSource, mealsSource, scheduleSource, type DayRange } from "./local";
import { budgetSource, homeroomSources } from "./remote";
import { SCHEMA_VERSION, type HomeBaseSummary } from "./types";

// GET /api/home-base/summary — the one read-only feed behind Maryann's Home Base
// dashboard. It fans out to every household source at once (each with its own
// time limit) and returns one envelope per source, so a slow or broken app
// shows up as that section's error instead of failing the whole response.
//
// Read-only by construction: it calls only GET-side client functions and the
// two apps' read-only summary routes. It writes nothing anywhere.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 7;

/** The household's today, "YYYY-MM-DD". */
function todayIso(tz: string): string {
  const f = zonedFields(new Date(), tz);
  return `${f.y}-${String(f.m).padStart(2, "0")}-${String(f.d).padStart(2, "0")}`;
}

/** True for a real calendar date (rejects 2026-02-30). */
function isRealDate(iso: string): boolean {
  if (!DATE_RE.test(iso)) return false;
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;
}

/** Build the summary for `date` (default today) over `days` days (default 1). */
export async function homeBaseSummary(
  dateParam: string | null,
  daysParam: string | null,
): Promise<ActionResult> {
  const timeZone = resolveTimeZone();
  const today = todayIso(timeZone);
  const date = dateParam?.trim() || today;
  if (!isRealDate(date)) return fail("date must be a real date in YYYY-MM-DD form.");

  let days = 1;
  if (daysParam !== null && daysParam.trim() !== "") {
    days = Number(daysParam);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      return fail(`days must be a whole number from 1 to ${MAX_DAYS}.`);
    }
  }

  const range: DayRange = {
    dates: Array.from({ length: days }, (_, i) => addDaysIso(date, i)),
    timeZone,
    startsToday: date === today,
  };

  const [calendar, school_schedule, meals, chores, homeroom, budget] = await Promise.all([
    calendarSource(range),
    scheduleSource(range),
    mealsSource(range),
    choresSource(range),
    homeroomSources(date),
    budgetSource(date),
  ]);

  const summary: HomeBaseSummary = {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    date,
    days,
    time_zone: timeZone,
    sources: {
      calendar,
      school_schedule,
      lessons: homeroom.lessons,
      school_hours: homeroom.school_hours,
      meals,
      chores,
      budget,
    },
  };
  return ok(summary);
}
