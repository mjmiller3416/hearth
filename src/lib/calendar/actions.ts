import { fail, ok, type ActionResult } from "@/lib/action";
import {
  isKnownMemberKey,
  canonicalizeMemberKeys,
  getReadCalendarIds,
  getDefaultMemberKey,
  getMembers,
  hasReadCalendars,
} from "@/lib/calendar/config";
import { buildRecurrence, resolveTimeZone } from "@/lib/calendar/recurrence";
import {
  getEvents,
  reconcileEvent,
  deleteHearthGroup,
  deleteEventCopy,
  findHearthCopies,
  getSourceFields,
  CalendarWriteError,
  type EventSpec,
} from "@/lib/google/calendar";
import { isGoogleConfigured } from "@/lib/google/token";
import { isMockEnabled } from "@/lib/google/mock";
import type {
  CalendarPayload,
  CreateEventBody,
  EditEventBody,
  RepeatRule,
} from "@/lib/calendar/types";

// The calendar's actions: read a range, create, edit, delete. Shared by the
// wall's route handlers (/api/calendar, /api/calendar/events) and the MCP
// tools, so both get exactly the same rules (src/lib/action.ts).
//
// Per-person calendars: a whole-family ("Family") event is ONE event on the
// family calendar; an event assigned to specific people is one color copy per
// assignee's own calendar. The wall de-dupes copies into one banded chip. All
// three writes run through `reconcileEvent`, which brings an event to exactly the
// calendars it should live on (patch/create/delete) — so a "Family" create and a
// "tag Ollie into Maryann's phone event" edit are the same operation.
//
// SECURITY: this is the calendar WRITE surface. Callers authenticate first (the
// routes with requireDevice(), the MCP endpoint with an OAuth token). Create
// derives targets entirely from member config (a caller can't name a calendar).
// Edit/delete accept a caller-named {calendarId,eventId} only for a NON-Hearth
// event — allowlisted against the read set, never a synthetic wall id.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const ALLOWED_REMINDERS = new Set([0, 10, 30, 60, 1440]);
const ALLOWED_FREQ = new Set(["daily", "weekly", "monthly", "yearly"]);

/** Add one day to a "YYYY-MM-DD", returning Google's EXCLUSIVE all-day end. */
function exclusiveEnd(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** The Google start/end objects for a wall-local date/time. */
function startEnd(allDay: boolean, start: string, end: string, tz: string) {
  return {
    start: allDay ? { date: start } : { dateTime: `${start}:00`, timeZone: tz },
    end: allDay ? { date: exclusiveEnd(end) } : { dateTime: `${end}:00`, timeZone: tz },
  };
}

/** Validate the repeat rule shape. Returns an error message, or null if valid. */
function validateRepeat(repeat: RepeatRule): string | null {
  if (!ALLOWED_FREQ.has(repeat.freq)) return "Unknown repeat frequency.";
  const end = repeat.end;
  if (!end || typeof end !== "object") return "Repeat end condition is required.";
  if (end.mode === "count") {
    if (!Number.isInteger(end.count) || end.count < 1) {
      return "Repeat count must be a positive whole number.";
    }
  } else if (end.mode === "until") {
    if (!DATE_ONLY.test(end.until)) return "Repeat until-date is invalid.";
  } else if (end.mode !== "never") {
    return "Unknown repeat end condition.";
  }
  return null;
}

/** Shared field validation for create + edit. */
function validateFields(
  body: { title?: unknown; allDay?: unknown; start?: unknown; end?: unknown; memberKeys?: unknown },
):
  | { error: string }
  | { title: string; allDay: boolean; start: string; end: string; providedKeys: string[] } {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { error: "Give the event a title." };

  const allDay = body.allDay === true;
  const start = typeof body.start === "string" ? body.start : "";
  const end = typeof body.end === "string" ? body.end : "";
  const startOk = allDay ? DATE_ONLY.test(start) : DATE_TIME.test(start);
  const endOk = allDay ? DATE_ONLY.test(end) : DATE_TIME.test(end);
  if (!startOk || !endOk) return { error: "Start and end times are invalid." };

  // All-day end is inclusive (last covered day); timed events must span forward.
  const endAfterStart = allDay ? end >= start : end > start;
  if (!endAfterStart) return { error: "The event must end after it starts." };

  const providedKeys = Array.isArray(body.memberKeys) ? body.memberKeys : [];
  for (const key of providedKeys) {
    if (typeof key !== "string" || !isKnownMemberKey(key)) {
      return { error: `Unknown member: ${String(key)}.` };
    }
  }
  return { title, allDay, start, end, providedKeys };
}

/**
 * Every event overlapping [start, end) across the family calendars, normalized
 * for the wall, plus the member list. `configured` is false when Google or the
 * calendar config is absent (the wall then renders a calm empty grid).
 */
export async function listEvents(start: Date, end: Date): Promise<ActionResult> {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return fail("invalid range");
  }
  const members = getMembers();
  const configured = isMockEnabled() || (isGoogleConfigured() && hasReadCalendars());
  try {
    const events = await getEvents(start, end);
    return ok({ events, members, configured } satisfies CalendarPayload);
  } catch (err) {
    // Upstream failure: a 502 keeps the wall's last good render (spec §6.2).
    // Never leak the underlying error.
    console.error("[calendar] upstream error:", err);
    return fail("upstream unavailable", 502);
  }
}

/** Create an event. Its calendars come from who it's assigned to, never the caller. */
export async function createEvent(input: unknown): Promise<ActionResult> {
  const body = (input && typeof input === "object" ? input : {}) as Partial<CreateEventBody>;
  const v = validateFields(body);
  if ("error" in v) return fail(v.error);

  // Canonicalize to MEMBERS order; the "Family" default sends all members, so an
  // empty set only happens on a crafted request.
  const keys = canonicalizeMemberKeys(v.providedKeys);
  if (keys.length === 0) return fail("Choose at least one person.");

  const countdown = body.countdown === true;
  const repeat = body.repeat ?? null;
  if (countdown && repeat) {
    return fail("An event can count down or repeat, but not both.");
  }
  if (repeat) {
    if (typeof repeat !== "object") return fail("Unknown repeat frequency.");
    const repeatError = validateRepeat(repeat);
    if (repeatError) return fail(repeatError);
  }

  const reminderMinutes =
    body.reminderMinutes === null || body.reminderMinutes === undefined
      ? null
      : body.reminderMinutes;
  if (reminderMinutes !== null && !ALLOWED_REMINDERS.has(reminderMinutes)) {
    return fail("That reminder time isn't available.");
  }

  const tz = resolveTimeZone();
  const spec: EventSpec = {
    summary: v.title,
    ...startEnd(v.allDay, v.start, v.end, tz),
    recurrence: buildRecurrence(repeat, v.allDay, tz),
    reminders: {
      useDefault: false,
      overrides:
        reminderMinutes === null ? [] : [{ method: "popup", minutes: reminderMinutes }],
    },
    countdown,
    memberKeys: keys,
  };

  const { event, failures } = await reconcileEvent(spec, {
    currentCopies: [],
    existingGroupId: null,
    plain: false,
    carry: null,
  });
  if (!event) return fail("Couldn't create the event on any calendar.", 502);
  return ok({ event, failures }, 201);
}

/** Edit an event's fields and/or who it's assigned to. Repeating events are refused. */
export async function editEvent(input: unknown): Promise<ActionResult> {
  const body = (input && typeof input === "object" ? input : {}) as Partial<EditEventBody>;
  const v = validateFields(body);
  if ("error" in v) return fail(v.error);
  const countdown = body.countdown === true;

  // ── Resolve the target: an existing Hearth group, or one non-Hearth event ──
  let currentCopies: { calendarId: string; eventId: string }[];
  let existingGroupId: string | null;
  let carry: Awaited<ReturnType<typeof getSourceFields>> = null;
  const rawKeys = [...v.providedKeys];
  const target = body.target;

  if (target && typeof target === "object" && "hearthGroupId" in target) {
    const gid = typeof target.hearthGroupId === "string" ? target.hearthGroupId.trim() : "";
    if (!gid) return fail("Missing event id.");
    currentCopies = await findHearthCopies(gid);
    if (currentCopies.length === 0) return fail("That event no longer exists.");
    existingGroupId = gid;
    carry = await getSourceFields(currentCopies[0].calendarId, currentCopies[0].eventId);
    if (carry?.recurring) return fail("Edit repeating events on your phone.", 409);
  } else if (target && typeof target === "object" && "calendarId" in target) {
    const calendarId = typeof target.calendarId === "string" ? target.calendarId : "";
    const eventId = typeof target.eventId === "string" ? target.eventId : "";
    // SECURITY: only a real calendar Hearth reads, and never a synthetic wall id.
    if (!getReadCalendarIds().includes(calendarId) || !eventId || eventId.startsWith("hearth:")) {
      return fail("That event can't be edited from here.");
    }
    const src = await getSourceFields(calendarId, eventId);
    if (!src) return fail("That event no longer exists.");
    if (src.recurring) return fail("Edit repeating events on your phone.", 409);
    // Adopt the owner: the person whose calendar it lives on is always on it, so
    // the original is patched in place (never orphaned).
    const owner = getDefaultMemberKey(calendarId);
    if (owner) rawKeys.push(owner);
    currentCopies = [{ calendarId, eventId }];
    existingGroupId = null;
    carry = src;
  } else {
    return fail("Missing edit target.");
  }

  const keys = canonicalizeMemberKeys(rawKeys);
  if (keys.length === 0) return fail("Choose at least one person.");

  // A non-Hearth event whose assignment is exactly its owner stays a plain,
  // untagged personal event (no group) — editing a title mustn't "adopt" it.
  const owner = existingGroupId
    ? null
    : getDefaultMemberKey(currentCopies[0].calendarId);
  const plain = Boolean(owner) && keys.length === 1 && keys[0] === owner;

  const tz = resolveTimeZone();
  const spec: EventSpec = {
    summary: v.title,
    ...startEnd(v.allDay, v.start, v.end, tz),
    // Edits never touch recurrence; reminders are carried from the source event.
    reminders: { useDefault: false, overrides: [] },
    countdown,
    memberKeys: keys,
  };

  const { event, failures } = await reconcileEvent(spec, {
    currentCopies,
    existingGroupId,
    plain,
    carry,
  });
  if (!event) return fail("Couldn't save the event.", 502);
  return ok({ event, failures }, 200);
}

/**
 * Remove an event. Two shapes:
 *   { hearthGroupId }         → every per-person copy of a Hearth event.
 *   { calendarId, eventId }   → one non-Hearth (phone-made) event in place.
 * The second shape is what makes ANY event on the wall deletable, not just the
 * ones Hearth created. It is allowlisted against the read set and rejects
 * synthetic wall ids, exactly like the edit path.
 */
export async function deleteEvent(input: unknown): Promise<ActionResult> {
  const body = (input && typeof input === "object" ? input : {}) as {
    hearthGroupId?: unknown;
    calendarId?: unknown;
    eventId?: unknown;
  };

  const hearthGroupId =
    typeof body.hearthGroupId === "string" ? body.hearthGroupId.trim() : "";

  if (hearthGroupId) {
    try {
      const { deleted, failures } = await deleteHearthGroup(hearthGroupId);
      // Non-2xx when any copy failed: the wall only inspects the status to decide
      // whether to un-hide the optimistically removed event.
      const allOk = failures.length === 0;
      return ok({ ok: allOk, deleted, failures }, allOk ? 200 : 502);
    } catch (err) {
      console.error("[calendar] delete failed:", err);
      return fail("Couldn't delete the event.", 502);
    }
  }

  // Single non-Hearth event by its real calendar + event id.
  const calendarId = typeof body.calendarId === "string" ? body.calendarId : "";
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!calendarId || !eventId) return fail("Missing event id.");
  // SECURITY: only a calendar Hearth reads, and never a synthetic wall id.
  if (!getReadCalendarIds().includes(calendarId) || eventId.startsWith("hearth:")) {
    return fail("That event can't be deleted from here.");
  }

  try {
    await deleteEventCopy(calendarId, eventId);
    return ok({ ok: true, deleted: 1, failures: [] });
  } catch (err) {
    const status = err instanceof CalendarWriteError ? err.status : 502;
    console.error("[calendar] delete failed:", err);
    // 403 = the calendar isn't shared with write access to Hearth.
    const message =
      status === 403
        ? "Hearth can't delete on that calendar — share it with edit access."
        : "Couldn't delete the event.";
    return fail(message, status);
  }
}
