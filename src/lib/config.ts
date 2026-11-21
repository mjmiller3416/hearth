// Static configuration. Hearth has no database, so this file plus environment
// variables are the whole configuration surface.

export const appConfig = {
  appName: "Hearth",
  /** Where every screen starts and where a shared screen returns when left alone. */
  defaultRoute: "/",
} as const;

// ── Navigation ──────────────────────────────────────────────────────────────
// Five destinations, organized by what the family is doing rather than by which
// app owns the data:
//
//   Today     everything that matters today, from every source, with the
//             common actions (check a chore, finish a cleaning task, add to the
//             shopping list, add an event) right there
//   Calendar  Google Calendar: month, week, add/edit/delete
//   School    the kids' school week (Tandem)
//   Chores    the kids' checklists and Maryann's cleaning session (Tada!)
//   Kitchen   the meal plan with recipes, and the shopping list (Enchanted Spoon)
//
// The same list drives the rail on a wide screen and the tab bar on a phone, so
// it has to stay at five. Settings sits apart. Icons are mapped in AppShell so
// this stays pure data, importable from server code.
export type NavId = "today" | "calendar" | "school" | "chores" | "kitchen";

export interface NavItem {
  id: NavId;
  label: string;
  href: string;
}

export const NAV: NavItem[] = [
  { id: "today", label: "Today", href: "/" },
  { id: "calendar", label: "Calendar", href: "/calendar" },
  { id: "school", label: "School", href: "/school" },
  { id: "chores", label: "Chores", href: "/chores" },
  { id: "kitchen", label: "Kitchen", href: "/kitchen" },
];

// ── Shared-screen behavior ──────────────────────────────────────────────────
// A shared screen (the wall) left alone for this long goes back to Today with
// nobody selected, so the next glance from across the room is the useful one.
// This replaced the timed view schedule: Today already shows what each time of
// day used to switch to (the school day, chores, dinner, the calendar).
export const IDLE_HOME_MS = 3 * 60_000;

// On a shared screen with the theme on Auto, the evening theme runs between
// these household-clock times ("HH:MM", 24h).
export const NIGHT_START = "21:00";
export const NIGHT_END = "06:30";
