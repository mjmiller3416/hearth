// The Home Base summary feed's response contract (GET /api/home-base/summary).
// snake_case on the wire, because the consumer is another team's site (Home
// Base, built by Maryann's assistant), not Hearth's own camelCase views.
//
// Rules every section follows:
//   - Each source is an envelope (`SourceEnvelope`): its own status, its own
//     timestamps and its own error. One failing source never blanks another.
//   - `fetched_at` is when Hearth got the data from that source during THIS
//     request; `data_as_of` is how current the source says its data is (e.g. the
//     calendar's last Google sync, Homeroom's last record change, the bank's last
//     sync). A response generated now never re-stamps old data as fresh.
//   - Unknown values are null, never 0. `data` is null whenever status isn't
//     "ok" or "partial".

export const SCHEMA_VERSION = "2026-11-15.1";

export type SourceStatus =
  /** Read in full. */
  | "ok"
  /** Read, but some of it is missing (see `error`). */
  | "partial"
  /** Couldn't be read (see `error`); `data` is null. */
  | "error"
  /** The integration isn't set up on Hearth; `data` is null. */
  | "not_configured"
  /** The source only knows "today" and a different date was asked for. */
  | "unavailable_for_date";

export interface SourceError {
  /** Stable machine code, e.g. "timeout", "upstream_error", "calendar_unreadable". */
  code: string;
  /** One plain sentence for a person. Never contains secrets or upstream bodies. */
  message: string;
}

export interface SourceEnvelope<T> {
  status: SourceStatus;
  /** ISO instant Hearth received this source's data, or null if it didn't. */
  fetched_at: string | null;
  /** ISO instant the source's own data is current to, or null when unknown. */
  data_as_of: string | null;
  error: SourceError | null;
  data: T | null;
}

/** A household member as the feed names them (key is stable). */
export interface Person {
  key: string;
  name: string;
}

// ── calendar (Google Calendar via Hearth) ──────────────────────────────────

export interface CalendarItem {
  /**
   * Stable id. "hearth:<group>:<occurrence>" for an event Hearth made (all its
   * per-person copies collapse into one item), otherwise
   * "gcal:<calendar owner key or 'family'>:<Google event id>".
   */
  id: string;
  title: string;
  all_day: boolean;
  /** Timed: ISO instant with offset. All-day: "YYYY-MM-DD". */
  start: string;
  /** Timed: ISO instant. All-day: the LAST day covered, inclusive. */
  end: string;
  /** IANA zone the times should be shown in; null for floating all-day dates. */
  time_zone: string | null;
  /** The days in the requested range this event touches ("YYYY-MM-DD"). */
  dates: string[];
  /** Who it's for: tagged members, else the calendar's owner. Empty = family. */
  assignees: Person[];
  /** True when it's for the whole family (family calendar, nobody tagged). */
  family: boolean;
  recurring: boolean;
  /** Hearth's "count down to this" flag. */
  countdown: boolean;
}

export interface CalendarData {
  /** Cancelled and deleted events are never included. */
  events: CalendarItem[];
}

// ── school_schedule (Tandem) ───────────────────────────────────────────────

export interface ScheduleItem {
  /** Tandem's activity id. */
  id: string;
  child: Person;
  name: string;
  date: string;
  /** "HH:MM", 24-hour, in `time_zone`. */
  start: string;
  end: string;
  time_zone: string;
  important: boolean;
}

export interface ScheduleData {
  /** Monday–Friday only; Tandem keeps no weekend schedule. */
  activities: ScheduleItem[];
}

// ── meals (Enchanted Spoon) ────────────────────────────────────────────────

export interface MealItem {
  /** The plan entry (the same meal can be planned more than once). */
  entry_id: string;
  meal_id: string;
  name: string;
  /** "YYYY-MM-DD", or null for an unscheduled queue entry. */
  scheduled_date: string | null;
  completed: boolean;
  main_recipe_name: string | null;
  side_dish_count: number | null;
  total_time_minutes: number | null;
}

export interface MealsData {
  /** Entries scheduled on a date in the requested range, in plan order. */
  scheduled: MealItem[];
  /** The next unscheduled, not-yet-cooked entries in the queue (up to 7). */
  up_next: MealItem[];
}

// ── chores (Tada!) ─────────────────────────────────────────────────────────

export interface ChoreItem {
  /** Tada!'s task id. */
  id: string;
  name: string;
  done: boolean;
}

export interface ChoresData {
  /** Each kid's chores for today, outstanding and done. */
  kids: { child: Person; chores: ChoreItem[] }[];
  /** What Maryann finished today in Clean, newest first. */
  maryann_done_today: { task_name: string; room: string | null; completed_at: string }[];
}

// ── The whole response ────────────────────────────────────────────────────

export interface HomeBaseSummary {
  schema_version: string;
  generated_at: string;
  /** First requested day, "YYYY-MM-DD", in `time_zone`. */
  date: string;
  /** Number of days covered, starting at `date` (1–7). */
  days: number;
  time_zone: string;
  sources: {
    calendar: SourceEnvelope<CalendarData>;
    school_schedule: SourceEnvelope<ScheduleData>;
    lessons: SourceEnvelope<unknown>;
    school_hours: SourceEnvelope<unknown>;
    meals: SourceEnvelope<MealsData>;
    chores: SourceEnvelope<ChoresData>;
    budget: SourceEnvelope<unknown>;
  };
}
