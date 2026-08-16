// The predetermined color palette for customizable tag colors (Phase 2 #3).
// Client-safe: no env, no server imports — the settings picker and the color
// resolver both read it.
//
// A member's color is a palette SLUG resolving to `var(--color-<slug>)` in
// globals.css. Customization overrides that CSS variable's value at the root,
// so a single override recolors every chip, avatar, and dot for that person
// uniformly. Overrides are stored as a swatch id per slug (not a raw hex), so
// the value is always one of these vetted colors and its text treatment is known.

export interface Swatch {
  id: string;
  name: string;
  hex: string;
  /** Whether a solid fill of this swatch carries light or dark text. */
  text: "light" | "dark";
}

/** Perceived luminance → the legible text color over a solid fill of `hex`. */
export function textFromHex(hex: string): "light" | "dark" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "light";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const perceived = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return perceived > 0.55 ? "dark" : "light";
}

// The raw palette (id + display name + hex). Text treatment is derived below so
// it can never drift from the color.
const RAW: Omit<Swatch, "text">[] = [
  { id: "raspberry", name: "Raspberry", hex: "#d81b60" },
  { id: "rose", name: "Rose", hex: "#ec407a" },
  { id: "red", name: "Red", hex: "#e53935" },
  { id: "orange", name: "Orange", hex: "#f09300" },
  { id: "amber", name: "Amber", hex: "#f6bf26" },
  { id: "avocado", name: "Avocado", hex: "#7cb342" },
  { id: "green", name: "Green", hex: "#43a047" },
  { id: "teal", name: "Teal", hex: "#30b0b0" },
  { id: "cyan", name: "Cyan", hex: "#00acc1" },
  { id: "sky", name: "Sky", hex: "#039be5" },
  { id: "blue", name: "Blue", hex: "#3f51b5" },
  { id: "indigo", name: "Indigo", hex: "#5c6bc0" },
  { id: "violet", name: "Violet", hex: "#7e57c2" },
  { id: "plum", name: "Plum", hex: "#8e24aa" },
  { id: "cocoa", name: "Cocoa", hex: "#8d6e63" },
  { id: "slate", name: "Slate", hex: "#607d8b" },
];

export const SWATCHES: Swatch[] = RAW.map((s) => ({ ...s, text: textFromHex(s.hex) }));

export const SWATCH_BY_ID: Map<string, Swatch> = new Map(
  SWATCHES.map((s) => [s.id, s]),
);

/** True when `id` names a real swatch (write-path validation). */
export function isSwatchId(id: string): boolean {
  return SWATCH_BY_ID.has(id);
}

// The default hex for each built-in color slug, mirroring globals.css. Lets the
// resolver compute a text treatment and the picker show the current color even
// when a slug has no override. Slugs not listed here (a member on a custom color
// the operator added to globals.css) fall back to the static palette treatment.
export const DEFAULT_COLORS: Record<string, string> = {
  mitchell: "#30b0b0",
  maryann: "#d81b60",
  lincoln: "#7cb342",
  ollie: "#039be5",
  neutral: "#c9bfa8",
  everyone: "#f09300",
};
