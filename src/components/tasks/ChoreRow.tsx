"use client";

import { Check, Circle, RotateCcw } from "lucide-react";
import type { KidChore } from "@/lib/tada/types";

// One chore row in a kid's column (Phase 2 #12–14). Outstanding chores show a
// large empty tap target; tapping settles the row into a done state. A
// just-completed row offers a brief Undo (Q5). A failed write reverts the row and
// shows an inline message on that row only — never a global error (checklist #13).
//
// Tap targets are oversized for a child reaching up to a wall, with generous
// spacing so adjacent rows can't both fire on one press (checklist #15).
export function ChoreRow({
  chore,
  done,
  showUndo,
  canUndo,
  error,
  onComplete,
  onUndo,
}: {
  chore: KidChore;
  done: boolean;
  showUndo: boolean;
  canUndo: boolean;
  error: string | null;
  onComplete: () => void;
  onUndo: () => void;
}) {
  if (done) {
    return (
      <li className="flex items-center gap-4 py-3">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-ink text-surface">
          <Check className="size-8" strokeWidth={3} aria-hidden />
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
            className="flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-label font-medium text-ink-soft shadow-[inset_0_0_0_1px_var(--color-hairline-strong)] transition-colors active:bg-surface disabled:opacity-40"
          >
            <RotateCcw className="size-5" strokeWidth={2} aria-hidden />
            Undo
          </button>
        )}
      </li>
    );
  }

  return (
    <li className="py-3">
      <button
        type="button"
        onClick={onComplete}
        aria-label={`Complete: ${chore.name}`}
        className="group flex w-full items-center gap-4 text-left"
      >
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full text-ink-faint shadow-[inset_0_0_0_2px_var(--color-hairline-strong)] transition-colors group-active:bg-surface">
          <Circle className="size-8" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-body text-ink">{chore.name}</span>
      </button>
      {error && (
        <p className="pl-[4.5rem] pt-1 text-label text-ink-faint" role="status">
          {error}
        </p>
      )}
    </li>
  );
}
