// Shared calendar types. Deliberately free of any server-only import (no
// node:crypto, no process access at module scope beyond what tree-shakes away),
// so both the route handler and the client view components can import it.
//
// Google Calendar is the system of record (spec D2, amended in Phase 1.5).
// Hearth reads it and — as of Phase 1.5 — may *create* events on it (create
// only; edit/delete happen on a phone). Each event is reshaped into exactly this
// flat, render-ready form: nothing the wall does not need to draw a chip.

/**
 * One event, normalized for the wall.
 *
 * Color comes from member *tags* first, falling back to the owning calendar
 * (spec D3, amended in Phase 1.5). `where it lives` (calendarId) and `who it
 * concerns` (memberKeys) are separate ideas now that events can be created here.
 * The resolved band colors are baked in server-side (`colors`) so client chips
 * need no access to the members/calendar config.
 */
export interface CalendarEvent {
  /** Google event id (already expanded for recurring instances). */
  id: string;
  title: string;
  /**
   * ISO 8601. For timed events this is a full datetime with offset. For all-day
   * events it is a date-only "YYYY-MM-DD".
   */
  start: string;
  /**
   * ISO 8601. For timed events, the end instant. For all-day events, Google's
   * EXCLUSIVE end date — a one-day event on the 13th has end "2026-08-14".
   * `dates.eventCoversDay` accounts for that exclusivity.
   */
  end: string;
  allDay: boolean;
  /** The Google calendar this event lives on ("where it lives"). */
  calendarId: string;
  /**
   * Hearth member tags ("who it concerns"), from
   * `extendedProperties.private.hearthMembers`. Empty for untagged events —
   * every Phase 1 event, which keeps rendering by owning-calendar color.
   */
  memberKeys: string[];
  /**
   * The fan-out group id (`extendedProperties.private.hearthGroupId`), shared by
   * every per-person copy of a Hearth-created event. Null for events Hearth did
   * not create (Family-calendar entries, legacy events). The read path collapses
   * all copies sharing a groupId+occurrence into one banded chip, and the delete
   * path removes every copy by this id.
   */
  hearthGroupId: string | null;
  /** Countdown flag, from `extendedProperties.private.hearthCountdown`. */
  countdown: boolean;
  /**
   * True when this is an instance of a repeating event (has `recurringEventId`).
   * The wall blocks editing repeating events (do it on a phone); delete still
   * works (it removes the whole series).
   */
  recurring: boolean;
  /**
   * The owning calendar's `defaultMemberKey` — the fallback color source for an
   * untagged event. Null when the calendar declares no default.
   */
  defaultMemberKey: string | null;
  /**
   * Ordered band colors (palette slugs), resolved server-side by
   * `resolveEventColors`. One entry for a solid chip; two or three for bands;
   * four or more collapse to the "everyone" treatment in the chip. Always at
   * least one element (a neutral) so a chip is never colorless.
   */
  colors: string[];
}

/**
 * One taggable person. The canonical list comes from the `MEMBERS` env var
 * (Phase 1.5, extended for per-person calendars). `key` is the stable slug
 * written into `hearthMembers`; `color` is a palette slug resolving to
 * `var(--color-<color>)`; `calendarId` is the member's own Google calendar,
 * where their color-tagged copy of an assigned event is written.
 */
export interface Member {
  key: string;
  name: string;
  color: string;
  /** The member's own Google calendar id (their assigned events' write target). */
  calendarId?: string;
}

/**
 * The GET /api/calendar payload. `configured` is false when Google credentials
 * or the read-calendar config are absent — the view then renders a calm empty
 * grid rather than an error, honoring the failure contract (spec §6.2).
 */
export interface CalendarPayload {
  events: CalendarEvent[];
  /** The taggable people, for filter chips and the Assign control. */
  members: Member[];
  configured: boolean;
}

// ── Event-creation contract (client → POST /api/calendar/events) ────────────
// The client sends naive wall-local date/time strings and structured choices;
// the server attaches HOUSEHOLD_TIMEZONE and builds the RRULE (Phase 1.5 #13 —
// recurrence is assembled server-side, never in the browser).

export type RepeatFreq = "daily" | "weekly" | "monthly" | "yearly";

export type RepeatEnd =
  | { mode: "never" }
  | { mode: "count"; count: number }
  | { mode: "until"; until: string }; // "YYYY-MM-DD"

export interface RepeatRule {
  freq: RepeatFreq;
  end: RepeatEnd;
}

export interface CreateEventBody {
  title: string;
  allDay: boolean;
  /** Timed: "YYYY-MM-DDTHH:mm". All-day: "YYYY-MM-DD". Wall-local, naive. */
  start: string;
  /** Same forms as `start`. All-day end is INCLUSIVE (the last covered day). */
  end: string;
  memberKeys: string[];
  repeat: RepeatRule | null;
  countdown: boolean;
  /** Minutes before start: null = none, 0 = at time of event, else N minutes. */
  reminderMinutes: number | null;
}

/**
 * Edit contract (client → PUT /api/calendar/events). Same wall-local date/time
 * strings as create, but NO repeat/reminder — those are created-once and edited
 * on a phone (repeating events can't be edited from the wall at all). `target`
 * names the event to reconcile: a Hearth event by its group id, or a non-Hearth
 * (phone-made) event by its real calendar + event id.
 */
export interface EditEventBody {
  title: string;
  allDay: boolean;
  /** Timed: "YYYY-MM-DDTHH:mm". All-day: "YYYY-MM-DD". Wall-local, naive. */
  start: string;
  /** Same forms as `start`. All-day end is INCLUSIVE (the last covered day). */
  end: string;
  memberKeys: string[];
  countdown: boolean;
  target: { hearthGroupId: string } | { calendarId: string; eventId: string };
}
