"use client";

import { Check, PartyPopper, RotateCcw } from "lucide-react";
import type { KidChore } from "@/lib/tada/types";
import type { ChoreRowState, KidChoreColumn } from "@/hooks/useHub";
import { colorVar } from "@/lib/calendar/palette";
import { useTextOn } from "@/components/common/ColorProvider";
import { Avatar } from "@/components/ui/Avatar";

// A kid's chores for today (spec §4.3, D5): what's left, each with a big check
// target, and what's done. The kids' surface is a list on purpose: they have a
// tracking problem, not a paralysis one. No streaks, stars or scores: Tada!
// owns reward state and this screen neither shows nor sums it.
//
// Used by Today (compact) and the Chores page (roomy), so a chore looks and
// behaves the same wherever a kid finds it.

function ChoreRow({
  row,
  color,
  onComplete,
  onUndo,
}: {
  row: ChoreRowState;
  /** The kid's palette slug: the check fills with their color. */
  color: string;
  onComplete: () => void;
  onUndo: () => void;
}) {
  const textOn = useTextOn();
  const { chore, done, showUndo, canUndo, error } = row;

  if (done) {
    return (
      <li className="flex min-h-14 items-center gap-3.5 py-1.5">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: `var(${colorVar(color)})`,
            color: textOn(color) === "dark" ? "#27221c" : "#ffffff",
          }}
          aria-hidden
        >
          <Check className="size-6" strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1 truncate text-body text-ink-faint line-through">
          {chore.name}
        </span>
        {showUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={`Undo: ${chore.name}`}
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-label font-semibold text-ink-soft ring-1 ring-inset ring-hairline-strong active:bg-surface-2 disabled:opacity-40"
          >
            <RotateCcw className="size-4" strokeWidth={2.25} aria-hidden />
            Undo
          </button>
        )}
      </li>
    );
  }

  return (
    <li className="py-1.5">
      <button
        type="button"
        onClick={onComplete}
        aria-label={`Complete: ${chore.name}`}
        className="group flex min-h-11 w-full items-center gap-3.5 rounded-2xl text-left active:bg-surface-2"
      >
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full transition-transform group-active:scale-90"
          style={{ boxShadow: `inset 0 0 0 2.5px var(${colorVar(color)})` }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 text-body leading-snug text-ink">{chore.name}</span>
      </button>
      {error && (
        <p className="pl-[3.4rem] pt-0.5 text-label text-bad" role="status">
          {error}
        </p>
      )}
    </li>
  );
}

export function KidChoreList({
  column,
  onComplete,
  onUndo,
  showHeader = true,
}: {
  column: KidChoreColumn;
  onComplete: (chore: KidChore) => void;
  onUndo: (chore: KidChore) => void;
  showHeader?: boolean;
}) {
  const { kid, chores } = column;
  const allDone = chores.length > 0 && chores.every((c) => c.done);

  return (
    <section aria-label={`${kid.name}'s chores`} className="flex min-h-0 min-w-0 flex-col">
      {showHeader && (
        <header className="mb-1 flex shrink-0 items-center gap-2.5">
          <Avatar name={kid.name} color={kid.color} size="sm" />
          <h3 className="truncate font-display text-title text-ink">{kid.name}</h3>
          {allDone && (
            <span className="ml-auto flex items-center gap-1.5 text-label font-semibold text-ink-soft">
              <PartyPopper className="size-5" strokeWidth={2} aria-hidden />
              All done!
            </span>
          )}
        </header>
      )}
      {chores.length === 0 ? (
        <p className="py-2 text-body text-ink-faint">Nothing to do today.</p>
      ) : (
        <ul className="flex min-h-0 flex-col divide-y divide-hairline overflow-y-auto">
          {chores.map((row) => (
            <ChoreRow
              key={row.chore.id}
              row={row}
              color={kid.color}
              onComplete={() => onComplete(row.chore)}
              onUndo={() => onUndo(row.chore)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
