// Shared allowance types. Free of any server-only import, so the route handlers
// and the client views can both use them.
//
// A balance always says where its number came from. Today there is exactly one
// source, "manual": an amount a parent typed in. Greenlight offers no way for a
// household to read balances (no public API, not on the aggregators; see the
// README), so nothing here is ever synced. The `source` field exists so that if
// that changes, a synced number is a different, differently-labeled thing and a
// typed one can never pass for it.

export type BalanceSource = "manual";

export interface AllowanceBalance {
  /** The kid's MEMBERS key. */
  memberKey: string;
  name: string;
  /** Whole cents, or null when no parent has entered an amount yet. */
  cents: number | null;
  source: BalanceSource;
  /** ISO instant the amount was entered, or null. */
  asOf: string | null;
  /** An optional short note from the parent ("after birthday money"). */
  note: string | null;
}

/** GET /api/allowance?viewer=<memberKey>: one kid's own balance, or none. */
export interface AllowanceViewPayload {
  /** Null unless the viewer is a kid: a kid sees their own balance only. */
  balance: AllowanceBalance | null;
}

/** POST /api/allowance/unlock: everything a parent manages, behind the PIN. */
export interface AllowanceParentPayload {
  balances: AllowanceBalance[];
  /** False when saved amounts would be lost on the next redeploy. */
  durable: boolean;
}

/** GET /api/allowance (no viewer): what the settings screen needs before the PIN. */
export interface AllowanceStatusPayload {
  /** Whether a parent PIN exists yet. */
  pinSet: boolean;
  /** True while HEARTH_PARENT_PIN overrides the PIN saved here. */
  pinFromEnv: boolean;
  durable: boolean;
  balance: null;
}

/** PUT /api/allowance. `amount` is dollars as typed ("12", "12.50"); "" clears. */
export interface SetBalanceBody {
  pin: string;
  memberKey: string;
  amount: string;
  note?: string;
}

/** POST /api/allowance/pin. `current` is required once a PIN exists. */
export interface SetPinBody {
  current?: string;
  next: string;
}

export const PIN_MIN = 4;
export const PIN_MAX = 8;
export const NOTE_MAX = 60;
/** The most a balance can be set to: a typo guard, not a policy. */
export const MAX_CENTS = 10_000_00;

/** "$12.50" from whole cents. */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
