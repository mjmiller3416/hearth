import { fail, ok, type ActionResult } from "@/lib/action";
import { getMembers, getReadCalendarIds } from "@/lib/calendar/config";
import { zonedFields } from "@/lib/calendar/dates";
import { resolveTimeZone, zonedWallToUtc } from "@/lib/calendar/recurrence";
import type { CalendarEvent } from "@/lib/calendar/types";
import { CalendarWriteError, findHearthCopies, getEvents } from "@/lib/google/calendar";
import {
  getReminderCalendar,
  getReminderEvent,
  patchReminders,
  reminderMember,
  remindersAvailable,
  type GoogleTime,
  type ReminderCalendar,
  type ReminderEvent,
  type ReminderOverride,
} from "@/lib/google/reminders";

// One person's event reminders (Maryann's phone alarms), for the MCP tools:
// read them, set them, and check them after a reschedule. Google keeps reminders
// private to each user, so they are read and written as that person's own
// account (src/lib/google/reminders.ts), never the household account.
//
// The "appointment" preset is five pop-ups: 1 week, 3 days, 1 day, 8:00 AM the
// morning of, and 1 hour before. Google stores a reminder as minutes before the
// start, so the 8 a.m. one is worked out per event, in the event's own time zone,
// and must be worked out again when the event moves. All-day events (no start
// time) and events starting at or before 8 a.m. are flagged, never guessed.
//
// SECURITY: a caller-named calendar must be one Hearth reads (the read set), the
// same allowlist as edit and delete; synthetic wall ids are refused.

export const APPOINTMENT_PRESET = "appointment";
const WEEK = 10080;
const THREE_DAYS = 4320;
const DAY = 1440;
const HOUR = 60;
/** The preset's fixed reminders; the fifth (8 a.m.) depends on the start time. */
const FIXED = [WEEK, THREE_DAYS, DAY, HOUR];
const MORNING_HOUR = 8;
/** Google's limits: at most 5 overrides, each 0..40320 minutes (4 weeks). */
const MAX_REMINDERS = 5;
const MAX_MINUTES = 40320;
/** check_appointment_reminders reads one event per copy; keep the range and fan-out modest. */
const MAX_CHECK_DAYS = 62;
const CHECK_PARALLEL = 6;

export const NOT_SET_UP =
  "Reminders aren't set up yet: Hearth needs a one-time Google sign-in from Maryann's own " +
  "account before it can read or set her reminders. Ask Mitchell to connect it.";

const pad = (n: number) => String(n).padStart(2, "0");

/** A real instant as "YYYY-MM-DDTHH:MM" in `tz`. */
function localStamp(instant: Date, tz: string): string {
  const f = zonedFields(instant, tz);
  return `${f.y}-${pad(f.m)}-${pad(f.d)}T${pad(f.h)}:${pad(f.mi)}`;
}

/** "8:00 AM" for a clock time. */
function clock(h: number, mi: number): string {
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(mi)} ${suffix}`;
}

/** Plain words for a reminder's lead time. */
export function describeMinutes(minutes: number): string {
  if (minutes === 0) return "at the start";
  const parts: string[] = [];
  let left = minutes;
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (left % WEEK === 0) return `${unit(left / WEEK, "week")} before`;
  const days = Math.floor(left / DAY);
  if (days) parts.push(unit(days, "day"));
  left -= days * DAY;
  const hours = Math.floor(left / HOUR);
  if (hours) parts.push(unit(hours, "hour"));
  left -= hours * HOUR;
  if (left) parts.push(unit(left, "minute"));
  return `${parts.join(" ")} before`;
}

/** The time zone an event's reminders are worked out in. */
function eventTimeZone(ev: ReminderEvent, cal: ReminderCalendar | null): string {
  return ev.start.timeZone || cal?.timeZone || resolveTimeZone();
}

interface PlanItem {
  minutes: number;
  label: string;
  fires_at: string;
}

type Plan =
  | { ok: true; minutes: number[]; items: PlanItem[]; notes: string[] }
  | { ok: false; flag: "all_day" | "starts_by_8am" | "no_start"; message: string };

/**
 * Reminder lines for a set of minutes before a timed start. A reminder that
 * fires at 8:00 on the event's own day (and isn't one of the fixed four) reads
 * as "8:00 AM the morning of".
 */
function itemsFor(minutes: number[], start: Date, tz: string): PlanItem[] {
  const day = localStamp(start, tz).slice(0, 10);
  return [...minutes]
    .sort((a, b) => b - a)
    .map((m) => {
      const firesAt = localStamp(new Date(start.getTime() - m * 60_000), tz);
      const morning = !FIXED.includes(m) && firesAt === `${day}T0${MORNING_HOUR}:00`;
      return { minutes: m, label: morning ? "8:00 AM the morning of" : describeMinutes(m), fires_at: firesAt };
    });
}

/** The appointment preset for one event's start, or the flag that stops it. */
export function appointmentPlan(start: GoogleTime, tz: string): Plan {
  if (start.date && !start.dateTime) {
    return {
      ok: false,
      flag: "all_day",
      message:
        "It's an all-day event, so there's no start time to count the 8 a.m. and one-hour " +
        "reminders from. Ask Maryann what she'd like instead.",
    };
  }
  if (!start.dateTime) {
    return { ok: false, flag: "no_start", message: "The event has no start time Hearth can read." };
  }
  const startAt = new Date(start.dateTime);
  const f = zonedFields(startAt, tz);
  const eight = zonedWallToUtc(f.y, f.m - 1, f.d, MORNING_HOUR, 0, 0, tz);
  const morning = Math.round((startAt.getTime() - eight.getTime()) / 60_000);
  if (morning <= 0) {
    return {
      ok: false,
      flag: "starts_by_8am",
      message:
        `It starts at ${clock(f.h, f.mi)}, at or before 8 a.m., so there's no "8 a.m. the ` +
        "morning of\" reminder before it. Ask Maryann what she'd like instead.",
    };
  }
  const notes: string[] = [];
  const set = new Set(FIXED);
  if (set.has(morning)) {
    notes.push(
      `It starts at ${clock(f.h, f.mi)}, so 8 a.m. is the same as the one-hour reminder; ` +
        "it gets four reminders, not five.",
    );
  }
  set.add(morning);
  const minutes = [...set].sort((a, b) => b - a);
  return { ok: true, minutes, items: itemsFor(minutes, startAt, tz), notes };
}

/** The pop-up minutes an event's reminders resolve to, ignoring other methods. */
function popupMinutes(ev: ReminderEvent): number[] {
  return [...new Set(ev.overrides.filter((o) => o.method === "popup").map((o) => o.minutes))].sort(
    (a, b) => b - a,
  );
}

const sameSet = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);

/**
 * Where an event's reminders stand against the appointment preset:
 *   appointment_set      — exactly the preset for its current start
 *   needs_recalculation  — the preset's fixed four plus a stale morning-of one
 *                          (the event moved since they were set)
 *   flagged              — preset-like reminders on an all-day or ≤ 8 a.m. event
 *   other                — calendar defaults, none, or a custom set
 */
export function assess(ev: ReminderEvent, tz: string) {
  const current = popupMinutes(ev);
  const plan = appointmentPlan(ev.start, tz);
  const hasFixed = !ev.useDefault && FIXED.every((m) => current.includes(m));
  if (plan.ok && !ev.useDefault && sameSet(current, plan.minutes)) {
    return { status: "appointment_set" as const, message: "Has the appointment reminders for its current time." };
  }
  if (hasFixed && current.length <= MAX_REMINDERS) {
    if (!plan.ok) return { status: "flagged" as const, message: plan.message };
    return {
      status: "needs_recalculation" as const,
      message:
        "Has the appointment reminders, but the 8 a.m. one doesn't match the current start " +
        "(it was probably rescheduled). Set the appointment preset again.",
      expected: plan.items,
    };
  }
  return {
    status: "other" as const,
    message: ev.useDefault ? "Uses the calendar's default reminders." : "Has its own reminders, not the appointment set.",
  };
}

/** One copy of an event, as the reminder tools report it. */
function shapeCopy(ev: ReminderEvent, cal: ReminderCalendar) {
  const tz = eventTimeZone(ev, cal);
  const allDay = Boolean(ev.start.date && !ev.start.dateTime);
  const startAt = ev.start.dateTime ? new Date(ev.start.dateTime) : null;
  const popups = popupMinutes(ev);
  const check = assess(ev, tz);
  const canUpdate = cal.accessRole === "owner" || cal.accessRole === "writer" || cal.accessRole === null;
  return {
    calendar_id: ev.calendarId,
    event_id: ev.eventId,
    calendar_name: cal.name,
    access_role: cal.accessRole ?? "unknown",
    can_update: canUpdate,
    title: ev.title,
    all_day: allDay,
    start: allDay ? ev.start.date : startAt ? localStamp(startAt, tz) : null,
    end: allDay ? ev.end.date : ev.end.dateTime ? localStamp(new Date(ev.end.dateTime), tz) : null,
    time_zone: tz,
    recurring: ev.isSeries || Boolean(ev.recurringEventId),
    applies_to: ev.isSeries ? "every occurrence" : ev.recurringEventId ? "this occurrence only" : "this event",
    reminders: {
      uses_calendar_default: ev.useDefault,
      popups: startAt ? itemsFor(popups, startAt, tz) : popups.map((m) => ({ minutes: m, label: describeMinutes(m) })),
      other_methods: ev.overrides.filter((o) => o.method !== "popup"),
      calendar_defaults: cal.defaultReminders,
    },
    appointment_check: check,
  };
}

/** A tool target → the Google copies behind it (allowlisted). */
async function resolveCopies(
  target: { hearthGroupId: string } | { calendarId: string; eventId: string },
): Promise<{ calendarId: string; eventId: string }[] | string> {
  if ("hearthGroupId" in target) {
    const copies = await findHearthCopies(target.hearthGroupId);
    return copies.length ? copies : "That event no longer exists.";
  }
  if (!allowed(target.calendarId, target.eventId)) return "That event isn't on a calendar Hearth reads.";
  return [target];
}

function allowed(calendarId: string, eventId: string): boolean {
  return getReadCalendarIds().includes(calendarId) && Boolean(eventId) && !eventId.startsWith("hearth:");
}

/** The copy whose reminders belong on Maryann's phone: on her own calendar if there is one. */
function suggestCopy(copies: ReturnType<typeof shapeCopy>[]) {
  const member = reminderMember();
  const own = getMembers().find((m) => m.key === member?.key)?.calendarId;
  const pick =
    copies.find((c) => c.calendar_id === own && c.can_update) ?? copies.find((c) => c.can_update) ?? null;
  return pick ? { calendar_id: pick.calendar_id, event_id: pick.event_id } : null;
}

/** Read one copy as the reminder account; null with a reason when it can't be read. */
async function readCopy(calendarId: string, eventId: string) {
  const cal = await getReminderCalendar(calendarId);
  const ev = await getReminderEvent(calendarId, eventId);
  return { cal, ev };
}

function accountName(): string {
  return reminderMember()?.name ?? "Maryann";
}

/** get_event_reminders: every copy of an event with the reminder account's reminders. */
export async function getEventReminders(
  target: { hearthGroupId: string } | { calendarId: string; eventId: string },
): Promise<ActionResult> {
  if (!remindersAvailable()) return fail(NOT_SET_UP, 503);
  const resolved = await resolveCopies(target);
  if (typeof resolved === "string") return fail(resolved, 404);

  const copies: ReturnType<typeof shapeCopy>[] = [];
  const unreadable: { calendar_id: string; event_id: string; problem: string }[] = [];
  for (const c of resolved) {
    try {
      const { cal, ev } = await readCopy(c.calendarId, c.eventId);
      if (ev) copies.push(shapeCopy(ev, cal));
      else {
        unreadable.push({
          calendar_id: c.calendarId,
          event_id: c.eventId,
          problem: cal.inList
            ? "The event is gone from this calendar."
            : `${accountName()}'s Google account can't see this calendar, so it can't hold her reminders.`,
        });
      }
    } catch (err) {
      console.error("[reminders] read failed:", err);
      const status = err instanceof CalendarWriteError ? err.status : 502;
      unreadable.push({
        calendar_id: c.calendarId,
        event_id: c.eventId,
        problem: status === 403 || status === 404
          ? `${accountName()}'s Google account can't see this calendar, so it can't hold her reminders.`
          : "Google didn't answer for this calendar.",
      });
    }
  }
  if (copies.length === 0 && unreadable.length > 0) {
    return fail(unreadable[0].problem, 502);
  }
  return ok({
    reminders_for: accountName(),
    copies,
    unreadable,
    suggested_copy: suggestCopy(copies),
  });
}

/** Validate a custom reminder list. */
function readMinutes(raw: unknown): number[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return "Give at least one reminder in minutes.";
  const out = new Set<number>();
  for (const v of raw) {
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > MAX_MINUTES) {
      return `Each reminder must be a whole number of minutes from 0 to ${MAX_MINUTES} (4 weeks).`;
    }
    out.add(v as number);
  }
  if (out.size > MAX_REMINDERS) return `Google allows at most ${MAX_REMINDERS} reminders on an event.`;
  return [...out].sort((a, b) => b - a);
}

/**
 * update_event_reminders: replace the reminder account's reminders on ONE copy
 * with pop-ups (the appointment preset or exact minutes), then read the event
 * back to confirm. Changes nothing but the reminders.
 */
export async function updateEventReminders(input: {
  calendarId?: string;
  eventId?: string;
  preset?: string;
  minutes?: unknown;
  dryRun?: boolean;
}): Promise<ActionResult> {
  if (!remindersAvailable()) return fail(NOT_SET_UP, 503);
  const calendarId = input.calendarId ?? "";
  const eventId = input.eventId ?? "";
  if (!allowed(calendarId, eventId)) {
    return fail("Give a calendar_id and event_id from get_event_reminders (a calendar Hearth reads).");
  }
  if ((input.preset ? 1 : 0) + (input.minutes !== undefined ? 1 : 0) !== 1) {
    return fail(`Give either preset "${APPOINTMENT_PRESET}" or minutes, not both.`);
  }
  if (input.preset && input.preset !== APPOINTMENT_PRESET) {
    return fail(`The only preset is "${APPOINTMENT_PRESET}".`);
  }

  let before: Awaited<ReturnType<typeof readCopy>>;
  try {
    before = await readCopy(calendarId, eventId);
  } catch (err) {
    return writeFailure(err);
  }
  const { cal, ev } = before;
  if (!ev) {
    return fail(
      cal.inList
        ? "That event no longer exists."
        : `${accountName()}'s Google account can't see that calendar, so it can't hold her reminders.`,
      404,
    );
  }
  if (cal.accessRole && cal.accessRole !== "owner" && cal.accessRole !== "writer") {
    return fail(
      `${accountName()} only has ${cal.accessRole} access to ${cal.name ?? "that calendar"}, so Google ` +
        "won't let her account change that event. Nothing was changed.",
      403,
    );
  }
  const tz = eventTimeZone(ev, cal);
  const startAt = ev.start.dateTime ? new Date(ev.start.dateTime) : null;

  let minutes: number[];
  let notes: string[] = [];
  if (input.preset) {
    const plan = appointmentPlan(ev.start, tz);
    if (!plan.ok) return fail(`Not changed. ${plan.message}`, 422);
    minutes = plan.minutes;
    notes = plan.notes;
  } else {
    const m = readMinutes(input.minutes);
    if (typeof m === "string") return fail(m);
    minutes = m;
  }
  const planned = startAt
    ? itemsFor(minutes, startAt, tz)
    : minutes.map((m) => ({ minutes: m, label: describeMinutes(m), fires_at: null }));
  const current = shapeCopy(ev, cal);

  if (input.dryRun) {
    return ok({
      saved: false,
      calendar_id: calendarId,
      event_id: eventId,
      title: ev.title,
      applies_to: current.applies_to,
      time_zone: tz,
      current: current.reminders,
      would_set: planned,
      notes,
    });
  }

  const overrides: ReminderOverride[] = minutes.map((m) => ({ method: "popup", minutes: m }));
  try {
    await patchReminders(calendarId, eventId, overrides, ev.etag);
  } catch (err) {
    return writeFailure(err);
  }

  // Read-back check: the reminders are what was asked, and nothing else moved.
  const after = await getReminderEvent(calendarId, eventId).catch(() => null);
  if (!after) return fail("Saved, but Hearth couldn't read the event back to confirm. Check it again.", 502);
  const verified = !after.useDefault && sameSet(popupMinutes(after), minutes);
  const preserved =
    after.title === ev.title &&
    JSON.stringify(after.start) === JSON.stringify(ev.start) &&
    JSON.stringify(after.end) === JSON.stringify(ev.end);
  const afterShape = shapeCopy(after, cal);
  if (!verified) {
    return fail(
      `Saved, but reading it back shows ${afterShape.reminders.popups.map((p) => p.label).join(", ") || "no pop-ups"} ` +
        "instead of what was asked. Check the event in Google Calendar.",
      502,
    );
  }
  return ok({
    saved: true,
    verified,
    preserved,
    reminders_for: accountName(),
    calendar_id: calendarId,
    event_id: eventId,
    title: after.title,
    applies_to: afterShape.applies_to,
    time_zone: tz,
    before: current.reminders,
    after: afterShape.reminders,
    removed_other_methods: ev.overrides.filter((o) => o.method !== "popup"),
    notes,
  });
}

/** A failed reminder read/write as a sentence. */
function writeFailure(err: unknown): ActionResult {
  console.error("[reminders] write failed:", err);
  const status = err instanceof CalendarWriteError ? err.status : 502;
  if (status === 412) {
    return fail(
      "The event changed while saving (it may have been rescheduled). Read it again with " +
        "get_event_reminders and retry. Nothing was changed.",
      409,
    );
  }
  if (status === 403 || status === 404) {
    return fail(
      `${accountName()}'s Google account isn't allowed to change that event's reminders. Nothing was changed.`,
      403,
    );
  }
  return fail("Google didn't answer. Nothing was changed; try again in a minute.", 502);
}

/** Run `fn` over `items`, at most `limit` at a time. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** The Google copies behind a wall event. */
function copiesOf(ev: CalendarEvent): { calendarId: string; eventId: string }[] {
  return ev.copies ?? [{ calendarId: ev.calendarId, eventId: ev.id }];
}

/**
 * check_appointment_reminders: every copy in a date range whose reminders look
 * like the appointment preset, with whether they still fit the event's start
 * (an event moved on a phone leaves a stale 8 a.m. reminder). Read-only.
 */
export async function checkAppointmentReminders(start: Date, end: Date): Promise<ActionResult> {
  if (!remindersAvailable()) return fail(NOT_SET_UP, 503);
  // One day of slack for a daylight-saving change inside the range.
  if (end.getTime() - start.getTime() > (MAX_CHECK_DAYS + 1) * 86_400_000) {
    return fail(`Check at most ${MAX_CHECK_DAYS} days at a time.`);
  }
  let events: CalendarEvent[];
  try {
    events = await getEvents(start, end);
  } catch (err) {
    console.error("[reminders] check: list failed:", err);
    return fail("upstream unavailable", 502);
  }
  const copies = events.flatMap((ev) => copiesOf(ev).map((c) => ({ ...c, ev })));
  const results = await pool(copies, CHECK_PARALLEL, async (c) => {
    try {
      const { cal, ev } = await readCopy(c.calendarId, c.eventId);
      return ev ? shapeCopy(ev, cal) : null;
    } catch {
      return null;
    }
  });
  const withPreset = results.filter(
    (r): r is ReturnType<typeof shapeCopy> => r !== null && r.appointment_check.status !== "other",
  );
  return ok({
    reminders_for: accountName(),
    checked_copies: results.filter(Boolean).length,
    unreadable_copies: results.filter((r) => r === null).length,
    needs_attention: withPreset.filter((r) => r.appointment_check.status !== "appointment_set"),
    up_to_date: withPreset
      .filter((r) => r.appointment_check.status === "appointment_set")
      .map((r) => ({ calendar_id: r.calendar_id, event_id: r.event_id, title: r.title, start: r.start })),
  });
}

/**
 * After an edit (a reschedule), bring the reminder account's appointment
 * reminders back in line on every copy that still exists: a stale 8 a.m.
 * reminder is recalculated and saved; an event moved to all-day or to 8 a.m. or
 * earlier is flagged. Reported, never fatal to the edit. `before` is what the
 * copies looked like before the edit, so lost reminders can be reported too.
 */
export async function recheckAfterEdit(
  before: { calendarId: string; eventId: string; hadPreset: boolean }[],
  after: { calendarId: string; eventId: string }[],
) {
  if (!remindersAvailable()) return null;
  const report: { calendar_id: string; event_id: string; outcome: string; message: string }[] = [];
  for (const c of after) {
    try {
      const { cal, ev } = await readCopy(c.calendarId, c.eventId);
      if (!ev) continue;
      const tz = eventTimeZone(ev, cal);
      const check = assess(ev, tz);
      if (check.status === "needs_recalculation") {
        const plan = appointmentPlan(ev.start, tz);
        if (!plan.ok) continue;
        const res = await updateEventReminders({ calendarId: c.calendarId, eventId: c.eventId, preset: APPOINTMENT_PRESET });
        report.push({
          calendar_id: c.calendarId,
          event_id: c.eventId,
          outcome: res.status === 200 ? "recalculated" : "failed",
          message: res.status === 200
            ? `Moved the 8 a.m. reminder to the new day: ${plan.items.map((i) => i.label).join(", ")}.`
            : String((res.body as { error?: string }).error ?? "Couldn't update the reminders."),
        });
      } else if (check.status === "flagged") {
        report.push({ calendar_id: c.calendarId, event_id: c.eventId, outcome: "flagged", message: check.message });
      }
    } catch (err) {
      console.error("[reminders] recheck failed:", err);
    }
  }
  const afterKeys = new Set(after.map((c) => `${c.calendarId}/${c.eventId}`));
  for (const b of before) {
    if (b.hadPreset && !afterKeys.has(`${b.calendarId}/${b.eventId}`)) {
      report.push({
        calendar_id: b.calendarId,
        event_id: b.eventId,
        outcome: "lost",
        message:
          `${accountName()}'s appointment reminders were on a copy the edit removed. Set them ` +
          "again with update_event_reminders on the copy she should be reminded from.",
      });
    }
  }
  return report;
}

/** Before an edit: which copies carry the appointment reminders (for recheckAfterEdit). */
export async function presetCopies(copies: { calendarId: string; eventId: string }[]) {
  if (!remindersAvailable()) return [];
  return Promise.all(
    copies.map(async (c) => {
      try {
        const { cal, ev } = await readCopy(c.calendarId, c.eventId);
        const hadPreset = ev ? assess(ev, eventTimeZone(ev, cal)).status !== "other" : false;
        return { ...c, hadPreset };
      } catch {
        return { ...c, hadPreset: false };
      }
    }),
  );
}
