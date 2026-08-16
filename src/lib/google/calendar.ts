import type { CalendarEvent } from "@/lib/calendar/types";
import {
  getMembers,
  getReadCalendarIds,
  getDefaultMemberKey,
  getFamilyCalendarId,
  getMemberCalendarTargets,
  resolveEventColorsFor,
} from "@/lib/calendar/config";
import { addMonths, startOfMonth } from "@/lib/calendar/dates";
import { getAccessToken, isGoogleConfigured } from "./token";
import { getMockEvents, isMockEnabled } from "./mock";

// Google Calendar client (Phase 1 #1–#4, extended in Phase 1.5). Uses
// events.list with a `syncToken` for incremental polls (Phase 1 #3) and requests
// `singleEvents=true` so recurring events arrive already expanded into individual
// instances (Phase 1 #4). As of Phase 1.5 Hearth may also CREATE events
// (create only — no edit, no delete; corrections happen on a phone, spec D2
// amended). Reads and writes both flow through this module.
//
// Sync model
// ----------
// There is no background job — the client polls /api/calendar every 60s, and
// each request opportunistically advances the sync. Per calendar we hold an
// in-memory store: the events within a rolling window (keyed by id) plus the
// nextSyncToken. On each request:
//   * no token yet, or the window has rolled to a new month  -> full sync
//   * otherwise, if enough time has passed since the last one -> incremental sync
// A 410 Gone on an incremental sync means the token expired; we discard it and
// full-sync again (Phase 1 #3). The store is process-memory only (spec D1 — no
// database); a cold start simply full-syncs on the first request.
//
// Note on API constraints: Google forbids `orderBy` together with `syncToken`,
// so ordering is not requested from the API — events are sorted for display in
// the date helpers instead, which achieves the same resolved, ordered result.

const CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars";
const PAGE_SIZE = 2500;

// Only re-run an incremental sync this often, so a burst of requests (prefetch,
// a second tab) collapses to one network round-trip. Comfortably under the 60s
// client poll, so each poll still advances freshness.
const INCREMENTAL_MIN_MS = 20_000;

// Slim the response: everything the normalizer reads, nothing else. Phase 1.5
// adds extendedProperties/private, where Hearth's member tags and countdown flag
// live (Google persists and returns these, and never shows them in its own UI).
const FIELDS =
  "nextPageToken,nextSyncToken,items(id,summary,start,end,status,recurringEventId,extendedProperties/private)";

interface RawEvent {
  id: string;
  summary?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  /** Present on an expanded instance of a repeating event (singleEvents=true). */
  recurringEventId?: string;
  extendedProperties?: { private?: Record<string, string> };
}

/** A calendar Hearth reads, plus its untagged-event fallback color source. */
interface ReadCalendar {
  id: string;
  defaultMemberKey: string | null;
}

interface CalendarStore {
  events: Map<string, CalendarEvent>;
  syncToken: string | null;
  windowKey: string;
  lastSyncAt: number;
}

const stores = new Map<string, CalendarStore>();

/** Raised when Google reports a syncToken has expired (HTTP 410). */
class SyncTokenExpiredError extends Error {}

/** Raised on a failed write, carrying Google's HTTP status for the handler. */
export class CalendarWriteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function readCalendars(): ReadCalendar[] {
  return getReadCalendarIds().map((id) => ({
    id,
    defaultMemberKey: getDefaultMemberKey(id),
  }));
}

// ── Sync window ─────────────────────────────────────────────────────────────
// The store keeps a rolling window around today: last month through three
// months out. That covers the resting view (this month) plus the common
// forward glances, all kept fresh by incremental sync. Navigation outside the
// window falls back to a direct, uncached fetch (see getEvents) — correct, just
// not incrementally synced, which is fine for the rare far-out look.
function windowFor(now: Date): { start: Date; end: Date; key: string } {
  const start = addMonths(startOfMonth(now), -1);
  const end = addMonths(startOfMonth(now), 3);
  return { start, end, key: `${start.getFullYear()}-${start.getMonth()}` };
}

// ── Normalization ───────────────────────────────────────────────────────────
// Parse the Hearth tags Google round-trips in extendedProperties.private:
//   hearthMembers   — comma-separated member keys ("" / missing -> [])
//   hearthCountdown — "1" when set (anything else -> false)
function parseMemberKeys(priv: Record<string, string> | undefined): string[] {
  const raw = priv?.hearthMembers;
  if (!raw) return [];
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function normalize(
  raw: RawEvent,
  calendarId: string,
  defaultMemberKey: string | null,
): CalendarEvent | null {
  const startVal = raw.start?.dateTime ?? raw.start?.date;
  const endVal = raw.end?.dateTime ?? raw.end?.date;
  if (!startVal || !endVal) return null; // malformed / unsupported entry

  const priv = raw.extendedProperties?.private;
  const memberKeys = parseMemberKeys(priv);
  const countdown = priv?.hearthCountdown === "1";
  const hearthGroupId = priv?.hearthGroupId ?? null;

  return {
    id: raw.id,
    title: raw.summary?.trim() || "Busy",
    start: startVal,
    end: endVal,
    allDay: Boolean(raw.start?.date && !raw.start?.dateTime),
    calendarId,
    memberKeys,
    hearthGroupId,
    countdown,
    recurring: Boolean(raw.recurringEventId),
    defaultMemberKey,
    colors: resolveEventColorsFor(memberKeys, calendarId, defaultMemberKey),
  };
}

// ── Low-level fetch ─────────────────────────────────────────────────────────
async function fetchPage(
  calendarId: string,
  params: URLSearchParams,
): Promise<{ items: RawEvent[]; nextPageToken?: string; nextSyncToken?: string }> {
  const url = `${CALENDAR_API}/${encodeURIComponent(calendarId)}/events?${params}`;

  const call = async (token: string) =>
    fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });

  let res = await call(await getAccessToken());
  // A token can be revoked before its stated expiry — refresh once and retry.
  if (res.status === 401) res = await call(await getAccessToken(true));
  if (res.status === 410) throw new SyncTokenExpiredError();
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`events.list failed for ${calendarId} (${res.status}): ${detail}`);
  }
  return res.json();
}

async function paginate(
  calendarId: string,
  base: URLSearchParams,
): Promise<{ items: RawEvent[]; nextSyncToken?: string }> {
  const items: RawEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  do {
    const params = new URLSearchParams(base);
    if (pageToken) params.set("pageToken", pageToken);
    const page = await fetchPage(calendarId, params);
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    // Google only returns nextSyncToken on the final page.
    if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
  } while (pageToken);
  return { items, nextSyncToken };
}

// Shared params for both sync directions — these must be identical across the
// initial and incremental calls or Google invalidates the token.
function baseParams(): URLSearchParams {
  return new URLSearchParams({
    singleEvents: "true",
    showDeleted: "true",
    maxResults: String(PAGE_SIZE),
    fields: FIELDS,
  });
}

// ── Sync directions ─────────────────────────────────────────────────────────
async function fullSync(
  cal: ReadCalendar,
  win: { start: Date; end: Date; key: string },
): Promise<CalendarStore> {
  const params = baseParams();
  params.set("timeMin", win.start.toISOString());
  params.set("timeMax", win.end.toISOString());

  const { items, nextSyncToken } = await paginate(cal.id, params);
  const events = new Map<string, CalendarEvent>();
  for (const raw of items) {
    if (raw.status === "cancelled") continue; // deleted within the window
    const ev = normalize(raw, cal.id, cal.defaultMemberKey);
    if (ev) events.set(ev.id, ev);
  }
  const store: CalendarStore = {
    events,
    syncToken: nextSyncToken ?? null,
    windowKey: win.key,
    lastSyncAt: Date.now(),
  };
  stores.set(cal.id, store);
  return store;
}

async function incrementalSync(
  cal: ReadCalendar,
  store: CalendarStore,
): Promise<void> {
  const params = baseParams();
  params.set("syncToken", store.syncToken as string);

  const { items, nextSyncToken } = await paginate(cal.id, params);
  for (const raw of items) {
    // In an incremental sync a cancelled item means "this event is gone."
    if (raw.status === "cancelled") {
      store.events.delete(raw.id);
      continue;
    }
    const ev = normalize(raw, cal.id, cal.defaultMemberKey);
    if (ev) store.events.set(ev.id, ev);
  }
  if (nextSyncToken) store.syncToken = nextSyncToken;
  store.lastSyncAt = Date.now();
}

/** Bring one calendar's store up to date, full- or incremental-syncing as needed. */
async function ensureFresh(cal: ReadCalendar, now: Date): Promise<CalendarStore> {
  const win = windowFor(now);
  let store = stores.get(cal.id);

  // No store, or the window rolled into a new month → (re)establish by full sync.
  if (!store || store.windowKey !== win.key || !store.syncToken) {
    return fullSync(cal, win);
  }

  if (Date.now() - store.lastSyncAt >= INCREMENTAL_MIN_MS) {
    try {
      await incrementalSync(cal, store);
    } catch (err) {
      if (err instanceof SyncTokenExpiredError) {
        store = await fullSync(cal, win); // 410 → discard token, full resync
      } else {
        throw err;
      }
    }
  }
  return store;
}

// ── Direct (uncached) fetch for out-of-window navigation ────────────────────
async function directFetch(
  cal: ReadCalendar,
  start: Date,
  end: Date,
): Promise<CalendarEvent[]> {
  const params = baseParams();
  params.delete("showDeleted"); // no need for tombstones on a one-shot read
  params.set("showDeleted", "false");
  params.set("timeMin", start.toISOString());
  params.set("timeMax", end.toISOString());
  const { items } = await paginate(cal.id, params);
  const out: CalendarEvent[] = [];
  for (const raw of items) {
    if (raw.status === "cancelled") continue;
    const ev = normalize(raw, cal.id, cal.defaultMemberKey);
    if (ev) out.push(ev);
  }
  return out;
}

// ── Presentation: fan-out de-dup ─────────────────────────────────────────────
// The wall shows every event across the read calendars — a member's own events
// render in their color (owning-calendar default), family-calendar events read
// orange, and each per-person copy of a Hearth event is collapsed back into ONE
// banded chip. (Earlier this filtered to "coordinated only"; the household
// creates most events from their phones, so the wall now shows those too.)

// An occurrence key that is stable across copies and across insert-vs-list, and
// independent of how Google formats the UTC offset: the instant in epoch-ms for
// timed events, the bare date for all-day. Recurring instances differ by start
// so they stay separate; the N copies of one occurrence share it so they merge.
function occToken(ev: CalendarEvent): string {
  return ev.allDay ? ev.start : String(new Date(ev.start).getTime());
}

// One representative for a group of copies. Colors/title are identical across
// copies (same canonical hearthMembers), so any copy renders the same chip; pick
// deterministically. The id is a STABLE synthetic derived from the group so the
// POST response (built by running this same de-dup over the inserted copies) and
// the later poll produce the same id — the optimistic merge matches by construction.
function representative(copies: CalendarEvent[]): CalendarEvent {
  const chosen = [...copies].sort((a, b) => a.calendarId.localeCompare(b.calendarId))[0];
  return { ...chosen, id: `hearth:${chosen.hearthGroupId}:${occToken(chosen)}` };
}

/** Collapse fan-out copies (same hearthGroupId + occurrence) into one event. */
export function dedupeHearthGroups(events: CalendarEvent[]): CalendarEvent[] {
  const groups = new Map<string, CalendarEvent[]>();
  const out: CalendarEvent[] = [];
  for (const ev of events) {
    if (!ev.hearthGroupId) {
      out.push(ev); // family/legacy events pass through untouched
      continue;
    }
    const key = `${ev.hearthGroupId}::${occToken(ev)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(ev);
    else groups.set(key, [ev]);
  }
  for (const copies of groups.values()) out.push(representative(copies));
  return out;
}

/** The wall-ready view: de-dup fan-out copies into one banded chip each. */
function presentEvents(events: CalendarEvent[]): CalendarEvent[] {
  return dedupeHearthGroups(events);
}

// ── Public API ──────────────────────────────────────────────────────────────
function overlaps(ev: CalendarEvent, start: Date, end: Date): boolean {
  const s = new Date(ev.start).getTime();
  const e = new Date(ev.end).getTime();
  return s < end.getTime() && e > start.getTime();
}

/**
 * Every wall-ready event overlapping [start, end): fetched across all read
 * calendars, filtered to coordinated events, and with fan-out copies collapsed
 * into one banded chip each (see `presentEvents`). Serves from the synced store
 * when the range sits inside the rolling window; otherwise does a direct fetch.
 * Both the mock and the real feed flow through the SAME presentation step so the
 * local wall exercises the exact filter + de-dup. Returns [] (never throws) when
 * Google isn't configured yet — the view then renders a calm empty grid.
 */
export async function getEvents(start: Date, end: Date): Promise<CalendarEvent[]> {
  if (isMockEnabled()) return presentEvents(getMockEvents(start, end));
  if (!isGoogleConfigured()) return [];

  const calendars = readCalendars();
  const now = new Date();
  const win = windowFor(now);
  const inWindow =
    start.getTime() >= win.start.getTime() && end.getTime() <= win.end.getTime();

  const perCalendar = await Promise.all(
    calendars.map(async (cal) => {
      try {
        if (inWindow) {
          const store = await ensureFresh(cal, now);
          return [...store.events.values()].filter((ev) => overlaps(ev, start, end));
        }
        return await directFetch(cal, start, end);
      } catch (err) {
        // One unreadable calendar must not blank the whole wall (spec §6.2). A
        // 404/403 here is a config problem — the calendar isn't shared with the
        // household account — not a transient outage. Skip it, keep the others,
        // and log which one so the misconfigured share is diagnosable. The next
        // poll retries, so it self-heals once the share is fixed.
        console.error(`[calendar] skipping ${cal.id}:`, err);
        return [] as CalendarEvent[];
      }
    }),
  );

  return presentEvents(perCalendar.flat());
}

// ── Write path (Phase 1.5) ───────────────────────────────────────────────────
/** The Google event body Hearth constructs for a create. */
export interface GoogleEventInput {
  summary: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
  reminders: { useDefault: false; overrides: { method: "popup"; minutes: number }[] };
  extendedProperties: { private: Record<string, string> };
  /** Carried onto per-person copies from a phone-made source event (edit path). */
  description?: string;
  location?: string;
}

/**
 * A partial update body for events.patch. `start`/`end` allow `null` on the
 * unused key so an all-day↔timed switch clears the counterpart (Google merges
 * nested objects, so a leftover `dateTime`/`date` would otherwise survive).
 * Deliberately never carries `reminders`/`recurrence` — edits leave those intact.
 */
export interface EventPatch {
  summary?: string;
  start?: { date?: string | null; dateTime?: string | null; timeZone?: string | null };
  end?: { date?: string | null; dateTime?: string | null; timeZone?: string | null };
  extendedProperties?: { private: Record<string, string> };
}

/**
 * Create one event on `calendarId` and return it normalized through the SAME
 * path as reads, so the client receives a shape identical to a polled event
 * (Phase 1.5 #8). The freshly created event is also seeded into the in-memory
 * store, so a poll landing before the next incremental sync still sees it.
 *
 * The caller (the route handler) is responsible for authorization and for
 * validating that `calendarId` is a writable allowlisted target — this function
 * trusts both. It throws CalendarWriteError (carrying Google's status) on
 * failure so the handler can translate it.
 */
export async function insertEvent(
  calendarId: string,
  input: GoogleEventInput,
): Promise<CalendarEvent> {
  // Local mock: don't call Google (there are no credentials). Synthesize the
  // event so the whole create flow — validation, optimistic insert, chip render
  // — can be exercised offline. Never reached in a real deploy.
  if (isMockEnabled()) return mockInsert(calendarId, input);

  const url = `${CALENDAR_API}/${encodeURIComponent(calendarId)}/events`;

  const call = async (token: string) =>
    fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
      cache: "no-store",
    });

  let res = await call(await getAccessToken());
  if (res.status === 401) res = await call(await getAccessToken(true));
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new CalendarWriteError(
      `events.insert failed for ${calendarId} (${res.status}): ${detail}`,
      res.status,
    );
  }

  const raw = (await res.json()) as RawEvent;
  const defaultMemberKey = getDefaultMemberKey(calendarId);
  const event = normalize(raw, calendarId, defaultMemberKey);
  if (!event) {
    throw new CalendarWriteError("created event could not be normalized", 502);
  }

  // Seed the store so an immediate poll doesn't briefly miss the new event.
  const store = stores.get(calendarId);
  if (store) store.events.set(event.id, event);

  return event;
}

/**
 * Update one event in place (events.patch) and return it normalized. Used by the
 * edit reconcile to keep a kept copy's fields in sync. Seeds the store like
 * insertEvent. Trusts the caller for authorization (route handler).
 */
export async function patchEvent(
  calendarId: string,
  eventId: string,
  patch: EventPatch,
): Promise<CalendarEvent> {
  if (isMockEnabled()) return mockPatch(calendarId, eventId, patch);

  const url = `${CALENDAR_API}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const call = async (token: string) =>
    fetch(url, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(patch),
      cache: "no-store",
    });

  let res = await call(await getAccessToken());
  if (res.status === 401) res = await call(await getAccessToken(true));
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new CalendarWriteError(
      `events.patch failed for ${calendarId}/${eventId} (${res.status}): ${detail}`,
      res.status,
    );
  }

  const raw = (await res.json()) as RawEvent;
  const event = normalize(raw, calendarId, getDefaultMemberKey(calendarId));
  if (!event) throw new CalendarWriteError("patched event could not be normalized", 502);

  const store = stores.get(calendarId);
  if (store) store.events.set(event.id, event);
  return event;
}

/** Synthesize a created event for local mock mode (see insertEvent). */
function mockInsert(calendarId: string, input: GoogleEventInput): CalendarEvent {
  const priv = input.extendedProperties.private;
  const memberKeys = (priv.hearthMembers ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const defaultMemberKey = getDefaultMemberKey(calendarId);
  const allDay = Boolean(input.start.date);
  const event: CalendarEvent = {
    id: `mock-created-${calendarId}-${Date.now()}`,
    title: input.summary,
    start: input.start.date ?? input.start.dateTime ?? "",
    end: input.end.date ?? input.end.dateTime ?? "",
    allDay,
    calendarId,
    memberKeys,
    hearthGroupId: priv.hearthGroupId ?? null,
    countdown: priv.hearthCountdown === "1",
    recurring: false,
    defaultMemberKey,
    colors: resolveEventColorsFor(memberKeys, calendarId, defaultMemberKey),
  };
  return event;
}

/**
 * Synthesize a patched event for local mock mode. The reconcile always sends a
 * FULL patch (summary + start + end + private), so we can rebuild the whole
 * event from the patch alone.
 */
function mockPatch(
  calendarId: string,
  eventId: string,
  patch: EventPatch,
): CalendarEvent {
  const priv = patch.extendedProperties?.private ?? {};
  const memberKeys = (priv.hearthMembers ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const defaultMemberKey = getDefaultMemberKey(calendarId);
  const allDay = Boolean(patch.start?.date);
  return {
    id: eventId,
    title: patch.summary ?? "",
    start: patch.start?.date ?? patch.start?.dateTime ?? "",
    end: patch.end?.date ?? patch.end?.dateTime ?? "",
    allDay,
    calendarId,
    memberKeys,
    hearthGroupId: priv.hearthGroupId ?? null,
    countdown: priv.hearthCountdown === "1",
    recurring: false,
    defaultMemberKey,
    colors: resolveEventColorsFor(memberKeys, calendarId, defaultMemberKey),
  };
}

// ── Delete path (fan-out) ─────────────────────────────────────────────────────
// Removing a Hearth event means removing every per-person copy. Copies are found
// by querying each read calendar for the shared hearthGroupId private property —
// robust regardless of in-memory store state, and independent of the synthetic
// wall id. `singleEvents=false` returns a recurring event's single canonical
// parent, so deleting it removes the whole series in one call.

/** The Google event ids on `calendarId` that belong to a hearthGroupId. */
async function findGroupEventIds(
  calendarId: string,
  hearthGroupId: string,
): Promise<string[]> {
  const base = new URLSearchParams({
    singleEvents: "false",
    showDeleted: "false",
    maxResults: String(PAGE_SIZE),
    privateExtendedProperty: `hearthGroupId=${hearthGroupId}`,
    fields: "nextPageToken,items(id,status)",
  });
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams(base);
    if (pageToken) params.set("pageToken", pageToken);
    const page = await fetchPage(calendarId, params);
    for (const raw of page.items ?? []) {
      if (raw.status === "cancelled") continue;
      ids.push(raw.id);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return ids;
}

/** Delete one event; a 404/410 (already gone) is treated as success (idempotent). */
async function deleteOne(calendarId: string, eventId: string): Promise<void> {
  const url = `${CALENDAR_API}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const call = async (token: string) =>
    fetch(url, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });

  let res = await call(await getAccessToken());
  if (res.status === 401) res = await call(await getAccessToken(true));
  if (res.status === 404 || res.status === 410) return;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new CalendarWriteError(
      `events.delete failed for ${calendarId}/${eventId} (${res.status}): ${detail}`,
      res.status,
    );
  }
}

/**
 * Remove every per-person copy of a Hearth-created event across all read
 * calendars, by its shared hearthGroupId. Best-effort: a calendar that fails is
 * reported (not fatal), so a partial share still deletes what it can. Also purges
 * matching entries from the in-memory stores so an immediate poll doesn't briefly
 * resurrect the event. Mock mode is a no-op success (nothing lives server-side).
 */
export async function deleteHearthGroup(
  hearthGroupId: string,
): Promise<{ deleted: number; failures: { calendarId: string; status: number }[] }> {
  if (isMockEnabled() || !isGoogleConfigured()) return { deleted: 0, failures: [] };

  const failures: { calendarId: string; status: number }[] = [];
  let deleted = 0;

  await Promise.all(
    getReadCalendarIds().map(async (calendarId) => {
      try {
        const ids = await findGroupEventIds(calendarId, hearthGroupId);
        for (const eventId of ids) {
          await deleteOne(calendarId, eventId);
          deleted++;
        }
      } catch (err) {
        const status = err instanceof CalendarWriteError ? err.status : 500;
        console.error(`[calendar] delete failed on ${calendarId}:`, err);
        failures.push({ calendarId, status });
      } finally {
        // Purge any stored copies for this group (covers recurring instances,
        // whose ids differ from the deleted parent) so the store can't re-serve it.
        const store = stores.get(calendarId);
        if (store) {
          for (const [id, ev] of store.events) {
            if (ev.hearthGroupId === hearthGroupId) store.events.delete(id);
          }
        }
      }
    }),
  );

  return { deleted, failures };
}

// ── Edit path (reconcile helpers) ─────────────────────────────────────────────

/** Delete one specific copy (not the whole group) and purge it from its store. */
export async function deleteEventCopy(
  calendarId: string,
  eventId: string,
): Promise<void> {
  if (isMockEnabled() || !isGoogleConfigured()) return;
  await deleteOne(calendarId, eventId);
  stores.get(calendarId)?.events.delete(eventId);
}

/**
 * Every copy of a Hearth group across the read calendars, as {calendarId,
 * eventId} pairs — the edit reconcile's "current copies". Uses the same
 * privateExtendedProperty lookup as delete (singleEvents=false → the canonical
 * event id per calendar). Best-effort per calendar. Empty in mock.
 */
export async function findHearthCopies(
  hearthGroupId: string,
): Promise<{ calendarId: string; eventId: string }[]> {
  if (isMockEnabled()) {
    // Mock has no server store, so derive the copies from the synthetic feed —
    // enough to exercise the edit reconcile offline.
    const now = new Date();
    const span = 90 * 86_400_000;
    return getMockEvents(new Date(now.getTime() - span), new Date(now.getTime() + span))
      .filter((e) => e.hearthGroupId === hearthGroupId)
      .map((e) => ({ calendarId: e.calendarId, eventId: e.id }));
  }
  if (!isGoogleConfigured()) return [];
  const out: { calendarId: string; eventId: string }[] = [];
  await Promise.all(
    getReadCalendarIds().map(async (calendarId) => {
      try {
        const ids = await findGroupEventIds(calendarId, hearthGroupId);
        for (const eventId of ids) out.push({ calendarId, eventId });
      } catch (err) {
        console.error(`[calendar] findHearthCopies failed on ${calendarId}:`, err);
      }
    }),
  );
  return out;
}

/** Fields the reconcile needs from a source event: recurrence flag + body to carry. */
export interface SourceFields {
  recurring: boolean;
  description?: string;
  location?: string;
  reminders?: GoogleEventInput["reminders"];
}

/**
 * Read the recurrence flag and carry-forward body (description/location/
 * reminders) of one event via events.get. Returns null if it's gone (404/410).
 * Null in mock (the caller then treats it as a non-recurring event with no
 * carry-forward). Used to (a) block editing a repeating event server-side and
 * (b) copy a phone-made event's body onto newly-created per-person copies.
 */
export async function getSourceFields(
  calendarId: string,
  eventId: string,
): Promise<SourceFields | null> {
  if (isMockEnabled()) return { recurring: false }; // mock events are never recurring
  if (!isGoogleConfigured()) return null;

  const url =
    `${CALENDAR_API}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}` +
    `?fields=recurringEventId,recurrence,description,location,reminders`;
  const call = async (token: string) =>
    fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });

  let res = await call(await getAccessToken());
  if (res.status === 401) res = await call(await getAccessToken(true));
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new CalendarWriteError(
      `events.get failed for ${calendarId}/${eventId} (${res.status}): ${detail}`,
      res.status,
    );
  }

  const raw = (await res.json()) as {
    recurringEventId?: string;
    recurrence?: string[];
    description?: string;
    location?: string;
    reminders?: { useDefault?: boolean; overrides?: { method: "popup"; minutes: number }[] };
  };
  const overrides = raw.reminders?.overrides;
  return {
    recurring: Boolean(raw.recurringEventId) || Array.isArray(raw.recurrence),
    description: raw.description,
    location: raw.location,
    reminders: overrides?.length ? { useDefault: false, overrides } : undefined,
  };
}

// ── Reconcile (shared by create + edit) ───────────────────────────────────────

/** The desired end-state of an event, calendar-agnostic. */
export interface EventSpec {
  summary: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  /** Create only — edits never touch recurrence. */
  recurrence?: string[];
  reminders: GoogleEventInput["reminders"];
  countdown: boolean;
  /** Canonicalized (MEMBERS order, deduped). Non-empty (enforced upstream). */
  memberKeys: string[];
}

export interface ReconcileTarget {
  /** Existing Google events for this logical event (empty for a fresh create). */
  currentCopies: { calendarId: string; eventId: string }[];
  /** The event's existing hearthGroupId, or null (create / plain personal). */
  existingGroupId: string | null;
  /** Keep it a plain, untagged personal event (no group, no member tags). */
  plain: boolean;
  /** Body to carry onto newly-created copies (from a phone-made source event). */
  carry: SourceFields | null;
}

export interface ReconcileResult {
  event: CalendarEvent | null; // null ⇒ nothing landed (caller returns 502)
  failures: { calendarId: string; memberKey?: string; reason: string }[];
}

/** A patch date object: fill the unused key with null so a mode switch clears it. */
function patchDate(d: { date?: string; dateTime?: string; timeZone?: string }) {
  return d.date
    ? { date: d.date, dateTime: null, timeZone: null }
    : { dateTime: d.dateTime ?? null, timeZone: d.timeZone ?? null, date: null };
}

/**
 * Bring an event to `spec` across exactly the calendars it should live on:
 *   - assignment == all members → the single family calendar (when configured);
 *   - otherwise → one copy per assignee's calendar.
 * Patches copies that should stay, creates the ones that are missing, and — only
 * after at least one create/patch succeeds — deletes the ones that shouldn't
 * exist. Best-effort: per-calendar failures are reported, never fatal, and the
 * event is never deleted into nothing. Returns the de-duped representative.
 * Shared by POST (create: no current copies) and PUT (edit).
 */
export async function reconcileEvent(
  spec: EventSpec,
  target: ReconcileTarget,
): Promise<ReconcileResult> {
  const failures: ReconcileResult["failures"] = [];

  const isFamily = spec.memberKeys.length === getMembers().length;
  const family = getFamilyCalendarId();
  const memberTargets = getMemberCalendarTargets(spec.memberKeys);
  const desiredCalendars =
    isFamily && family ? [family] : memberTargets.map((t) => t.calendarId);

  // Assigned people with no calendar configured — reported, not fatal.
  if (!(isFamily && family)) {
    const have = new Set(memberTargets.map((t) => t.memberKey));
    for (const k of spec.memberKeys) {
      if (!have.has(k)) failures.push({ calendarId: "", memberKey: k, reason: "no-calendar" });
    }
  }

  // Never delete-into-nothing.
  if (desiredCalendars.length === 0) return { event: null, failures };

  const groupId = target.plain
    ? undefined
    : target.existingGroupId ?? crypto.randomUUID();

  const privateBase: Record<string, string> = {
    hearthCountdown: spec.countdown ? "1" : "0",
  };
  if (groupId) {
    privateBase.hearthGroupId = groupId;
    privateBase.hearthMembers = spec.memberKeys.join(",");
  }

  const currentByCalendar = new Map(
    target.currentCopies.map((c) => [c.calendarId, c.eventId]),
  );

  // ── Phase A: patch kept copies + create missing ones (delete nothing yet). ──
  const writes = await Promise.allSettled(
    desiredCalendars.map((cal) => {
      const priv = { ...privateBase };
      if (groupId) priv.hearthOwner = getDefaultMemberKey(cal) ?? "family";
      const existingId = currentByCalendar.get(cal);
      if (existingId) {
        return patchEvent(cal, existingId, {
          summary: spec.summary,
          start: patchDate(spec.start),
          end: patchDate(spec.end),
          extendedProperties: { private: priv },
        });
      }
      const input: GoogleEventInput = {
        summary: spec.summary,
        start: spec.start,
        end: spec.end,
        reminders: target.carry?.reminders ?? spec.reminders,
        extendedProperties: { private: priv },
      };
      if (spec.recurrence) input.recurrence = spec.recurrence;
      if (target.carry?.description) input.description = target.carry.description;
      if (target.carry?.location) input.location = target.carry.location;
      return insertEvent(cal, input);
    }),
  );

  const created: CalendarEvent[] = [];
  writes.forEach((r, i) => {
    if (r.status === "fulfilled") {
      created.push(r.value);
    } else {
      const cal = desiredCalendars[i];
      console.error(`[calendar] reconcile write failed on ${cal}:`, r.reason);
      const reason =
        r.reason instanceof CalendarWriteError && r.reason.status === 403
          ? "no-access"
          : "error";
      failures.push({ calendarId: cal, memberKey: getDefaultMemberKey(cal) ?? undefined, reason });
    }
  });

  // Never lose the event: if not one copy landed, delete nothing.
  if (created.length === 0) return { event: null, failures };

  // ── Phase B: delete copies that should no longer exist. ─────────────────────
  const desiredSet = new Set(desiredCalendars);
  await Promise.all(
    target.currentCopies
      .filter((c) => !desiredSet.has(c.calendarId))
      .map(async (c) => {
        try {
          await deleteEventCopy(c.calendarId, c.eventId);
        } catch (err) {
          console.error(`[calendar] reconcile delete failed on ${c.calendarId}:`, err);
          failures.push({ calendarId: c.calendarId, reason: "delete-failed" });
        }
      }),
  );

  return { event: dedupeHearthGroups(created)[0] ?? null, failures };
}
