"use client";

import { Check } from "lucide-react";
import type { SessionTask as SessionTaskT } from "@/lib/tada/types";

// The Clean session's one task, rendered large and alone (spec D4, checklist #8).
// One task, a single big complete target, nothing else — no queue, no count, no
// "up next". Tada! chose it; Hearth only renders and completes.
//
// The complete target is oversized for a hand reaching up to a wall (checklist
// #15). Completing settles the task into a brief done state and cross-fades in
// the next one; that transition is orchestrated by CleanView.
export function SessionTask({
  task,
  onComplete,
  disabled,
}: {
  task: SessionTaskT;
  onComplete: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 text-center">
      <div className="flex flex-col items-center gap-3">
        {task.room && (
          <span className="text-title font-medium text-ink-soft">{task.room}</span>
        )}
        <h2 className="max-w-3xl text-balance font-display text-date leading-tight text-ink">
          {task.name}
        </h2>
      </div>

      <button
        type="button"
        onClick={onComplete}
        disabled={disabled}
        aria-label={`Complete: ${task.name}`}
        className="group flex flex-col items-center gap-4 disabled:opacity-60"
      >
        <span className="flex size-40 items-center justify-center rounded-full bg-ink text-surface shadow-[0_16px_40px_-12px_rgba(43,38,32,0.5)] transition-transform group-active:scale-95">
          <Check className="size-20" strokeWidth={2.5} aria-hidden />
        </span>
        <span className="text-title font-medium text-ink-soft">Done</span>
      </button>
    </div>
  );
}
