// Shared Tandem types for the Schedule view. Free of any server-only import so
// both the route handler and the client view can import them.
//
// Schedule is read-only (like Meals, spec D6): the wall shows Lincoln's and
// Ollie's Monday–Friday school days and activities side by side, exactly as
// Tandem stores them. Adding, editing, and copying weeks stays in Tandem.

/** Tandem's child keys. Its own labels are "Link" and "Ollie". */
export type TandemChild = "link" | "ollie";

/** One scheduled block for one child on one weekday. */
export interface ScheduleActivity {
  id: string;
  child: TandemChild;
  name: string;
  /** ISO date (YYYY-MM-DD), always a weekday. */
  day: string;
  /** 24h "HH:MM". */
  start: string;
  /** 24h "HH:MM", always after `start`. */
  end: string;
  important: boolean;
}

/**
 * A schedule lane, resolved against Hearth's MEMBERS so the kids wear the same
 * name and color here as on the calendar and Chores (one color system, spec §7).
 */
export interface ScheduleKid {
  child: TandemChild;
  name: string;
  /** Palette slug, resolving to var(--color-<slug>). */
  color: string;
}

// ── Route payload (server → client) ─────────────────────────────────────────

/**
 * GET /api/schedule?week=YYYY-MM-DD. `configured` is false when Tandem isn't
 * wired yet, so the view renders a calm "not connected" state rather than an
 * error (spec §6.2), like the other upstream views.
 */
export interface SchedulePayload {
  /** The Monday of the week shown. */
  weekStart: string;
  kids: ScheduleKid[];
  activities: ScheduleActivity[];
  configured: boolean;
}
