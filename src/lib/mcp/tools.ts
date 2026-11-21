import { fail, ok, type ActionResult } from "@/lib/action";
import { listAllowance, setBalanceTrusted } from "@/lib/allowance/actions";
import { getWeather } from "@/lib/weather/actions";
import {
  createEvent,
  deleteEvent,
  editEvent,
  listEvents,
} from "@/lib/calendar/actions";
import { getFamilyCalendarId, getMembers, hasReadCalendars } from "@/lib/calendar/config";
import { zonedFields } from "@/lib/calendar/dates";
import { concernsFamily, memberConcerns } from "@/lib/calendar/event";
import {
  APPOINTMENT_PRESET,
  checkAppointmentReminders,
  getEventReminders,
  updateEventReminders,
} from "@/lib/calendar/reminders";
import { resolveTimeZone, zonedWallToUtc } from "@/lib/calendar/recurrence";
import type { CalendarEvent, CalendarPayload, Member, RepeatRule } from "@/lib/calendar/types";
import { isMockEnabled } from "@/lib/google/mock";
import { isGoogleConfigured } from "@/lib/google/token";
import { addItem, markCooked, mealCard, mealPlan, shoppingList } from "@/lib/spoon/actions";
import { hasSpoonCredentials } from "@/lib/spoon/config";
import { isMealsMockEnabled } from "@/lib/spoon/mock";
import type { ShoppingListPayload } from "@/lib/spoon/types";
import { complete, doneToday, kidsChores, listRooms, nextTask, undo } from "@/lib/tada/actions";
import {
  getAdultId,
  getAdultMember,
  getKids,
  getTadaMembers,
  hasTadaCredentials,
} from "@/lib/tada/config";
import { isTasksMockEnabled } from "@/lib/tada/mock";
import { scheduleWeek } from "@/lib/tandem/actions";
import { getScheduleKids, hasTandemCredentials } from "@/lib/tandem/config";
import { isScheduleMockEnabled } from "@/lib/tandem/mock";
import { restingMonday } from "@/lib/tandem/week";

// The MCP tools: everything a person can do on the wall, for ChatGPT. Each tool
// runs the same action function as the wall's route handler (src/lib/action.ts),
// so validation, allowlists and upstream calls are identical.
//
// COVERAGE RULE (enforced at build by scripts/check-mcp-coverage.mjs): every
// method of every route under src/app/api is either named in some tool's
// `routes`, or listed in UNCOVERED_ROUTES with the reason. A new wall route
// without a tool fails the build.

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  /** The wall routes ("METHOD /api/path") this tool covers. */
  routes: string[];
  run(args: Record<string, unknown>): Promise<ActionResult>;
}

/** Wall routes with deliberately no tool, and why. */
export const UNCOVERED_ROUTES: Record<string, string> = {
  "GET /api/settings": "Family colors are a display preference (theme) for the wall.",
  "PUT /api/settings": "Family colors are a display preference (theme) for the wall.",
  "GET /api/home-base/summary":
    "Home Base's own read-only feed (its token, not the wall's); ChatGPT reads each source through its own tools.",
  "GET /api/weather/places": "The town search behind Settings → Weather: a display setting for the wall.",
  "GET /api/weather/place": "Which town the forecast is for: a display setting for the wall.",
  "PUT /api/weather/place": "Which town the forecast is for: a display setting for the wall.",
  "GET /api/photos": "The family photos on Home are pictures for the screens, not something ChatGPT acts on.",
  "POST /api/photos": "Adding a photo is done from a phone's own photo picker.",
  "GET /api/photos/[id]": "A photo's image bytes, for the screens.",
  "DELETE /api/photos/[id]": "Taking a photo down is done by the person looking at it.",
  "GET /api/photos/import": "The bulk importer's own route (its token, not the wall's).",
  "PUT /api/photos/import/[id]": "The bulk importer's own route (its token, not the wall's).",
  "POST /api/allowance/pin":
    "The parent PIN guards the wall's screens; the connector is already limited to a parent by its connect password.",
};

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = (destructive: boolean, idempotent: boolean) => ({
  readOnlyHint: false,
  destructiveHint: destructive,
  idempotentHint: idempotent,
  openWorldHint: false,
});

// ── Small helpers ────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Shift a "YYYY-MM-DD" by whole days (UTC math, so the server's zone can't move it). */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isRealDate(iso: string): boolean {
  if (!DATE_RE.test(iso)) return false;
  return addDaysIso(iso, 0) === iso;
}

/** "YYYY-MM-DDTHH:mm" plus some minutes. */
function plusMinutes(dt: string, minutes: number): string {
  const [date, time] = dt.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, mi + minutes)).toISOString().slice(0, 16);
}

/** Today's date in the household's time zone. */
function householdToday(tz: string): string {
  const f = zonedFields(new Date(), tz);
  return `${f.y}-${pad(f.m)}-${pad(f.d)}`;
}

/** An instant as household-local "YYYY-MM-DDTHH:mm". */
function localDateTime(instant: string, tz: string): string {
  const f = zonedFields(new Date(instant), tz);
  return `${f.y}-${pad(f.m)}-${pad(f.d)}T${pad(f.h)}:${pad(f.mi)}`;
}

/** Household midnight of a "YYYY-MM-DD" as a real instant. */
function householdMidnight(iso: string, tz: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return zonedWallToUtc(y, m - 1, d, 0, 0, 0, tz);
}

/** Which keys an event concerns, in a form update_event accepts back. */
function eventMembers(ev: CalendarEvent, members: Member[]): string[] {
  if (ev.memberKeys.length > 0) return ev.memberKeys;
  if (ev.defaultMemberKey) return [ev.defaultMemberKey];
  if (ev.calendarId === getFamilyCalendarId()) return members.map((m) => m.key);
  return [];
}

/** One event as ChatGPT sees it: household-local times, inclusive all-day end, a target to edit by. */
function shapeEvent(ev: CalendarEvent, members: Member[], tz: string) {
  const keys = eventMembers(ev, members);
  const names = new Map(members.map((m) => [m.key, m.name]));
  return {
    title: ev.title,
    all_day: ev.allDay,
    start: ev.allDay ? ev.start : localDateTime(ev.start, tz),
    end: ev.allDay ? addDaysIso(ev.end, -1) : localDateTime(ev.end, tz),
    members: keys,
    people: keys.map((k) => names.get(k) ?? k),
    whole_family: concernsFamily(ev),
    countdown: ev.countdown,
    recurring: ev.recurring,
    editable: !ev.recurring,
    target: ev.hearthGroupId
      ? { hearth_group_id: ev.hearthGroupId }
      : { calendar_id: ev.calendarId, event_id: ev.id },
    // The real Google event behind each person's copy: stable references for
    // the reminder tools (a Hearth event has one copy per person's calendar).
    copies: (ev.copies ?? [{ calendarId: ev.calendarId, eventId: ev.id }]).map((c) => ({
      calendar_id: c.calendarId,
      event_id: c.eventId,
    })),
  };
}

/** A tool's `target` argument → the wall's edit/delete target shape. */
function readTarget(
  args: Record<string, unknown>,
): { hearthGroupId: string } | { calendarId: string; eventId: string } | null {
  const t = args.target;
  if (!t || typeof t !== "object") return null;
  const target = t as Record<string, unknown>;
  const gid = str(target, "hearth_group_id");
  if (gid) return { hearthGroupId: gid };
  const calendarId = str(target, "calendar_id");
  const eventId = str(target, "event_id");
  if (calendarId && eventId) return { calendarId, eventId };
  return null;
}

/** Member keys from a tool argument; omitted or empty → the whole family. */
function memberKeys(args: Record<string, unknown>): unknown[] {
  const v = args.members;
  if (Array.isArray(v) && v.length > 0) return v;
  return getMembers().map((m) => m.key);
}

/** The structured repeat argument → the wall's RepeatRule. */
function readRepeat(args: Record<string, unknown>): RepeatRule | null | "bad" {
  const r = args.repeat;
  if (r === undefined || r === null) return null;
  if (typeof r !== "object") return "bad";
  const rep = r as Record<string, unknown>;
  const freq = rep.frequency as RepeatRule["freq"];
  const ends = rep.ends ?? "never";
  if (ends === "after") return { freq, end: { mode: "count", count: Number(rep.count) } };
  if (ends === "on") return { freq, end: { mode: "until", until: String(rep.until ?? "") } };
  if (ends === "never") return { freq, end: { mode: "never" } };
  return "bad";
}

const TARGET_SCHEMA = {
  type: "object",
  description:
    "Which event, exactly as list_events returned it in `target`: either { hearth_group_id } " +
    "or { calendar_id, event_id }.",
  properties: {
    hearth_group_id: { type: "string", description: "Group id of an event Hearth created." },
    calendar_id: { type: "string", description: "Calendar id of an event made elsewhere." },
    event_id: { type: "string", description: "Event id of an event made elsewhere." },
  },
  additionalProperties: false,
};

const MEMBERS_SCHEMA = {
  type: "array",
  items: { type: "string" },
  description:
    "Member keys from get_household (e.g. \"maryann\"). Everyone = a whole-family event on the " +
    "shared family calendar; a subset puts a copy on each person's own calendar.",
};

const WHEN_DESCRIPTION =
  "Timed events: YYYY-MM-DDTHH:MM in the household time zone. All-day events: YYYY-MM-DD.";

// ── The tools ────────────────────────────────────────────────────────────────

export const TOOLS: ToolDef[] = [
  {
    name: "get_household",
    title: "Get household",
    description:
      "Today's date and time zone, the family members (calendar keys), who can be credited " +
      "with cleaning and chores (Tada! ids) and which services are connected. Call this first.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ,
    routes: [],
    async run() {
      const tz = resolveTimeZone();
      const f = zonedFields(new Date(), tz);
      const adult = getAdultMember();
      return ok({
        timezone: tz,
        today: householdToday(tz),
        time_now: `${pad(f.h)}:${pad(f.mi)}`,
        members: getMembers().map((m) => ({ key: m.key, name: m.name })),
        cleaning_member: adult ? { id: adult.id, name: adult.name } : null,
        chore_kids: getKids().map((k) => ({ id: k.id, name: k.name })),
        task_members: getTadaMembers().map((m) => ({ id: m.id, name: m.name, role: m.role })),
        schedule_kids: getScheduleKids().map((k) => ({ child: k.child, name: k.name })),
        connected: {
          calendar: isMockEnabled() || (isGoogleConfigured() && hasReadCalendars()),
          cleaning_and_chores: isTasksMockEnabled() || hasTadaCredentials(),
          meals_and_shopping: isMealsMockEnabled() || hasSpoonCredentials(),
          school_schedule: isScheduleMockEnabled() || hasTandemCredentials(),
        },
      });
    },
  },

  // ── Calendar ──
  {
    name: "list_events",
    title: "List calendar events",
    description:
      "Family calendar events between two dates (inclusive), optionally for one person. Times are " +
      "household-local; all-day `end` is the last day covered. Each event's `target` is what " +
      "update_event and delete_event take.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "First day, YYYY-MM-DD." },
        end_date: { type: "string", description: "Last day, YYYY-MM-DD (inclusive). Defaults to start_date." },
        member: {
          type: "string",
          description: "Only events concerning this member key (from get_household), or \"family\" for whole-family events only.",
        },
        include_family: {
          type: "boolean",
          description: "With a member filter, also include whole-family events. Default true.",
        },
      },
      required: ["start_date"],
      additionalProperties: false,
    },
    annotations: READ,
    routes: ["GET /api/calendar"],
    async run(args) {
      const tz = resolveTimeZone();
      const startDate = str(args, "start_date") ?? "";
      const endDate = str(args, "end_date") ?? startDate;
      if (!isRealDate(startDate) || !isRealDate(endDate)) {
        return fail("Dates must be real days written YYYY-MM-DD.");
      }
      if (endDate < startDate) return fail("end_date must be on or after start_date.");
      if (addDaysIso(startDate, 366) < endDate) return fail("Ask for at most a year at a time.");

      const result = await listEvents(
        householdMidnight(startDate, tz),
        householdMidnight(addDaysIso(endDate, 1), tz),
      );
      if (result.status !== 200) return result;
      const payload = result.body as CalendarPayload;

      const member = str(args, "member");
      const includeFamily = args.include_family !== false;
      if (member && member !== "family" && !payload.members.some((m) => m.key === member)) {
        return fail(`Unknown member: ${member}. Use a key from get_household.`);
      }
      const events = payload.events
        .filter((ev) => {
          if (!member) return true;
          if (member === "family") return concernsFamily(ev);
          return memberConcerns(ev, member) || (includeFamily && concernsFamily(ev));
        })
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((ev) => shapeEvent(ev, payload.members, tz));
      return ok({
        start_date: startDate,
        end_date: endDate,
        timezone: tz,
        connected: payload.configured,
        events,
      });
    },
  },
  {
    name: "create_event",
    title: "Add calendar event",
    description:
      "Add an event to the family calendar. Who it's for decides where it lives: everyone → one " +
      "event on the family calendar; some people → a copy on each person's calendar.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "What it is." },
        all_day: { type: "boolean", description: "True for an all-day event. Default false." },
        start: { type: "string", description: WHEN_DESCRIPTION },
        end: {
          type: "string",
          description: `${WHEN_DESCRIPTION} All-day end is the last day covered. Defaults to one hour after start (timed) or the start day (all-day).`,
        },
        members: { ...MEMBERS_SCHEMA, description: `${MEMBERS_SCHEMA.description} Omit for the whole family.` },
        repeat: {
          type: "object",
          description: "Make it repeat. Not allowed together with countdown.",
          properties: {
            frequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"] },
            ends: { type: "string", enum: ["never", "after", "on"], description: "Default never." },
            count: { type: "integer", minimum: 1, description: "With ends=after: how many times." },
            until: { type: "string", description: "With ends=on: last date, YYYY-MM-DD." },
          },
          required: ["frequency"],
          additionalProperties: false,
        },
        countdown: { type: "boolean", description: "Show a countdown to it on the wall. Default false." },
        reminder_minutes: {
          type: "integer",
          enum: [0, 10, 30, 60, 1440],
          description:
            "A reminder this many minutes before (0 = at the start), set as Hearth's own household " +
            "Google account. Google keeps reminders per person, so this does NOT alarm Maryann's " +
            "phone; for her alarms use update_event_reminders afterwards. Omit for none.",
        },
      },
      required: ["title", "start"],
      additionalProperties: false,
    },
    annotations: write(false, false),
    routes: ["POST /api/calendar/events"],
    async run(args) {
      const allDay = args.all_day === true;
      const start = str(args, "start") ?? "";
      let end = str(args, "end");
      if (!end) end = allDay ? start : DATE_TIME_RE.test(start) ? plusMinutes(start, 60) : "";
      const repeat = readRepeat(args);
      if (repeat === "bad") return fail("repeat.ends must be never, after or on.");
      return createEvent({
        title: args.title,
        allDay,
        start,
        end,
        memberKeys: memberKeys(args),
        repeat,
        countdown: args.countdown === true,
        reminderMinutes: args.reminder_minutes ?? null,
      });
    },
  },
  {
    name: "update_event",
    title: "Change calendar event",
    description:
      "Change an event: send every field as it should end up (copy unchanged ones from " +
      "list_events). Changing members moves it between calendars. Repeating events can't be " +
      "changed here (do that on a phone). If Maryann's appointment reminders are on it, a new " +
      "time recalculates the 8 a.m. one; `reminders` in the result says what happened.",
    inputSchema: {
      type: "object",
      properties: {
        target: TARGET_SCHEMA,
        title: { type: "string" },
        all_day: { type: "boolean" },
        start: { type: "string", description: WHEN_DESCRIPTION },
        end: { type: "string", description: `${WHEN_DESCRIPTION} All-day end is the last day covered.` },
        members: MEMBERS_SCHEMA,
        countdown: { type: "boolean", description: "Keep or add a countdown. Default false (removes one)." },
      },
      required: ["target", "title", "all_day", "start", "end", "members"],
      additionalProperties: false,
    },
    annotations: write(false, true),
    routes: ["PUT /api/calendar/events"],
    async run(args) {
      const target = readTarget(args);
      if (!target) return fail("Give the event's target from list_events.");
      return editEvent({
        title: args.title,
        allDay: args.all_day === true,
        start: args.start,
        end: args.end,
        memberKeys: Array.isArray(args.members) ? args.members : [],
        countdown: args.countdown === true,
        target,
      });
    },
  },
  {
    name: "delete_event",
    title: "Delete calendar event",
    description: "Delete an event (every person's copy of it). Use the `target` from list_events.",
    inputSchema: {
      type: "object",
      properties: { target: TARGET_SCHEMA },
      required: ["target"],
      additionalProperties: false,
    },
    annotations: write(true, true),
    routes: ["DELETE /api/calendar/events"],
    async run(args) {
      const target = readTarget(args);
      if (!target) return fail("Give the event's target from list_events.");
      return deleteEvent(target);
    },
  },

  // ── Reminders (one person's own alarms: Maryann's) ──
  {
    name: "get_event_reminders",
    title: "Get event reminders",
    description:
      "Maryann's own reminders on an event, read as her Google account (Google keeps reminders " +
      "per person). Returns every copy of the event (a Hearth event has one per person's " +
      "calendar) with its calendar_id and event_id, the calendar's name, her access_role and " +
      "can_update, the time zone, start and end, whether it repeats and what a change would " +
      "apply to, her pop-ups with when each fires, the calendar's defaults, and " +
      "appointment_check (whether the appointment preset is set and still fits the start). " +
      "suggested_copy is the one to set: on her own calendar when there is one. Setting reminders " +
      "on more than one copy would alarm her twice.",
    inputSchema: {
      type: "object",
      properties: { target: TARGET_SCHEMA },
      required: ["target"],
      additionalProperties: false,
    },
    annotations: READ,
    routes: [],
    async run(args) {
      const target = readTarget(args);
      if (!target) return fail("Give the event's target from list_events.");
      return getEventReminders(target);
    },
  },
  {
    name: "update_event_reminders",
    title: "Set event reminders",
    description:
      "Replace Maryann's reminders on ONE copy of an event (calendar_id and event_id from " +
      "get_event_reminders) with pop-ups, as her Google account. Changes nothing else: title, " +
      "times, attendees, repeats and the rest stay as they are, and nobody is emailed. preset " +
      `"${APPOINTMENT_PRESET}" = 1 week, 3 days, 1 day, 8:00 AM the morning of, and 1 hour before; ` +
      "the 8 a.m. one is worked out from this event's start in its own time zone. All-day " +
      "events and events starting at or before 8 a.m. are refused with a reason, not guessed. Or " +
      "give minutes (up to 5, each 0-40320). dry_run shows the plan without saving. After saving " +
      "it reads the event back and reports verified, preserved, before and after. On a repeating " +
      "event, applies_to says whether it covers the series or one occurrence. Ask Maryann first.",
    inputSchema: {
      type: "object",
      properties: {
        calendar_id: { type: "string", description: "calendar_id of one copy, from get_event_reminders." },
        event_id: { type: "string", description: "event_id of that copy, from get_event_reminders." },
        preset: { type: "string", enum: [APPOINTMENT_PRESET], description: "The appointment reminders." },
        minutes: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 40320 },
          maxItems: 5,
          description: "Exact pop-ups, minutes before the start, instead of a preset.",
        },
        dry_run: { type: "boolean", description: "Show what would be set without saving. Default false." },
      },
      required: ["calendar_id", "event_id"],
      additionalProperties: false,
    },
    annotations: write(false, true),
    routes: [],
    run: (args) =>
      updateEventReminders({
        calendarId: str(args, "calendar_id"),
        eventId: str(args, "event_id"),
        preset: str(args, "preset"),
        minutes: args.minutes,
        dryRun: args.dry_run === true,
      }),
  },
  {
    name: "check_appointment_reminders",
    title: "Check appointment reminders",
    description:
      "Find events in a date range (at most 62 days) that carry Maryann's appointment reminders " +
      "and say which no longer fit: needs_recalculation means the event moved (for example on a " +
      "phone) and the 8 a.m. reminder is stale, so set the preset again; flagged means it is now " +
      "all-day or starts at or before 8 a.m. Read-only. Rescheduling through update_event " +
      "recalculates by itself and reports it in `reminders`.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "First day, YYYY-MM-DD." },
        end_date: { type: "string", description: "Last day, YYYY-MM-DD (inclusive). Defaults to 30 days on." },
      },
      required: ["start_date"],
      additionalProperties: false,
    },
    annotations: READ,
    routes: [],
    async run(args) {
      const tz = resolveTimeZone();
      const startDate = str(args, "start_date") ?? "";
      const endDate = str(args, "end_date") ?? (isRealDate(startDate) ? addDaysIso(startDate, 30) : "");
      if (!isRealDate(startDate) || !isRealDate(endDate)) {
        return fail("Dates must be real days written YYYY-MM-DD.");
      }
      if (endDate < startDate) return fail("end_date must be on or after start_date.");
      return checkAppointmentReminders(
        householdMidnight(startDate, tz),
        householdMidnight(addDaysIso(endDate, 1), tz),
      );
    },
  },

  // ── Clean & Chores (Tada!) ──
  {
    name: "list_cleaning_rooms",
    title: "List cleaning rooms",
    description: "The rooms a cleaning session can focus on, and whose session it is.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ,
    routes: ["GET /api/tasks/rooms"],
    run: () => listRooms(),
  },
  {
    name: "get_next_cleaning_task",
    title: "Get next cleaning task",
    description:
      "The one cleaning task Tada! suggests doing next, optionally in one room. Only ever one " +
      "task; `task: null` means all caught up.",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "Room id from list_cleaning_rooms. Omit for the whole house." },
      },
      additionalProperties: false,
    },
    annotations: READ,
    routes: ["GET /api/tasks/next"],
    run: (args) => nextTask(str(args, "room_id") ?? null),
  },
  {
    name: "list_cleaned_today",
    title: "List cleaning done today",
    description: "Cleaning tasks completed today, newest first, with the completion ids undo takes.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ,
    routes: ["GET /api/tasks/done-today"],
    run: () => doneToday(),
  },
  {
    name: "list_kids_chores",
    title: "List kids' chores",
    description: "Each kid's chores for today, done and not done, with their task and completion ids.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ,
    routes: ["GET /api/tasks/kids"],
    run: () => kidsChores(),
  },
  {
    name: "complete_task",
    title: "Check off task",
    description:
      "Mark a cleaning task or chore done in Tada!. For a cleaning task leave member_id out; for " +
      "a chore pass the kid's id from list_kids_chores. Returns a completion_id for undo.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Task id from get_next_cleaning_task or list_kids_chores." },
        member_id: { type: "string", description: "Tada! id of who did it (get_household). Default: the cleaning member." },
      },
      required: ["task_id"],
      additionalProperties: false,
    },
    annotations: write(false, false),
    routes: ["POST /api/tasks/complete"],
    run: (args) =>
      complete({ taskId: str(args, "task_id"), memberId: str(args, "member_id") ?? getAdultId() }),
  },
  {
    name: "undo_task_completion",
    title: "Undo check-off",
    description:
      "Undo a task completed today. Pass the completion_id and the same member_id it was " +
      "completed as (default: the cleaning member).",
    inputSchema: {
      type: "object",
      properties: {
        completion_id: { type: "string", description: "From complete_task, list_cleaned_today or list_kids_chores." },
        member_id: { type: "string", description: "Tada! id it was completed as. Default: the cleaning member." },
      },
      required: ["completion_id"],
      additionalProperties: false,
    },
    annotations: write(true, true),
    routes: ["POST /api/tasks/undo"],
    run: (args) =>
      undo({ completionId: str(args, "completion_id"), memberId: str(args, "member_id") ?? getAdultId() }),
  },

  // ── Meals & Shopping (Enchanted Spoon) ──
  {
    name: "list_meal_plan",
    title: "List meal plan",
    description:
      "The current meal plan in order: each entry's entry_id (for mark_meal_cooked), meal_id " +
      "(for get_meal), name, scheduled day if any, and whether it's cooked.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ,
    routes: ["GET /api/meals"],
    run: () => mealPlan(),
  },
  {
    name: "get_meal",
    title: "Get meal and recipes",
    description: "One meal's recipes (main and sides) with ingredients and steps. `card: null` if it left the plan.",
    inputSchema: {
      type: "object",
      properties: { meal_id: { type: "string", description: "meal_id from list_meal_plan." } },
      required: ["meal_id"],
      additionalProperties: false,
    },
    annotations: READ,
    routes: ["GET /api/meals/[id]"],
    async run(args) {
      const id = str(args, "meal_id");
      if (!id) return fail("meal_id is required.");
      return mealCard(id);
    },
  },
  {
    name: "mark_meal_cooked",
    title: "Mark meal cooked",
    description:
      "Mark a meal plan entry as cooked, which takes it off the plan on the wall. Undoing it " +
      "happens in Enchanted Spoon, not here.",
    inputSchema: {
      type: "object",
      properties: { entry_id: { type: "string", description: "entry_id from list_meal_plan." } },
      required: ["entry_id"],
      additionalProperties: false,
    },
    annotations: write(false, true),
    routes: ["POST /api/meals/complete"],
    run: (args) => markCooked({ entryId: str(args, "entry_id") }),
  },
  {
    name: "get_shopping_list",
    title: "Get shopping list",
    description: "The household shopping list (still needed items unless include_checked), with categories.",
    inputSchema: {
      type: "object",
      properties: {
        include_checked: { type: "boolean", description: "Also return items already checked off. Default false." },
      },
      additionalProperties: false,
    },
    annotations: READ,
    routes: ["GET /api/shopping"],
    async run(args) {
      const result = await shoppingList();
      if (result.status !== 200) return result;
      const payload = result.body as ShoppingListPayload;
      const items = args.include_checked === true ? payload.items : payload.items.filter((i) => !i.have);
      return ok({ connected: payload.configured, items });
    },
  },
  {
    name: "add_shopping_item",
    title: "Add to shopping list",
    description:
      "Add one item by name. Enchanted Spoon picks the category, skips it if it's already needed, " +
      "and puts a checked-off match back on the list; `status` says which happened.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "The item, e.g. \"milk\". One item per call." } },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: write(false, true),
    routes: ["POST /api/shopping/items"],
    run: (args) => addItem({ name: args.name }),
  },

  // ── Kids' school week (Tandem) ──
  {
    name: "get_kids_schedule",
    title: "Get kids' school schedule",
    description:
      "Lincoln's and Ollie's Monday–Friday school days and activities for one week, read-only. " +
      "Times are 24h HH:MM.",
    inputSchema: {
      type: "object",
      properties: {
        week: {
          type: "string",
          description: "Any date in the week, YYYY-MM-DD. Default: this week (next week on a weekend).",
        },
      },
      additionalProperties: false,
    },
    annotations: READ,
    routes: ["GET /api/schedule"],
    run: (args) => scheduleWeek(str(args, "week") ?? restingMonday(householdToday(resolveTimeZone()))),
  },

  // ── Weather ──
  {
    name: "get_weather",
    title: "Get the weather at home",
    description:
      "The forecast Hearth shows for the household's town: conditions now, the next 12 hours and the next " +
      "few days, in Fahrenheit, with times in the household's timezone. `configured` is false when no town " +
      "has been chosen in Hearth's Settings.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ,
    routes: ["GET /api/weather"],
    run: () => getWeather(),
  },

  // ── Allowance (parent-entered; nothing is synced from Greenlight) ──
  {
    name: "get_allowance",
    title: "Get the kids' allowance balances",
    description:
      "What each kid has, as a parent last entered it on Hearth. These are typed-in amounts, NOT synced " +
      "from Greenlight (Greenlight offers no way to read balances), so `asOf` is when the amount was " +
      "entered and it can be out of date. `cents` is null when nothing has been entered.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ,
    routes: ["GET /api/allowance", "POST /api/allowance/unlock"],
    run: () => listAllowance(),
  },
  {
    name: "set_allowance_balance",
    title: "Set a kid's allowance balance",
    description:
      "Record what one kid has right now (read it off the Greenlight app), replacing the amount shown on " +
      "Hearth. It does not move money or touch Greenlight. An empty `amount` clears the balance.",
    inputSchema: {
      type: "object",
      properties: {
        member: { type: "string", description: "The kid's member key or first name, e.g. \"lincoln\"." },
        amount: { type: "string", description: "Dollars, e.g. \"12\" or \"12.50\". Empty string clears it." },
        note: { type: "string", description: "Optional short note shown with the amount, e.g. \"after birthday money\"." },
      },
      required: ["member", "amount"],
      additionalProperties: false,
    },
    annotations: write(false, true),
    routes: ["PUT /api/allowance"],
    run: (args) => setBalanceTrusted({ member: args.member, amount: args.amount, note: args.note }),
  },
];
