// Static configuration. Hearth has no database, so this file plus environment
// variables are the whole configuration surface.

export const appConfig = {
  appName: "Hearth",
  // The wall's resting state. Calendar is the one view this household actually
  // uses today, so the app opens here after any reload (spec §4, Phase 1).
  defaultRoute: "/calendar",
} as const;

// ── Family members ─────────────────────────────────────────────────────────
// One Google Calendar / task column per person. Member color is the primary
// information channel across the whole display (spec §7), so it is defined once
// here and as CSS tokens in globals.css — never as scattered hex values.
//
// Mitchell is locked to green by spec D3. The other three are an auto-assigned
// warm, distance-legible set; retune the hex values in globals.css if desired.
export type MemberId = "maryann" | "mitchell" | "kidA" | "kidB";

export interface Member {
  id: MemberId;
  name: string;
  /** CSS custom property name; use as `var(<colorVar>)` for fills/strokes. */
  colorVar: string;
}

export const MEMBERS: Member[] = [
  { id: "maryann", name: "Maryann", colorVar: "--color-maryann" },
  { id: "mitchell", name: "Mitchell", colorVar: "--color-mitchell" },
  { id: "kidA", name: "Kid A", colorVar: "--color-kid-a" },
  { id: "kidB", name: "Kid B", colorVar: "--color-kid-b" },
];

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
