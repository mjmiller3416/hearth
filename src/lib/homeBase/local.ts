import { getMemberByKey, getDefaultMemberKey, getFamilyCalendarId } from "@/lib/calendar/config";
import { eventCoversDay, parseBoundary } from "@/lib/calendar/dates";
import { zonedWallToUtc } from "@/lib/calendar/recurrence";
import type { CalendarEvent } from "@/lib/calendar/types";
import { getEventsWithStatus } from "@/lib/google/calendar";
import { isMockEnabled } from "@/lib/google/mock";
import { isGoogleConfigured } from "@/lib/google/token";
import { hasReadCalendars } from "@/lib/calendar/config";
import { getMealPlan } from "@/lib/spoon/client";
import { hasSpoonCredentials } from "@/lib/spoon/config";
import { isMealsMockEnabled, mockMealPlan } from "@/lib/spoon/mock";
import type { PlannedMeal } from "@/lib/spoon/types";
import { getDoneToday, getKidsChores } from "@/lib/tada/client";
import { getAdultId, getKids, getMemberKeyForTadaId, hasTadaCredentials } from "@/lib/tada/config";
import { isTasksMockEnabled, mockDoneToday, mockKids } from "@/lib/tada/mock";
import { getWeek } from "@/lib/tandem/client";
import { getMemberKeyForChild, getScheduleKids, hasTandemCredentials } from "@/lib/tandem/config";
import { isScheduleMockEnabled, mockWeek } from "@/lib/tandem/mock";
import { mondayOf } from "@/lib/tandem/week";
import type { ScheduleActivity } from "@/lib/tandem/types";
import { emptyEnvelope, errorEnvelope, notConfigured, okEnvelope, withTimeout } from "./envelope";
import type {
  CalendarData,
  CalendarItem,
  ChoresData,
  MealItem,
  MealsData,
  Person,
  ScheduleData,
  SourceEnvelope,
} from "./types";

// The four Home Base sources Hearth already reads for the wall: Google Calendar,
// Tandem, Enchanted Spoon and Tada!. Each returns its own envelope and never
// throws. All read-only: these call only the GET side of each client.

/** Per-source time budgets (ms). */
const CALENDAR_TIMEOUT = 10_000;
const APP_TIMEOUT = 8_000;

/** The requested days, as the summary passes them around. */
export interface DayRange {
  /** Every requested "YYYY-MM-DD", in order. */
  dates: string[];
  timeZone: string;
  /** True when the range starts on the household's today. */
  startsToday: boolean;
}

/** "YYYY-MM-DD" shifted by whole days (UTC arithmetic, so no zone can move it). */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A member key resolved to the feed's person shape. */
function person(key: string, fallbackName?: string): Person {
  return { key, name: getMemberByKey(key)?.name ?? fallbackName ?? key };
}

// ── calendar ───────────────────────────────────────────────────────────────

/** The UTC instant of household midnight starting `iso`. */
function midnight(iso: string, tz: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return zonedWallToUtc(y, m - 1, d, 0, 0, 0, tz);
}

function calendarItem(ev: CalendarEvent, range: DayRange): CalendarItem | null {
  const dates = range.dates.filter((iso) => eventCoversDay(ev, parseBoundary(iso), range.timeZone));
  if (dates.length === 0) return null;

  // Who it's for: explicit tags first, else the owning calendar's person.
  const familyCal = getFamilyCalendarId();
  const owner = ev.defaultMemberKey ?? getDefaultMemberKey(ev.calendarId);
  const keys = ev.memberKeys.length ? ev.memberKeys : owner ? [owner] : [];
  const ownerKey = owner ?? (ev.calendarId === familyCal ? "family" : "other");
  // All-day ends are Google-exclusive; the feed gives the last covered day.
  const lastDay = ev.allDay ? addDaysIso(ev.end, -1) : ev.end;

  return {
    id: ev.hearthGroupId ? ev.id : `gcal:${ownerKey}:${ev.id}`,
    title: ev.title,
    all_day: ev.allDay,
    start: ev.start,
    end: ev.allDay && lastDay < ev.start ? ev.start : lastDay,
    time_zone: ev.allDay ? null : range.timeZone,
    dates,
    assignees: keys.map((k) => person(k)),
    family: keys.length === 0,
    recurring: ev.recurring,
    countdown: ev.countdown,
  };
}

export async function calendarSource(range: DayRange): Promise<SourceEnvelope<CalendarData>> {
  if (!isMockEnabled() && !(isGoogleConfigured() && hasReadCalendars())) {
    return notConfigured("The calendar");
  }
  try {
    // Fetch a day either side, then keep what touches the requested days in the
    // household zone (all-day dates are floating, so the UTC window alone isn't
    // exact).
    const first = range.dates[0];
    const last = range.dates[range.dates.length - 1];
    const start = midnight(addDaysIso(first, -1), range.timeZone);
    const end = midnight(addDaysIso(last, 2), range.timeZone);
    const read = await withTimeout(getEventsWithStatus(start, end), CALENDAR_TIMEOUT);
    const fetchedAt = Date.now();

    const events = read.events
      .map((ev) => calendarItem(ev, range))
      .filter((e): e is CalendarItem => e !== null)
      .sort((a, b) =>
        a.dates[0] !== b.dates[0]
          ? a.dates[0].localeCompare(b.dates[0])
          : a.all_day !== b.all_day
            ? a.all_day ? -1 : 1
            : parseBoundary(a.start).getTime() - parseBoundary(b.start).getTime(),
      );

    if (read.calendarCount > 0 && read.failedCount === read.calendarCount) {
      return emptyEnvelope("error", {
        code: "upstream_error",
        message: "No family calendar could be read right now.",
      });
    }
    const partial = read.failedCount > 0;
    return okEnvelope(
      { events },
      fetchedAt,
      read.oldestSyncAt,
      partial ? "partial" : "ok",
      partial
        ? {
            code: "calendar_unreadable",
            message: `${read.failedCount} of ${read.calendarCount} calendars couldn't be read; their events are missing.`,
          }
        : null,
    );
  } catch (err) {
    return errorEnvelope("The calendar", err);
  }
}

// ── school_schedule (Tandem) ───────────────────────────────────────────────

export async function scheduleSource(range: DayRange): Promise<SourceEnvelope<ScheduleData>> {
  const mock = isScheduleMockEnabled();
  if (!mock && !hasTandemCredentials()) return notConfigured("Tandem");
  try {
    // One Tandem read per Monday–Friday week the range touches.
    const mondays = [...new Set(range.dates.map(mondayOf))];
    const weeks = await withTimeout(
      Promise.all(
        mondays.map((monday) => (mock ? Promise.resolve(mockWeek(monday)) : getWeek(monday).then((w) => w.activities))),
      ),
      APP_TIMEOUT,
    );
    const fetchedAt = Date.now();
    const wanted = new Set(range.dates);
    const names = new Map(getScheduleKids().map((k) => [k.child, k.name]));
    const activities = weeks
      .flat()
      .filter((a: ScheduleActivity) => wanted.has(a.day))
      .sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start))
      .map((a) => ({
        id: a.id,
        child: person(getMemberKeyForChild(a.child), names.get(a.child)),
        name: a.name,
        date: a.day,
        start: a.start,
        end: a.end,
        time_zone: range.timeZone,
        important: a.important,
      }));
    // A live read: the data is as current as the moment it was fetched.
    return okEnvelope({ activities }, fetchedAt, fetchedAt);
  } catch (err) {
    return errorEnvelope("Tandem", err);
  }
}

// ── meals (Enchanted Spoon) ────────────────────────────────────────────────

function mealItem(m: PlannedMeal): MealItem {
  return {
    entry_id: m.entryId,
    meal_id: m.mealId,
    name: m.name,
    scheduled_date: m.scheduledDate,
    completed: m.isCompleted,
    main_recipe_name: m.mainRecipeName,
    side_dish_count: typeof m.sideDishCount === "number" ? m.sideDishCount : null,
    total_time_minutes: m.totalTime,
  };
}

export async function mealsSource(range: DayRange): Promise<SourceEnvelope<MealsData>> {
  const mock = isMealsMockEnabled();
  if (!mock && !hasSpoonCredentials()) return notConfigured("Enchanted Spoon");
  try {
    const plan = mock ? mockMealPlan() : await withTimeout(getMealPlan(), APP_TIMEOUT);
    const fetchedAt = Date.now();
    const wanted = new Set(range.dates);
    const ordered = [...plan].sort((a, b) => a.position - b.position);
    const scheduled = ordered
      .filter((m) => m.scheduledDate !== null && wanted.has(m.scheduledDate))
      .map(mealItem);
    const upNext = ordered
      .filter((m) => m.scheduledDate === null && !m.isCompleted)
      .slice(0, 7)
      .map(mealItem);
    return okEnvelope({ scheduled, up_next: upNext }, fetchedAt, fetchedAt);
  } catch (err) {
    return errorEnvelope("Enchanted Spoon", err);
  }
}

// ── chores (Tada!) ─────────────────────────────────────────────────────────

export async function choresSource(range: DayRange): Promise<SourceEnvelope<ChoresData>> {
  const mock = isTasksMockEnabled();
  if (!mock && !hasTadaCredentials()) return notConfigured("Tada!");
  // Tada! only answers for today; never relabel today's chores as another day's.
  if (!range.startsToday) {
    return emptyEnvelope("unavailable_for_date", {
      code: "today_only",
      message: "Tada! only reports today's chores.",
    });
  }
  try {
    const kids = getKids();
    const [byKid, done] = await withTimeout(
      Promise.all([
        mock ? Promise.resolve(mockKids(kids)) : getKidsChores(),
        mock ? Promise.resolve(mockDoneToday()) : getDoneToday(getAdultId()),
      ]),
      APP_TIMEOUT,
    );
    const fetchedAt = Date.now();
    // No counts, scores or streaks: Hearth deliberately carries none (spec D4).
    const data: ChoresData = {
      kids: kids.map((kid) => ({
        child: person(getMemberKeyForTadaId(kid.id) ?? kid.id, kid.name),
        chores: (byKid.get(kid.id) ?? []).map((c) => ({ id: c.id, name: c.name, done: c.done })),
      })),
      maryann_done_today: done.map((c) => ({
        task_name: c.taskName,
        room: c.room,
        completed_at: c.completedAt,
      })),
    };
    return okEnvelope(data, fetchedAt, fetchedAt);
  } catch (err) {
    return errorEnvelope("Tada!", err);
  }
}
