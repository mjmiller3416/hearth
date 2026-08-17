"use client";

import { Check } from "lucide-react";
import type { Completion } from "@/lib/tada/types";
import { colorVar } from "@/lib/calendar/palette";

// Clean's done-today celebration (spec D4, checklist #11). Completed tasks
// accumulate as they land, newest first — and there is deliberately NO total, no
// denominator, no progress bar, no "N of M". The enemy is the tally, not the
// presence of done work: this celebrates what happened, it never measures what's
// left. A completion made on a phone lands here too, on the next poll.
//
// If you are tempted to add a count here, re-read D4 — that change is wrong no
// matter how much empty space it fills.

function formatTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function DoneToday({
  completions,
  accentColor,
  timeZone,
}: {
  completions: Completion[];
  /** The acting adult's palette slug, for a quiet check accent (spec §7). */
  accentColor: string | null;
  timeZone?: string;
}) {
  return (
    <section className="flex h-full flex-col" aria-label="Done today">
      <h2 className="mb-5 shrink-0 font-display text-title text-ink">Done today</h2>

      {completions.length === 0 ? (
        <p className="text-body text-ink-faint">
          Nothing yet today. The first one lands here.
        </p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {completions.map((c) => (
            <li
              key={c.completionId}
              className="flex items-center gap-4 border-b border-hairline pb-3 last:border-b-0"
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-white"
                style={{
                  backgroundColor: accentColor
                    ? `var(${colorVar(accentColor)})`
                    : "var(--color-ink-soft)",
                }}
                aria-hidden
              >
                <Check className="size-5" strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-ink">{c.taskName}</span>
                {c.room && (
                  <span className="block text-label text-ink-faint">{c.room}</span>
                )}
              </span>
              <span className="shrink-0 text-label text-ink-faint">
                {formatTime(c.completedAt, timeZone)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
