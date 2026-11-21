import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { isDurable, readDataFile, writeDataFile } from "@/lib/settings/dataDir";

// Where parent-entered allowance balances and the parent PIN are kept: one JSON
// file in Hearth's data dir (spec D13). SERVER-ONLY.
//
// This is the second thing Hearth stores for itself (after colors, D12), and the
// first that is household data. It is here, and not in an upstream app, because
// no upstream holds it: Greenlight gives a household no way to read balances,
// and no other app tracks the kids' money. It stays deliberately tiny: one
// amount per kid with when it was entered. No transactions, no history, no
// arithmetic. Hearth still computes nothing.

interface StoredBalance {
  cents: number;
  updatedAt: string;
  note: string | null;
}

interface AllowanceFile {
  /** scrypt hash of the parent PIN, or null until one is set. */
  pin: { salt: string; hash: string } | null;
  balances: Record<string, StoredBalance>;
}

const FILE = "allowance.json";

async function read(): Promise<AllowanceFile> {
  const parsed = await readDataFile<Partial<AllowanceFile>>(FILE);
  return {
    pin: parsed?.pin && typeof parsed.pin === "object" ? parsed.pin : null,
    balances: parsed?.balances && typeof parsed.balances === "object" ? parsed.balances : {},
  };
}

// Serialize writes within this instance (one read-modify-write at a time).
let writeChain: Promise<unknown> = Promise.resolve();
function update<T>(fn: (file: AllowanceFile) => T): Promise<T> {
  const apply = async () => {
    const file = await read();
    const result = fn(file);
    await writeDataFile(FILE, file);
    return result;
  };
  const run = writeChain.then(apply, apply);
  writeChain = run.catch(() => {});
  return run;
}

function hashPin(pin: string, salt: string): Buffer {
  return scryptSync(pin, salt, 32);
}

/** The PIN from the environment, when the operator has set one (it then wins). */
function envPin(): string | null {
  return process.env.HEARTH_PARENT_PIN?.trim() || null;
}

export function pinFromEnv(): boolean {
  return envPin() !== null;
}

export async function hasPin(): Promise<boolean> {
  return envPin() !== null || (await read()).pin !== null;
}

/** Constant-time check of a presented PIN. False when no PIN exists. */
export async function checkPin(pin: string): Promise<boolean> {
  const fromEnv = envPin();
  if (fromEnv !== null) {
    const a = Buffer.from(pin, "utf8");
    const b = Buffer.from(fromEnv, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const stored = (await read()).pin;
  if (!stored) return false;
  const presented = hashPin(pin, stored.salt);
  const expected = Buffer.from(stored.hash, "hex");
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

export async function storePin(pin: string): Promise<void> {
  const salt = randomBytes(16).toString("hex");
  const hash = hashPin(pin, salt).toString("hex");
  await update((file) => {
    file.pin = { salt, hash };
  });
}

export async function readBalances(): Promise<Record<string, StoredBalance>> {
  return (await read()).balances;
}

/** Set one kid's balance, or clear it with `cents: null`. */
export async function storeBalance(
  memberKey: string,
  cents: number | null,
  note: string | null,
): Promise<void> {
  await update((file) => {
    if (cents === null) delete file.balances[memberKey];
    else file.balances[memberKey] = { cents, updatedAt: new Date().toISOString(), note };
  });
}

export { isDurable };
