// Shared calendar types. Deliberately free of any server-only import (no
// node:crypto, no process access at module scope beyond what tree-shakes away),
// so both the route handler and the client view components can import it.
//
// Google Calendar is the system of record (spec D2). Hearth reads it and reshapes
// each event into exactly this flat, render-ready form — nothing the wall does
// not need to draw a chip.

/**
 * One event, normalized for the wall. Color and owner come from the *owning
 * calendar* (spec D3), never from attendees — one Google Calendar per person.
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
  /** The calendar this event lives on — also the filter key for member chips. */
  calendarId: string;
  /** Member id (maryann | mitchell | lincoln | ollie); resolves to a color. */
  color: string;
  /** Display name of the calendar's owner, for the day panel / week view. */
  memberName: string;
}

/**
 * One family member's calendar, derived from the CALENDAR_MAP env var. Drives
 * the filter chip row; `color` is the same member-id key an event carries.
 */
export interface CalendarMember {
  calendarId: string;
  name: string;
  color: string;
}

/**
 * The GET /api/calendar payload. `configured` is false when Google credentials
 * or CALENDAR_MAP are absent — the view then renders a calm empty grid rather
 * than an error, honoring the failure contract (spec §6.2).
 */
export interface CalendarPayload {
  events: CalendarEvent[];
  members: CalendarMember[];
  configured: boolean;
}
