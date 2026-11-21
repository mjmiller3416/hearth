import { promises as fs } from "fs";
import os from "os";
import path from "path";

// Where Hearth keeps the little it stores itself: the family colors (spec D12)
// and the parent-entered allowance balances (spec D13). SERVER-ONLY.
//
// On Railway, HEARTH_DATA_DIR points at a persistent volume, so the files
// survive redeploys and every device reads the same ones. Without it they live
// in `.hearth-data/` under the working directory: fine for local dev, but on a
// deploy that directory is replaced with every release.

// The preferred data dir: the volume when configured, else the local fallback.
const PREFERRED_DIR =
  process.env.HEARTH_DATA_DIR?.trim() || path.join(process.cwd(), ".hearth-data");

// The resolved, VERIFIED-WRITABLE data dir, chosen once. A mounted volume the
// container user can't write to used to make every save throw; we probe the
// preferred dir and fall back to the OS temp dir so a save always succeeds.
// Reads use the SAME resolved dir, so a fallback save is still visible within
// the running instance (it just won't survive a redeploy).
let resolved: Promise<{ dir: string; fellBack: boolean }> | null = null;

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

function resolve(): Promise<{ dir: string; fellBack: boolean }> {
  if (!resolved) {
    resolved = (async () => {
      if (await isWritable(PREFERRED_DIR)) {
        // One line at first use, so the deploy log says where saves are going.
        console.log(
          `[settings] data dir ${PREFERRED_DIR} (${
            process.env.HEARTH_DATA_DIR?.trim() ? "HEARTH_DATA_DIR: survives redeploys" : "local fallback: lost on redeploy"
          })`,
        );
        return { dir: PREFERRED_DIR, fellBack: false };
      }
      const fallback = path.join(os.tmpdir(), "hearth-data");
      if (await isWritable(fallback)) {
        console.warn(
          `[settings] data dir ${PREFERRED_DIR} is not writable; falling back to ${fallback}. ` +
            `Saves work but will NOT survive a redeploy: point HEARTH_DATA_DIR at a volume the ` +
            `container user can write to.`,
        );
        return { dir: fallback, fellBack: true };
      }
      // Nothing writable: keep the preferred path so the real error surfaces.
      console.error(`[settings] no writable data dir found (tried ${PREFERRED_DIR}, ${fallback}).`);
      return { dir: PREFERRED_DIR, fellBack: true };
    })();
  }
  return resolved;
}

/** The directory Hearth's own files live in (created if missing). */
export async function dataDir(): Promise<string> {
  return (await resolve()).dir;
}

/**
 * True when what's saved will survive a redeploy: HEARTH_DATA_DIR is set and
 * writable. The UI says so plainly when it isn't, rather than letting a parent
 * discover it after the next release.
 */
export async function isDurable(): Promise<boolean> {
  if (!process.env.HEARTH_DATA_DIR?.trim()) return false;
  return !(await resolve()).fellBack;
}

/** Read one JSON file from the data dir, or null if missing or unreadable. */
export async function readDataFile<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(await dataDir(), name), "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Write one JSON file atomically (temp file, then rename), so a concurrent
 * read never sees a torn file. Windows can refuse the rename while another
 * handle has the file open (local dev); fall back to a direct overwrite there.
 */
export async function writeDataFile(name: string, value: unknown): Promise<void> {
  const dir = await dataDir();
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  const data = JSON.stringify(value);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, data, "utf8");
  try {
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    if ((err as NodeJS.ErrnoException)?.code !== "EPERM") throw err;
    await fs.writeFile(file, data, "utf8");
  }
}
