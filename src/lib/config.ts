// Static configuration. Hearth has no database, so this file plus environment
// variables are the whole configuration surface.

export const appConfig = {
  appName: "Hearth",
  // The wall's resting state. Calendar is the one view this household actually
  // uses today, so the app opens here after any reload (spec §4, Phase 1).
  defaultRoute: "/calendar",
} as const;

// ── Family members ─────────────────────────────────────────────────────────
// The canonical list of taggable people is env-driven as of Phase 1.5 (the
// `MEMBERS` variable), parsed in src/lib/calendar/config.ts — because members
// and calendars are no longer the same thing. Member color remains the primary
// information channel (spec §7); the color slugs resolve to the CSS tokens
// defined once in globals.css (`--color-<slug>`), never scattered hex. Mitchell
// is locked to green by spec D3.

// ── Navigation ──────────────────────────────────────────────────────────────
// The sidebar is the whole navigation model: five destinations matching the
// household's existing Skylight mental model (spec §4). Icons are mapped in the
// Sidebar component so this stays pure data, importable from server code.
export type NavId = "calendar" | "tasks" | "lists" | "meals" | "recipes";

export interface NavItem {
  id: NavId;
  label: string;
  href: string;
  /** Phase that fills this view in with real content (for placeholder copy). */
  phase: number;
}

export const NAV: NavItem[] = [
  { id: "calendar", label: "Calendar", href: "/calendar", phase: 1 },
  { id: "tasks", label: "Tasks", href: "/tasks", phase: 2 },
  { id: "lists", label: "Lists", href: "/lists", phase: 3 },
  { id: "meals", label: "Meals", href: "/meals", phase: 4 },
  { id: "recipes", label: "Recipes", href: "/recipes", phase: 4 },
];
