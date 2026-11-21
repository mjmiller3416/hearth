import { fail, ok, type ActionResult } from "@/lib/action";
import { getHousehold } from "@/lib/household";
import {
  checkPin,
  hasPin,
  isDurable,
  pinFromEnv,
  readBalances,
  storeBalance,
  storePin,
} from "./store";
import {
  MAX_CENTS,
  NOTE_MAX,
  PIN_MAX,
  PIN_MIN,
  type AllowanceBalance,
  type AllowanceParentPayload,
  type AllowanceStatusPayload,
  type AllowanceViewPayload,
  type SetBalanceBody,
  type SetPinBody,
} from "./types";

// The allowance actions: what each kid has, as a parent last entered it. Shared
// by the wall's /api/allowance* routes and the MCP tools (src/lib/action.ts).
//
// WHO SEES WHAT. There is no login on Hearth, only "who's looking" (spec §6.3),
// so this is enforced by what each call can return, not by trust in the page:
//   - a kid's lens gets that kid's own balance and nothing else;
//   - no lens, an adult's lens, or a sibling's lens gets no amounts at all, so
//     the shared wall never shows anyone's money to the room;
//   - every kid's balance together, and any change, needs the parent PIN.
// The lens is still attribution, not authentication: a sibling can tap their
// brother's face. The PIN is what actually protects editing.
//
// SECURITY: callers authenticate first (the device cookie, or the connector's
// OAuth token). Wrong PINs are rate-limited in this process.

// ── Wrong-PIN limit: 5 per 15 minutes, then locked for the rest of the window.
const MAX_WRONG = 5;
const WINDOW_MS = 15 * 60_000;
let wrong: number[] = [];

function locked(): boolean {
  const cutoff = Date.now() - WINDOW_MS;
  wrong = wrong.filter((t) => t > cutoff);
  return wrong.length >= MAX_WRONG;
}

/** Null when the PIN is right; otherwise the failure to return. */
async function requirePin(pin: unknown): Promise<ActionResult | null> {
  if (!(await hasPin())) return fail("Set a parent PIN first.", 409);
  if (locked()) return fail("Too many wrong PINs. Try again in a few minutes.", 429);
  if (typeof pin !== "string" || !(await checkPin(pin))) {
    wrong.push(Date.now());
    return fail("That PIN isn't right.", 403);
  }
  return null;
}

function kids() {
  return getHousehold().members.filter((m) => m.role === "kid");
}

async function balancesFor(keys: string[]): Promise<AllowanceBalance[]> {
  const stored = await readBalances();
  return kids()
    .filter((k) => keys.includes(k.key))
    .map((k) => {
      const b = stored[k.key];
      return {
        memberKey: k.key,
        name: k.name,
        cents: b ? b.cents : null,
        source: "manual" as const,
        asOf: b ? b.updatedAt : null,
        note: b ? b.note : null,
      };
    });
}

/** "12", "12.5", "$12.50", "1,200" → whole cents; null if it isn't money. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents <= MAX_CENTS ? cents : null;
}

/**
 * What one viewer may see without a PIN: a kid's own balance, or nothing. Also
 * what the settings screen reads (no viewer) to learn whether a PIN exists.
 */
export async function viewAllowance(viewer: string | null): Promise<ActionResult> {
  if (!viewer) {
    return ok({
      pinSet: await hasPin(),
      pinFromEnv: pinFromEnv(),
      durable: await isDurable(),
      balance: null,
    } satisfies AllowanceStatusPayload);
  }
  const kid = kids().find((k) => k.key === viewer);
  const [balance] = kid ? await balancesFor([kid.key]) : [];
  return ok({ balance: balance ?? null } satisfies AllowanceViewPayload);
}

/** Every kid's balance, for a parent who has the PIN. */
export async function parentAllowance(input: unknown): Promise<ActionResult> {
  const body = (input && typeof input === "object" ? input : {}) as { pin?: unknown };
  const denied = await requirePin(body.pin);
  if (denied) return denied;
  return ok({
    balances: await balancesFor(kids().map((k) => k.key)),
    durable: await isDurable(),
  } satisfies AllowanceParentPayload);
}

/** Every kid's balance, for a caller already known to be a parent (the connector). */
export async function listAllowance(): Promise<ActionResult> {
  return ok({
    balances: await balancesFor(kids().map((k) => k.key)),
    durable: await isDurable(),
  } satisfies AllowanceParentPayload);
}

/** Validate and store one balance. `amount: ""` clears it. No PIN check here. */
async function writeBalance(memberKey: unknown, amount: unknown, note: unknown): Promise<ActionResult> {
  const kid = kids().find((k) => k.key === memberKey || k.name.toLowerCase() === String(memberKey).toLowerCase());
  if (!kid) return fail("That isn't one of the kids.");
  const text = typeof amount === "number" ? String(amount) : typeof amount === "string" ? amount.trim() : "";
  const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, NOTE_MAX) : null;
  if (text === "") {
    await storeBalance(kid.key, null, null);
  } else {
    const cents = parseAmount(text);
    if (cents === null) return fail("Enter an amount like 12 or 12.50.");
    await storeBalance(kid.key, cents, cleanNote);
  }
  return listAllowance();
}

/** Set (or clear) one kid's balance from the wall: needs the parent PIN. */
export async function setBalance(input: unknown): Promise<ActionResult> {
  const body = (input && typeof input === "object" ? input : {}) as Partial<SetBalanceBody>;
  const denied = await requirePin(body.pin);
  if (denied) return denied;
  return writeBalance(body.memberKey, body.amount, body.note);
}

/** Set one kid's balance for a caller already known to be a parent (the connector). */
export async function setBalanceTrusted(input: {
  member: unknown;
  amount: unknown;
  note?: unknown;
}): Promise<ActionResult> {
  return writeBalance(input.member, input.amount, input.note);
}

/**
 * Create the parent PIN, or change it (needs the current one). While
 * HEARTH_PARENT_PIN is set, that value is the current PIN and stays in force;
 * a PIN saved here takes over once the variable is removed. That is the way
 * back from a forgotten PIN: set the variable, save a new PIN with it, unset it.
 */
export async function setPin(input: unknown): Promise<ActionResult> {
  const body = (input && typeof input === "object" ? input : {}) as Partial<SetPinBody>;
  const next = typeof body.next === "string" ? body.next : "";
  if (!new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(next)) {
    return fail(`A PIN is ${PIN_MIN} to ${PIN_MAX} digits.`);
  }
  if (await hasPin()) {
    const denied = await requirePin(body.current);
    if (denied) return denied;
  }
  await storePin(next);
  return ok({ pinSet: true });
}
