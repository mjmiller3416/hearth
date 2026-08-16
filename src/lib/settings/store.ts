import { promises as fs } from "fs";
import path from "path";
import { getMembers } from "@/lib/calendar/config";
import { EVERYONE_COLOR } from "@/lib/calendar/palette";
import {
  DEFAULT_COLORS,
  SWATCH_BY_ID,
  isSwatchId,
  textFromHex,
} from "./swatches";

// The persisted settings store (Phase 2 #3). SERVER-ONLY — reads/writes a JSON
// blob and reads environment. Never import from a client component.
//
// Hearth has no database, so shared, cross-device settings live in a single
// JSON file. On Railway, point HEARTH_DATA_DIR at a PERSISTENT VOLUME so the
// file survives redeploys; every device reads the same file, so a color chosen
// on the wall shows on the laptop too. With no volume set it falls back to a
// local `.hearth-data/` dir under the working directory — still shared across
// every request of a running instance, just not across redeploys.
//
// We intentionally do NOT hold a long-lived in-memory cache: in dev, Next serves
// route handlers and RSC renders from separate module graphs, so a cached write
// in one would be invisible to the other. The file is tiny and read only on page
// loads, so reading it fresh each time is both correct and cheap.
//
// The only setting today is color overrides: a map of palette SLUG -> swatch id.

export interface Settings {
  /** Palette slug -> swatch id. Absent slugs use their globals.css default. */
  colorsBySlug: Record<string, string>;
}

const DATA_DIR = process.env.HEARTH_DATA_DIR?.trim() || path.join(process.cwd(), ".hearth-data");
const FILE = path.join(DATA_DIR, "settings.json");

export async function readSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      colorsBySlug:
        parsed.colorsBySlug && typeof parsed.colorsBySlug === "object"
          ? parsed.colorsBySlug
          : {},
    };
  } catch {
    // Missing file / bad JSON — start clean (the file is written on first save).
    return { colorsBySlug: {} };
  }
}

async function writeSettings(next: Settings): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(next), "utf8");
}

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
