"use client";

import type { KidChore, TadaMember } from "@/lib/tada/types";
import { colorVar } from "@/lib/calendar/palette";
import { useTextOn } from "@/components/common/ColorProvider";
import { ChoreRow } from "./ChoreRow";

// One kid's column (Phase 2 #12). Headed by the kid's name and an avatar circle
// in their member color — the same color system as the calendar (spec §7) — then
// their chores for today: outstanding rows first (tappable), completed rows
// after (done state). No streak, badge, or star: Tada! owns reward state and this
// screen neither renders nor summarizes it (spec D5, checklist #18).

export interface RenderChore {
  chore: KidChore;
  done: boolean;
  showUndo: boolean;
  canUndo: boolean;
  error: string | null;
}

export function KidColumn({
  kid,
  chores,
  onComplete,
  onUndo,
}: {
  kid: TadaMember;
  chores: RenderChore[];
  onComplete: (chore: KidChore) => void;
  onUndo: (chore: KidChore) => void;
}) {
  const textOn = useTextOn();
  const dark = textOn(kid.color) === "dark";

  return (
    <section
      className="flex h-full min-w-0 flex-1 flex-col rounded-3xl bg-surface px-6 py-6 shadow-[inset_0_0_0_1px_var(--color-hairline)]"
      aria-label={`${kid.name}'s chores`}
    >
      <header className="mb-4 flex shrink-0 items-center gap-3">
        <span
          className={`flex size-12 items-center justify-center rounded-full font-display text-title leading-none ${
            dark ? "text-ink" : "text-white"
          }`}
          style={{ backgroundColor: `var(${colorVar(kid.color)})` }}
          aria-hidden
        >
          {kid.name.slice(0, 1).toUpperCase()}
        </span>
        <h2 className="truncate font-display text-title text-ink">{kid.name}</h2>
      </header>

      {chores.length === 0 ? (
        <p className="text-body text-ink-faint">Nothing assigned today.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col divide-y divide-hairline overflow-y-auto">
          {chores.map((rc) => (
            <ChoreRow
              key={rc.chore.id}
              chore={rc.chore}
              done={rc.done}
              showUndo={rc.showUndo}
              canUndo={rc.canUndo}
              error={rc.error}
              onComplete={() => onComplete(rc.chore)}
              onUndo={() => onUndo(rc.chore)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
