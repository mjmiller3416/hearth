"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Info, Lock, LockOpen, PenLine, TriangleAlert } from "lucide-react";
import { useHousehold } from "@/components/app/Household";
import { useTimeZone } from "@/components/common/TimeZone";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/Tile";
import { Keypad, PinDots } from "@/components/ui/Keypad";
import { Sheet, SheetBody, SheetFooter, SheetHeader } from "@/components/ui/Sheet";
import { useTouchWall } from "@/hooks/useTouchWall";
import {
  formatCents,
  NOTE_MAX,
  PIN_MAX,
  PIN_MIN,
  type AllowanceBalance,
  type AllowanceParentPayload,
  type AllowanceStatusPayload,
} from "@/lib/allowance/types";

// The parents' side of allowance (Settings). Behind a parent PIN: see every
// kid's balance, and type in what each has after checking the Greenlight app.
//
// The PIN is held only in this component's memory while the section is open,
// and forgotten after a few idle minutes or on leaving the page. It is sent
// with each request and checked on the server every time.

const HEADERS = { "content-type": "application/json" } as const;
const RELOCK_MS = 5 * 60_000;

async function post<T>(url: string, body: unknown, method = "POST"): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method, headers: HEADERS, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error ?? "That didn't work. Try again." };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "Couldn't reach Hearth. Try again." };
  }
}

export function AllowanceSettings() {
  const [status, setStatus] = useState<AllowanceStatusPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [data, setData] = useState<AllowanceParentPayload | null>(null);
  const [asking, setAsking] = useState<"unlock" | "create" | "change" | null>(null);
  const [editing, setEditing] = useState<AllowanceBalance | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/allowance", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setStatus((await res.json()) as AllowanceStatusPayload);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void loadStatus(), 0);
    return () => clearTimeout(t);
  }, [loadStatus]);

  const lock = useCallback(() => {
    setPin(null);
    setData(null);
    setEditing(null);
  }, []);
  // Forget the PIN after a while with the section open and untouched.
  useEffect(() => {
    if (!pin) return;
    const t = setTimeout(lock, RELOCK_MS);
    return () => clearTimeout(t);
  }, [pin, data, lock]);

  if (failed) {
    return (
      <p className="text-body text-fg-faint">
        Can&rsquo;t load allowance right now.{" "}
        <button type="button" className="font-semibold text-fg underline" onClick={() => void loadStatus()}>
          Try again
        </button>
      </p>
    );
  }
  if (!status) return <Loading rows={2} />;

  const durable = data?.durable ?? status.durable;

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2.5 text-small text-fg-soft">
        <Info className="mt-0.5 size-4 shrink-0 text-fg-faint" strokeWidth={2.25} aria-hidden />
        <span>
          Greenlight has no way for a family to connect another app to its balances, so
          these are amounts you type in after checking the Greenlight app. Each kid sees
          only their own, labeled as entered by a parent with the date.
        </span>
      </p>

      {!durable && (
        <p className="flex items-start gap-2.5 rounded-2xl bg-bad-soft px-4 py-3 text-small text-bad">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} aria-hidden />
          <span>
            Storage isn&rsquo;t set up on the server yet, so amounts and the PIN reset whenever
            Hearth is updated. (Mitchell: attach a volume and set HEARTH_DATA_DIR.)
          </span>
        </p>
      )}

      {!status.pinSet ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-fill px-4 py-3 ring-1 ring-inset ring-line">
          <span className="text-body text-fg">Start by choosing a parent PIN.</span>
          <Button variant="primary" onClick={() => setAsking("create")}>
            <Lock className="size-4" strokeWidth={2.5} aria-hidden />
            Set a PIN
          </Button>
        </div>
      ) : !data ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-fill px-4 py-3 ring-1 ring-inset ring-line">
          <span className="text-body text-fg">Balances are locked.</span>
          <Button variant="primary" onClick={() => setAsking("unlock")}>
            <LockOpen className="size-4" strokeWidth={2.5} aria-hidden />
            Enter parent PIN
          </Button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {data.balances.length === 0 && (
              <li className="text-body text-fg-faint">No kids are set up on Hearth.</li>
            )}
            {data.balances.map((b) => (
              <BalanceRow key={b.memberKey} balance={b} onEdit={() => setEditing(b)} />
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={lock}>
              <Lock className="size-4" strokeWidth={2.5} aria-hidden />
              Lock
            </Button>
            <Button variant="ghost" onClick={() => setAsking("change")}>
              Change PIN
            </Button>
          </div>
          {status.pinFromEnv && (
            <p className="text-tiny text-fg-faint">
              The PIN is fixed on the server right now (HEARTH_PARENT_PIN). One you save here
              takes over when that is removed.
            </p>
          )}
        </>
      )}

      {asking && (
        <PinSheet
          mode={asking}
          currentPin={pin}
          onClose={() => setAsking(null)}
          onUnlocked={(enteredPin, payload) => {
            setPin(enteredPin);
            setData(payload);
            setAsking(null);
            void loadStatus();
          }}
        />
      )}

      {editing && pin && (
        <AmountSheet
          balance={editing}
          pin={pin}
          onClose={() => setEditing(null)}
          onSaved={(payload) => {
            setData(payload);
            setEditing(null);
          }}
          onLocked={lock}
        />
      )}
    </div>
  );
}

function BalanceRow({ balance, onEdit }: { balance: AllowanceBalance; onEdit: () => void }) {
  const timeZone = useTimeZone();
  const { byKey } = useHousehold();
  const member = byKey(balance.memberKey);
  return (
    <li className="flex items-center gap-3.5 rounded-2xl bg-fill px-4 py-3 ring-1 ring-inset ring-line">
      <Avatar name={balance.name} color={member?.color ?? "neutral"} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block text-body text-fg">{balance.name}</span>
        <span className="flex items-center gap-1.5 text-tiny text-fg-faint">
          <PenLine className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
          {balance.asOf
            ? `Entered ${new Date(balance.asOf).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone })}${balance.note ? ` · ${balance.note}` : ""}`
            : "Nothing entered yet"}
        </span>
      </span>
      <span className="font-display text-lead tabular-nums text-fg">
        {balance.cents == null ? "—" : formatCents(balance.cents)}
      </span>
      <Button size="sm" onClick={onEdit} aria-label={`Update ${balance.name}'s balance`}>
        Update
      </Button>
    </li>
  );
}

/** Enter, create or change the parent PIN. */
function PinSheet({
  mode,
  currentPin,
  onClose,
  onUnlocked,
}: {
  mode: "unlock" | "create" | "change";
  /** The PIN already entered this session (for a change), if any. */
  currentPin: string | null;
  onClose: () => void;
  onUnlocked: (pin: string, payload: AllowanceParentPayload) => void;
}) {
  const [value, setValue] = useState("");
  const [first, setFirst] = useState<string | null>(null); // create/change: the PIN to confirm
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title =
    mode === "unlock" ? "Parent PIN" : first === null ? (mode === "create" ? "Choose a parent PIN" : "New parent PIN") : "Enter it once more";
  const ready = value.length >= PIN_MIN;

  const unlock = async (pinToUse: string) => {
    const result = await post<AllowanceParentPayload>("/api/allowance/unlock", { pin: pinToUse });
    if (!result.ok) {
      setError(result.error);
      setValue("");
      return;
    }
    onUnlocked(pinToUse, result.data);
  };

  const submit = async () => {
    if (!ready || busy) return;
    setError(null);
    if (mode === "unlock") {
      setBusy(true);
      await unlock(value);
      setBusy(false);
      return;
    }
    if (first === null) {
      setFirst(value);
      setValue("");
      return;
    }
    if (first !== value) {
      setError("Those didn't match. Start again.");
      setFirst(null);
      setValue("");
      return;
    }
    setBusy(true);
    const saved = await post("/api/allowance/pin", { current: currentPin ?? undefined, next: value });
    if (!saved.ok) {
      setError(saved.error);
      setFirst(null);
      setValue("");
    } else {
      await unlock(value);
    }
    setBusy(false);
  };

  return (
    <Sheet label={title} onClose={onClose} size="sm">
      <SheetHeader
        title={title}
        subtitle={
          mode === "unlock"
            ? "To see and update the kids' balances."
            : `${PIN_MIN} to ${PIN_MAX} digits. Kids shouldn't know it.`
        }
        onClose={onClose}
      />
      <SheetBody className="flex flex-col gap-5">
        <PinDots length={value.length} max={PIN_MAX} />
        {error && (
          <p role="alert" className="text-center text-small text-bad">
            {error}
          </p>
        )}
        <Keypad value={value} onChange={setValue} maxLength={PIN_MAX} onEnter={() => void submit()} />
      </SheetBody>
      <SheetFooter>
        <Button variant="primary" className="flex-1" onClick={() => void submit()} disabled={!ready || busy}>
          {mode === "unlock" ? "Unlock" : first === null ? "Next" : "Save PIN"}
        </Button>
      </SheetFooter>
    </Sheet>
  );
}

/** Type in what one kid has right now. */
function AmountSheet({
  balance,
  pin,
  onClose,
  onSaved,
  onLocked,
}: {
  balance: AllowanceBalance;
  pin: string;
  onClose: () => void;
  onSaved: (payload: AllowanceParentPayload) => void;
  onLocked: () => void;
}) {
  const isWall = useTouchWall();
  const [amount, setAmount] = useState(balance.cents == null ? "" : (balance.cents / 100).toFixed(2));
  const [note, setNote] = useState(balance.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await post<AllowanceParentPayload>(
      "/api/allowance",
      { pin, memberKey: balance.memberKey, amount: value, note },
      "PUT",
    );
    setBusy(false);
    if (result.ok) return onSaved(result.data);
    // A PIN that no longer works (changed elsewhere, or locked out): start over.
    if (/PIN/i.test(result.error)) onLocked();
    setError(result.error);
  };

  return (
    <Sheet label={`${balance.name}'s balance`} onClose={onClose} size="sm">
      <SheetHeader
        title={`${balance.name}'s balance`}
        subtitle="What the Greenlight app shows right now."
        onClose={onClose}
      />
      <SheetBody className="flex flex-col gap-4">
        {isWall ? (
          <>
            <p className="text-center font-display text-giant leading-none tabular-nums text-fg">
              ${amount || "0"}
            </p>
            <Keypad value={amount} onChange={setAmount} maxLength={9} decimal onEnter={() => void save(amount)} />
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-small font-semibold uppercase tracking-[0.08em] text-fg-soft">Amount</span>
              <span className="flex min-h-14 items-center gap-1 rounded-2xl bg-fill px-4 ring-1 ring-inset ring-line focus-within:ring-2 focus-within:ring-accent">
                <span className="font-display text-big text-fg-faint">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void save(amount);
                  }}
                  placeholder="0.00"
                  aria-label="Amount in dollars"
                  className="min-w-0 flex-1 bg-transparent font-display text-big tabular-nums text-fg outline-none placeholder:text-fg-faint"
                />
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-small font-semibold uppercase tracking-[0.08em] text-fg-soft">
                Note (optional)
              </span>
              <input
                type="text"
                value={note}
                maxLength={NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. after birthday money"
                className="min-h-12 rounded-2xl bg-fill px-4 text-body text-fg outline-none ring-1 ring-inset ring-line placeholder:text-fg-faint focus:ring-2 focus:ring-accent"
              />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="text-small text-bad">
            {error}
          </p>
        )}
      </SheetBody>
      <SheetFooter>
        {balance.cents != null && (
          <Button variant="ghost" onClick={() => void save("")} disabled={busy}>
            Clear
          </Button>
        )}
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => void save(amount)}
          disabled={busy || amount.trim() === ""}
        >
          <Check className="size-5" strokeWidth={2.75} aria-hidden />
          Save
        </Button>
      </SheetFooter>
    </Sheet>
  );
}
