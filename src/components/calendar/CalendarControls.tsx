"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

// The header-right controls (Phase 1 #11, #12): the period on show, previous /
// today / next, and a Month · Week view toggle. Sits in the ViewFrame's actions
// slot, beside the stale stamp. Touch-sized targets for a hand reaching up to a
// wall (spec §6.1).
//
// The period label ("December 2026", "Nov 30 – Dec 6") lives here because the
// ViewFrame title is hidden on the calendar (tags-left / controls-right row) and
// the main header always shows TODAY — without it, stepping to another month
// left nothing on screen naming the month being viewed. Fixed width so the
// arrows don't shift under a finger tapping through months.

type ViewMode = "month" | "week";

function IconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-12 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface"
    >
      {children}
    </button>
  );
}

export function CalendarControls({
  mode,
  title,
  onPrev,
  onNext,
  onToday,
  onSetMode,
}: {
  mode: ViewMode;
  /** The period being viewed: monthTitle() or weekTitle() of the anchor. */
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSetMode: (mode: ViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <span
        aria-live="polite"
        className="w-72 whitespace-nowrap text-right font-display text-title leading-none text-ink"
      >
        {title}
      </span>
      <div className="flex items-center gap-1">
        <IconButton onClick={onPrev} label="Previous">
          <ChevronLeft className="size-8" strokeWidth={2} aria-hidden />
        </IconButton>
        <button
          type="button"
          onClick={onToday}
          className="rounded-full px-5 py-2 text-label font-medium text-ink transition-colors hover:bg-surface"
        >
          Today
        </button>
        <IconButton onClick={onNext} label="Next">
          <ChevronRight className="size-8" strokeWidth={2} aria-hidden />
        </IconButton>
      </div>

      {/* Segmented Month · Week toggle. */}
      <div
        className="flex items-center rounded-full p-1"
        style={{ boxShadow: "inset 0 0 0 1.5px var(--color-hairline-strong)" }}
      >
        {(["month", "week"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => onSetMode(m)}
            className={`rounded-full px-4 py-1.5 text-label font-medium capitalize transition-colors ${
              mode === m ? "bg-ink text-surface" : "text-ink-soft"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
