// How a member id paints an event chip. Client-safe and pure.
//
// The member colors themselves are defined once in globals.css `@theme` and
// mirrored in src/lib/config.ts (spec §7 — color is the primary information
// channel, "reserve saturation entirely for people"). This module only answers
// two presentation questions the chip needs at render time:
//
//   1. Which CSS custom property is this member's color?   -> colorVar()
//   2. Does a solid fill of it want light or dark text?     -> textOn()
//
// Keeping it here (not in config.ts) means config stays pure identity data,
// importable from server code, while this stays a client concern.

// Non-member fill slugs (Phase 1.5), defined here so client chips can reference
// them without importing the server-only calendar config. Their CSS tokens live
// in globals.css.
export const NEUTRAL_COLOR = "neutral"; // untagged, no owning-calendar default
export const EVERYONE_COLOR = "everyone"; // four or more tagged members

/** The CSS custom property holding this member's color, e.g. "--color-ollie". */
export function colorVar(color: string): string {
  return `--color-${color}`;
}

// Amber is light enough that white text on a solid fill fails a distance
// legibility check; it takes dark ink instead. The other three (coral, green,
// blue) are dark enough for white. The untagged "neutral" fill is a light warm
// gray and also takes dark ink; the "everyone" fill (4+ tagged members) is a
// warm slate that takes white. Unknown keys fall back to light text.
const DARK_TEXT_COLORS = new Set(["ollie", NEUTRAL_COLOR]);

/** Whether a solid fill of this color should carry light or dark text. */
export function textOn(color: string): "light" | "dark" {
  return DARK_TEXT_COLORS.has(color) ? "dark" : "light";
}
