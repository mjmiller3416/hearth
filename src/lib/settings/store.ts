import { promises as fs } from "fs";
import os from "os";
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

// The preferred data dir. On Railway this should be a persistent volume via
// HEARTH_DATA_DIR; otherwise `.hearth-data/` under the working dir.
const PREFERRED_DIR =
  process.env.HEARTH_DATA_DIR?.trim() || path.join(process.cwd(), ".hearth-data");

// The resolved, VERIFIED-WRITABLE data dir, chosen once. A common wall failure:
// HEARTH_DATA_DIR points at a mounted volume that the container user (uid 1001)
// can't write to, so every save threw a 500 and the color picker "reverted"
// (the client rolled back the optimistic choice — Phase 2 #5 bug). We now probe
// the preferred dir and, if it isn't writable, fall back to the OS temp dir so a
// save always succeeds. Reads use the SAME resolved dir, so a fallback save is
// still visible within the running instance. (Cross-redeploy persistence still
// needs a writable volume — the warning below says so.)
let resolvedDirPromise: Promise<string> | null = null;

async function isWritable(dir: string): Promise<boolean> {
  try {
    await fs.mkdir(dir, { recursive: true });
    const probe = path.join(dir, ".write-test");
    await fs.writeFile(probe, "ok", "utf8");
    await fs.rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

async function dataDir(): Promise<string> {
  if (!resolvedDirPromise) {
    resolvedDirPromise = (async () => {
      if (await isWritable(PREFERRED_DIR)) return PREFERRED_DIR;
      const fallback = path.join(os.tmpdir(), "hearth-data");
      if (await isWritable(fallback)) {
        console.warn(
          `[settings] data dir ${PREFERRED_DIR} is not writable; falling back to ${fallback}. ` +
            `Colors will save but NOT survive a redeploy — point HEARTH_DATA_DIR at a volume ` +
            `writable by the container user (uid 1001), e.g. chown the mount or run an init step.`,
        );
        return fallback;
      }
      // Nothing writable — keep the preferred path so the real error surfaces.
      console.error(`[settings] no writable data dir found (tried ${PREFERRED_DIR}, ${fallback}).`);
      return PREFERRED_DIR;
    })();
  }
  return resolvedDirPromise;
}

async function settingsFile(): Promise<string> {
  return path.join(await dataDir(), "settings.json");
}

export async function readSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(await settingsFile(), "utf8");
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
  const dir = await dataDir();
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "settings.json");
  const data = JSON.stringify(next);
  // Write to a temp file then atomically rename over the target. A bare
  // writeFile truncates-then-rewrites, so a concurrent readSettings (another
  // device polling, or a separate RSC/route module graph in dev) could read a
  // torn/empty file, hit the JSON.parse catch, and momentarily render every
  // custom color back to its default. On the Linux deploy target rename over an
  // open file is always atomic and safe.
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, data, "utf8");
  try {
    await fs.rename(tmp, file);
  } catch (err) {
    // Windows throws EPERM renaming over a file another handle has open for
    // reading (a concurrent poll during local `dev`); POSIX never does. Fall back
    // to a direct overwrite so the save still lands — this only reopens the small
    // torn-read window on Windows dev, matching the pre-existing behavior there.
    if ((err as NodeJS.ErrnoException)?.code === "EPERM") {
      await fs.writeFile(file, data, "utf8");
      await fs.rm(tmp, { force: true }).catch(() => {});
    } else {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  }
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
