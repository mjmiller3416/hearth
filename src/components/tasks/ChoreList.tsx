"use client";

import { Check, PartyPopper, RotateCcw } from "lucide-react";
import type { KidChore } from "@/lib/tada/types";
import type { ChoreRowState, KidChoreColumn } from "@/hooks/useHub";
import { colorVar } from "@/lib/calendar/palette";
import { useTextOn } from "@/components/common/ColorProvider";
import { Avatar, ON_LIGHT } from "@/components/ui/Avatar";

// A kid's chores for today (spec §4.3, D5): what's left, each with a big check
// target, and what's done. The kids' surface is a list on purpose: they have a
// tracking problem, not a paralysis one. The bar under the name is today's
// list filling up, nothing more: no streaks, stars or scores. Tada! owns reward
// state and this screen neither shows nor sums it.
//
// Used by Home (in a tile) and the Chores page (roomy), so a chore looks and
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
      <li className="flex min-h-12 items-center gap-3.5 py-1">
        <span
          className="flex size-9 shrink-0 animate-pop items-center justify-center rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.75)]"
          style={{
            backgroundColor: `var(${colorVar(color)})`,
            color: textOn(color) === "dark" ? ON_LIGHT : "#ffffff",
          }}
          aria-hidden
        >
          <Check className="size-5" strokeWidth={3.25} />
        </span>
        <span className="min-w-0 flex-1 truncate text-body text-fg-faint line-through">{chore.name}</span>
        {showUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={`Undo: ${chore.name}`}
            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-fill-2 px-3.5 text-small font-semibold text-fg active:scale-95 disabled:opacity-40"
          >
            <RotateCcw className="size-4" strokeWidth={2.5} aria-hidden />
            Undo
          </button>
        )}
      </li>
    );
  }

  return (
    <li className="py-1">
      <button
        type="button"
        onClick={onComplete}
        aria-label={`Complete: ${chore.name}`}
        className="group flex min-h-11 w-full items-center gap-3.5 rounded-2xl text-left active:bg-fill"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fill transition-transform group-active:scale-90"
          style={{ boxShadow: "inset 0 0 0 2.5px var(--color-line-strong)" }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 text-body font-medium leading-snug text-fg">{chore.name}</span>
      </button>
      {error && (
        <p className="pl-[3.1rem] pt-0.5 text-small text-bad" role="status">
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
  const doneCount = chores.filter((c) => c.done).length;
  const allDone = chores.length > 0 && doneCount === chores.length;

  return (
    <section aria-label={`${kid.name}'s chores`} className="flex min-h-0 min-w-0 flex-col">
      {showHeader && (
        <header className="mb-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <Avatar name={kid.name} color={kid.color} size="sm" />
            <h3 className="truncate font-display text-lead font-medium text-fg">{kid.name}</h3>
            <span className="ml-auto flex items-center gap-1.5 text-small font-semibold text-fg-soft">
              {allDone ? (
                <>
                  <PartyPopper className="size-5 text-spark" strokeWidth={2.25} aria-hidden />
                  All done!
                </>
              ) : chores.length > 0 ? (
                `${doneCount} of ${chores.length}`
              ) : null}
            </span>
          </div>
          {chores.length > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill-2" aria-hidden>
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${(doneCount / chores.length) * 100}%`,
                  backgroundColor: `var(${colorVar(kid.color)})`,
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.5)",
                }}
              />
            </div>
          )}
        </header>
      )}
      {chores.length === 0 ? (
        <p className="py-2 text-body text-fg-soft">Nothing to do today.</p>
      ) : (
        <ul className="flex min-h-0 flex-col overflow-y-auto">
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
