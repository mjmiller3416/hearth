"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, PenLine, PiggyBank } from "lucide-react";
import type { HouseholdMember } from "@/lib/household";
import { useTimeZone } from "@/components/common/TimeZone";
import { Button } from "@/components/ui/Button";
import { AsOf, Loading, Tile } from "@/components/ui/Tile";
import { useClock } from "@/hooks/useNow";
import { useUpstream } from "@/hooks/useUpstream";
import { formatCents, type AllowanceViewPayload } from "@/lib/allowance/types";
import { useDeviceClass, useMounted } from "@/lib/prefs";

// A kid's own money, on their own day (Home, when they are the one looking). It answers one
// question, "how much do I have?", without opening the Greenlight app.
//
// The amount is one a parent typed in. Greenlight gives a household no way to
// read balances, so nothing here is synced, and the card never pretends
// otherwise: it says who entered the number and when, every time. If a synced
// source ever exists it gets its own label; a typed amount can't pass for one.
//
// On the shared wall the amount stays covered until tapped, and covers itself
// again after a few seconds, so a kid's money isn't on show to the room.

const REVEAL_MS = 20_000;
const REFRESH_MS = 5 * 60_000;

/** "today", "yesterday", or "Nov 18". */
function whenEntered(iso: string, timeZone?: string): string {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone });
  const then = new Date(iso);
  const today = new Date();
  if (day(then) === day(today)) return "today";
  if (day(then) === day(new Date(today.getTime() - 86_400_000))) return "yesterday";
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone });
}

export function AllowanceCard({
  member,
  className = "",
}: {
  member: HouseholdMember;
  className?: string;
}) {
  const timeZone = useTimeZone();
  const mounted = useMounted();
  const shared = useDeviceClass() === "wall";
  const [revealed, setRevealed] = useState(false);
  const clock = useClock();

  const fetcher = useCallback(async (): Promise<AllowanceViewPayload> => {
    const res = await fetch(`/api/allowance?viewer=${encodeURIComponent(member.key)}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`allowance ${res.status}`);
    return res.json();
  }, [member.key]);
  const state = useUpstream<AllowanceViewPayload>(fetcher, { enabled: mounted, intervalMs: REFRESH_MS });

  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealed(false), REVEAL_MS);
    return () => clearTimeout(t);
  }, [revealed]);

  const balance = state.data?.balance ?? null;
  const show = !shared || revealed;
  const old =
    clock && balance?.asOf
      ? clock.getTime() - new Date(balance.asOf).getTime() > 14 * 86_400_000
      : false;

  return (
    <Tile
      tone="leaf"
      title="My money"
      icon={PiggyBank}
      watermark={PiggyBank}
      className={className}
      stamp={<AsOf isStale={state.isStale} lastUpdated={state.lastUpdated} />}
      action={
        shared && balance?.cents != null ? (
          <Button size="sm" onClick={() => setRevealed((r) => !r)}>
            {revealed ? (
              <EyeOff className="size-4" strokeWidth={2.25} aria-hidden />
            ) : (
              <Eye className="size-4" strokeWidth={2.25} aria-hidden />
            )}
            {revealed ? "Hide" : "Show"}
          </Button>
        ) : undefined
      }
    >
      {state.isLoading ? (
        <Loading rows={1} />
      ) : state.failed ? (
        <p className="py-2 text-body text-fg-soft">Can&rsquo;t load your money right now.</p>
      ) : !balance || balance.cents == null ? (
        <p className="py-2 text-body text-fg-soft">
          No amount yet. Ask a parent to add it in Settings.
        </p>
      ) : (
        <div>
          <p className="font-display text-giant font-medium leading-none tabular-nums text-fg" aria-live="polite">
            {show ? formatCents(balance.cents) : "$ • • •"}
          </p>
          <p className="mt-2.5 flex items-center gap-1.5 text-small text-fg-soft">
            <PenLine className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
            A parent entered this {balance.asOf ? whenEntered(balance.asOf, timeZone) : ""}
            {balance.note ? ` · ${balance.note}` : ""}
          </p>
          <p className="mt-1 text-tiny text-fg-soft">
            Not synced with Greenlight{old ? ", and it's been a while. Ask a parent to check." : ". Spending since then isn't counted."}
          </p>
        </div>
      )}
    </Tile>
  );
}
