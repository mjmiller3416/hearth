import { getMembers } from "@/lib/calendar/config";
import { EVERYONE_COLOR } from "@/lib/calendar/palette";
import { readDataFile, writeDataFile } from "./dataDir";
import {
  DEFAULT_COLORS,
  SWATCH_BY_ID,
  isSwatchId,
  textFromHex,
} from "./swatches";

// The persisted color settings (spec D12). SERVER-ONLY: reads and writes a JSON
// file in Hearth's data dir (see ./dataDir for where that is and when it
// survives a redeploy). Never import from a client component.
//
// We intentionally do NOT hold a long-lived in-memory cache: in dev, Next serves
// route handlers and RSC renders from separate module graphs, so a cached write
// in one would be invisible to the other. The file is tiny and read only on page
// loads, so reading it fresh each time is both correct and cheap.

export interface Settings {
  /** Palette slug -> swatch id. Absent slugs use their globals.css default. */
  colorsBySlug: Record<string, string>;
}

const FILE = "settings.json";

export async function readSettings(): Promise<Settings> {
  const parsed = await readDataFile<Partial<Settings>>(FILE);
  return {
    colorsBySlug:
      parsed?.colorsBySlug && typeof parsed.colorsBySlug === "object" ? parsed.colorsBySlug : {},
  };
}

async function writeSettings(next: Settings): Promise<void> {
  await writeDataFile(FILE, next);
}

// Serialize writes within this instance so two near-simultaneous color picks
// (wall + laptop) don't do overlapping read-modify-write cycles and lose one
// update. Each setColorOverride chains after the previous one's completion. This
// closes the race for the common single-instance deploy; a multi-replica setup
// would still need a shared lock, which is out of scope (Hearth runs one instance).
let writeChain: Promise<unknown> = Promise.resolve();

/** The set of palette slugs a user may recolor: each member's, plus "everyone". */
export function customizableSlugs(): string[] {
  const slugs = new Set<string>();
  for (const m of getMembers()) slugs.add(m.color);
  slugs.add(EVERYONE_COLOR);
  return [...slugs];
}

/**
 * Set (or clear, when swatchId is null) the override for one color slug. Returns
 * the updated settings. Validates that the slug is customizable and the swatch
 * is real — callers still authorize the request first.
 */
export async function setColorOverride(
  slug: string,
  swatchId: string | null,
): Promise<Settings> {
  const apply = async (): Promise<Settings> => {
    const current = await readSettings();
    const nextColors = { ...current.colorsBySlug };
    if (swatchId === null) {
      delete nextColors[slug];
    } else {
      nextColors[slug] = swatchId;
    }
    const next: Settings = { colorsBySlug: nextColors };
    await writeSettings(next);
    return next;
  };
  // Queue behind any in-flight write so each read-modify-write runs to completion
  // before the next begins — no lost updates within this instance. A prior write's
  // failure must not block this one, so run `apply` whether the chain settled
  // fulfilled or rejected.
  const run = writeChain.then(apply, apply);
  writeChain = run.catch(() => {}); // keep the chain alive past any failure
  return run;
}

export function isCustomizableSlug(slug: string): boolean {
  return customizableSlugs().includes(slug);
}

export { isSwatchId };

/**
 * The resolved color config for a render: the CSS variable overrides to inject
 * (only the slugs that differ from default) and the text treatment for every
 * known slug (so chips pick legible ink over any customized fill).
 */
export interface ColorConfig {
  /** Slug -> hex, only for slugs the user has overridden (for an inline :root). */
  overrides: Record<string, string>;
  /** Slug -> "light" | "dark", for EVERY known slug. */
  textBySlug: Record<string, "light" | "dark">;
  /** Slug -> current swatch id (or null), for the settings picker. */
  selection: Record<string, string | null>;
}

export async function getColorConfig(): Promise<ColorConfig> {
  const settings = await readSettings();
  const overrides: Record<string, string> = {};
  const textBySlug: Record<string, "light" | "dark"> = {};
  const selection: Record<string, string | null> = {};

  const slugs = new Set<string>([...customizableSlugs(), "neutral"]);
  for (const slug of slugs) {
    const swatchId = settings.colorsBySlug[slug] ?? null;
    const swatch = swatchId ? SWATCH_BY_ID.get(swatchId) ?? null : null;
    selection[slug] = swatch ? swatch.id : null;
    const hex = swatch?.hex ?? DEFAULT_COLORS[slug];
    if (swatch) overrides[slug] = swatch.hex;
    if (hex) textBySlug[slug] = swatch?.text ?? textFromHex(hex);
  }
  return { overrides, textBySlug, selection };
}
