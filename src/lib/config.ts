// Static configuration. Hearth has no database, so this file plus environment
// variables are the whole configuration surface.

export const appConfig = {
  appName: "Hearth",
  // The wall's resting state. Calendar is the one view this household actually
  // uses today, so the app opens here after any reload (spec §4, Phase 1).
  defaultRoute: "/calendar",
} as const;

// ── Timed view schedule ─────────────────────────────────────────────────────
// The wall changes views on its own through the day. At each time below (24h
// "HH:MM", in the HOUSEHOLD timezone — the same clock the header shows) the wall
// switches to that view. Each entry holds until the next one; the last entry
// wraps past midnight to the first. Someone can still tap to another view in
// between — the schedule only acts when a boundary passes, and waits until the
// wall has been left alone for a minute so it never yanks a view mid-use.
// Loading `/` lands on whichever view is due now.
//
// To change the times, edit this list; order doesn't matter. Hrefs must match
// an entry in NAV below. Empty the list to turn the feature off.
export interface ViewScheduleEntry {
  /** 24-hour "HH:MM" in the household timezone. */
  at: string;
  href: string;
}

export const VIEW_SCHEDULE: ViewScheduleEntry[] = [
  { at: "08:55", href: "/schedule" },
  { at: "16:45", href: "/chores" },
  { at: "18:30", href: "/meals" },
  { at: "22:00", href: "/calendar" },
];

// ── Family members ─────────────────────────────────────────────────────────
// The canonical list of taggable people is env-driven as of Phase 1.5 (the
// `MEMBERS` variable), parsed in src/lib/calendar/config.ts — because members
// and calendars are no longer the same thing. Member color remains the primary
// information channel (spec §7); the color slugs resolve to the CSS tokens
// defined once in globals.css (`--color-<slug>`), never scattered hex. Mitchell
// is locked to green by spec D3.

// ── Navigation ──────────────────────────────────────────────────────────────
// The sidebar is the whole navigation model (spec §4). As of Phase 2 the single
// "Tasks" destination is split into two Tada! surfaces with deliberately
// different philosophies — Maryann's guided **Clean** session and the kids'
// **Chores** checklist (spec §4.2–4.3, D4/D5) — bringing the sidebar to six.
// "Recipes" stays a placeholder until Phase 4 renames it to Shopping. Icons are
// mapped in the Sidebar component so this stays pure data, importable from server
// code. "Schedule" (the kids' school week, from Tandem) sits beside Chores, the
// other kids' surface.
export type NavId =
  | "calendar"
  | "clean"
  | "chores"
  | "schedule"
  | "lists"
  | "meals"
  | "recipes";

export interface NavItem {
  id: NavId;
  label: string;
  href: string;
  /** Phase that fills this view in with real content (for placeholder copy). */
  phase: number;
}

export const NAV: NavItem[] = [
  { id: "calendar", label: "Calendar", href: "/calendar", phase: 1 },
  { id: "clean", label: "Clean", href: "/clean", phase: 2 },
  { id: "chores", label: "Chores", href: "/chores", phase: 2 },
  { id: "schedule", label: "Schedule", href: "/schedule", phase: 4 },
  { id: "lists", label: "Lists", href: "/lists", phase: 3 },
  { id: "meals", label: "Meals", href: "/meals", phase: 4 },
  { id: "recipes", label: "Recipes", href: "/recipes", phase: 4 },
];
