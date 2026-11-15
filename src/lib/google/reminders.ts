import { getDefaultMemberKey, getMembers } from "@/lib/calendar/config";
import { resolveTimeZone } from "@/lib/calendar/recurrence";
import { CalendarWriteError } from "./calendar";
import { getMockEvents, isMockEnabled } from "./mock";
import { getReminderAccessToken, isReminderAccountConfigured } from "./token";

// Google calls for one person's event reminders (the MCP reminder tools).
//
// Google keeps `reminders` private to each user: what events.get returns, and
// what events.patch sets, are the AUTHENTICATED user's reminders for that event.
// So everything here runs as the reminder account (GOOGLE_REMINDER_REFRESH_TOKEN,
// Maryann), never the household account, or the alarms would land on nobody's
// phone. The only write is a PATCH whose body is `reminders` alone, guarded by
// the event's etag, so title, times, attendees, recurrence and every other field
// stay exactly as they were, and nobody is emailed (sendUpdates=none).
//
// Callers allowlist calendar ids against the read set first (calendar/reminders.ts).

const API = "https://www.googleapis.com/calendar/v3";
const EVENT_FIELDS = "id,etag,status,summary,start,end,recurringEventId,recurrence,reminders";
const CALENDAR_CACHE_MS = 10 * 60_000;

export interface ReminderOverride {
  method: string;
  minutes: number;
}

export interface GoogleTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

/** One event as the reminder account sees it. */
export interface ReminderEvent {
  calendarId: string;
  eventId: string;
  etag: string | null;
  title: string;
  start: GoogleTime;
  end: GoogleTime;
  /** Set on one occurrence of a repeating event. */
  recurringEventId: string | null;
  /** True on a repeating event's series (its rules live here). */
  isSeries: boolean;
  useDefault: boolean;
  overrides: ReminderOverride[];
}

/** The reminder account's view of one calendar: its access and settings. */
export interface ReminderCalendar {
  calendarId: string;
  /** False when the calendar isn't in the account's calendar list. */
  inList: boolean;
  name: string | null;
  /** owner | writer | reader | freeBusyReader, or null when unknown. */
  accessRole: string | null;
  timeZone: string | null;
  defaultReminders: ReminderOverride[];
}

/** Whether the reminder tools can run at all (a real token, or the local mock). */
export function remindersAvailable(): boolean {
  return isMockEnabled() || isReminderAccountConfigured();
}

/** The member whose reminders these are (GOOGLE_REMINDER_MEMBER, default the first member). */
export function reminderMember(): { key: string; name: string } | null {
  const members = getMembers();
  const key = process.env.GOOGLE_REMINDER_MEMBER?.trim() || members[0]?.key;
  const m = members.find((mm) => mm.key === key);
  return m ? { key: m.key, name: m.name } : null;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

/** Call Google as the reminder account, refreshing the token once on a 401. */
async function call(url: string, init: RequestInit = {}): Promise<Response> {
  const go = async (token: string) =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  let res = await go(await getReminderAccessToken());
  if (res.status === 401) res = await go(await getReminderAccessToken(true));
  return res;
}

interface RawEvent {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  start?: GoogleTime;
  end?: GoogleTime;
  recurringEventId?: string;
  recurrence?: string[];
  reminders?: { useDefault?: boolean; overrides?: ReminderOverride[] };
}

function shape(raw: RawEvent, calendarId: string): ReminderEvent {
  return {
    calendarId,
    eventId: raw.id,
    etag: raw.etag ?? null,
    title: raw.summary?.trim() || "Busy",
    start: raw.start ?? {},
    end: raw.end ?? {},
    recurringEventId: raw.recurringEventId ?? null,
    isSeries: Array.isArray(raw.recurrence) && raw.recurrence.length > 0,
    useDefault: raw.reminders?.useDefault !== false,
    overrides: raw.reminders?.overrides ?? [],
  };
}

const calendarCache = new Map<string, { at: number; value: ReminderCalendar }>();

/**
 * The reminder account's access role, time zone and default reminders for a
 * calendar (calendarList.get). Cached for ten minutes. A calendar missing from
 * the list, or a token without the calendar-list scope, reads as unknown access
 * rather than failing: the event read that follows is the real permission test.
 */
export async function getReminderCalendar(calendarId: string): Promise<ReminderCalendar> {
  if (isMockEnabled()) return mockCalendar(calendarId);
  const hit = calendarCache.get(calendarId);
  if (hit && Date.now() - hit.at < CALENDAR_CACHE_MS) return hit.value;

  const url =
    `${API}/users/me/calendarList/${encodeURIComponent(calendarId)}` +
    `?fields=summary,summaryOverride,accessRole,timeZone,defaultReminders`;
  const res = await call(url);
  let value: ReminderCalendar;
  if (res.ok) {
    const raw = (await res.json()) as {
      summary?: string;
      summaryOverride?: string;
      accessRole?: string;
      timeZone?: string;
      defaultReminders?: ReminderOverride[];
    };
    value = {
      calendarId,
      inList: true,
      name: raw.summaryOverride || raw.summary || null,
      accessRole: raw.accessRole ?? null,
      timeZone: raw.timeZone ?? null,
      defaultReminders: raw.defaultReminders ?? [],
    };
  } else {
    if (res.status !== 404) {
      console.error(`[reminders] calendarList.get ${calendarId} → ${res.status}`);
    }
    value = {
      calendarId,
      inList: false,
      name: null,
      accessRole: null,
      timeZone: null,
      defaultReminders: [],
    };
  }
  calendarCache.set(calendarId, { at: Date.now(), value });
  return value;
}

/** One event with the reminder account's reminders, or null when it's gone or not visible. */
export async function getReminderEvent(
  calendarId: string,
  eventId: string,
): Promise<ReminderEvent | null> {
  if (isMockEnabled()) return mockGet(calendarId, eventId);
  const url =
    `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}` +
    `?fields=${EVENT_FIELDS}`;
  const res = await call(url);
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new CalendarWriteError(
      `events.get (reminders) failed for ${calendarId}/${eventId} (${res.status}): ${detail}`,
      res.status,
    );
  }
  const raw = (await res.json()) as RawEvent;
  if (raw.status === "cancelled") return null;
  return shape(raw, calendarId);
}

/**
 * Replace the reminder account's reminders on one event with `overrides`,
 * touching nothing else. `etag` makes Google refuse (412) if the event changed
 * since it was read (a reschedule would make the 8 a.m. minutes wrong).
 */
export async function patchReminders(
  calendarId: string,
  eventId: string,
  overrides: ReminderOverride[],
  etag: string | null,
): Promise<ReminderEvent> {
  if (isMockEnabled()) return mockPatch(calendarId, eventId, overrides, etag);
  const url =
    `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}` +
    `?sendUpdates=none&fields=${EVENT_FIELDS}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (etag) headers["if-match"] = etag;
  const res = await call(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ reminders: { useDefault: false, overrides } }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new CalendarWriteError(
      `events.patch (reminders) failed for ${calendarId}/${eventId} (${res.status}): ${detail}`,
      res.status,
    );
  }
  return shape((await res.json()) as RawEvent, calendarId);
}

// ── Local mock (HEARTH_CALENDAR_MOCK, never in production) ───────────────────
// Reminders kept in process memory over the synthetic feed, so the tools'
// read → plan → save → read-back loop can be exercised end to end offline.

const mockStore = new Map<string, { overrides: ReminderOverride[]; version: number }>();

function mockCalendar(calendarId: string): ReminderCalendar {
  const known = getMembers().some((m) => m.calendarId === calendarId) ||
    getDefaultMemberKey(calendarId) !== null ||
    calendarId.startsWith("family@");
  const own = reminderMember();
  const ownCal = getMembers().find((m) => m.key === own?.key)?.calendarId;
  return {
    calendarId,
    inList: known,
    name: known ? calendarId.split("@")[0] : null,
    accessRole: known ? (calendarId === ownCal ? "owner" : "writer") : null,
    timeZone: known ? resolveTimeZone() : null,
    defaultReminders: [{ method: "popup", minutes: 30 }],
  };
}

function mockGet(calendarId: string, eventId: string): ReminderEvent | null {
  const now = Date.now();
  const span = 120 * 86_400_000;
  const ev = getMockEvents(new Date(now - span), new Date(now + span)).find(
    (e) => e.calendarId === calendarId && e.id === eventId,
  );
  if (!ev) return null;
  const stored = mockStore.get(`${calendarId}/${eventId}`);
  return {
    calendarId,
    eventId,
    etag: `"mock-${stored?.version ?? 0}"`,
    title: ev.title,
    start: ev.allDay ? { date: ev.start } : { dateTime: ev.start },
    end: ev.allDay ? { date: ev.end } : { dateTime: ev.end },
    recurringEventId: null,
    isSeries: false,
    useDefault: !stored,
    overrides: stored?.overrides ?? [],
  };
}

function mockPatch(
  calendarId: string,
  eventId: string,
  overrides: ReminderOverride[],
  etag: string | null,
): ReminderEvent {
  const current = mockGet(calendarId, eventId);
  if (!current) throw new CalendarWriteError("mock event not found", 404);
  if (etag && etag !== current.etag) throw new CalendarWriteError("mock etag mismatch", 412);
  const key = `${calendarId}/${eventId}`;
  mockStore.set(key, { overrides, version: (mockStore.get(key)?.version ?? 0) + 1 });
  return mockGet(calendarId, eventId) as ReminderEvent;
}
