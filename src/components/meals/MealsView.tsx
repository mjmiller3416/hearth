"use client";

import { useCallback, useEffect, useState } from "react";
import { ViewFrame } from "@/components/layout/ViewFrame";
import { useUpstream } from "@/hooks/useUpstream";
import { useIdleReset } from "@/hooks/useIdleReset";
import type { MealPlanPayload, PlannedMeal } from "@/lib/spoon/types";
import { MealCardPanel, MealMeta } from "./MealCardPanel";

// The Meals view (Phase 4, spec §4.5, D6) — a glanceable "what's for dinner."
// The week's plan from Enchanted Spoon, each meal a tile showing its day and
// dish; tapping one opens its card (ingredients + recipe). Read-only: the wall
// reads the plan and reads the card, but never assigns or edits — that stays on
// the phone.
//
// Polls every 60s on Hearth's stale-data contract (useUpstream): a plan changed
// on a phone lands on the wall within a minute, and a failed poll keeps the last
// good render rather than blanking (spec §6.2). Not connected → a calm state,
// never an error (like the Tada! surfaces).

/** A plan row's day chip: "Today"/"Tomorrow"/weekday, or "Queued" when the
 *  entry has no scheduled date (Enchanted Spoon's planner is a queue). */
function planDay(iso: string | null): { label: string; sub: string | null } {
  if (!iso) return { label: "Queued", sub: null };
  const parts = iso.split("-").map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d) return { label: "Queued", sub: null };
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  const monthDay = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (diffDays === 0) return { label: "Today", sub: monthDay };
  if (diffDays === 1) return { label: "Tomorrow", sub: monthDay };
  if (diffDays === -1) return { label: "Yesterday", sub: monthDay };
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  return { label: weekday, sub: monthDay };
}

function MealTile({ meal, onOpen }: { meal: PlannedMeal; onOpen: () => void }) {
  const day = planDay(meal.scheduledDate);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${meal.name}`}
      className={[
        "flex h-full flex-col rounded-3xl bg-surface p-6 text-left",
        "shadow-[inset_0_0_0_1px_var(--color-hairline)] transition-transform active:scale-[0.99]",
        meal.isCompleted ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <span className="font-display text-title leading-none text-ink">{day.label}</span>
        {day.sub && <span className="text-label text-ink-faint">{day.sub}</span>}
      </div>

      <h2 className="font-display text-display leading-tight text-ink">{meal.name}</h2>
      {meal.mainRecipeName && meal.mainRecipeName !== meal.name && (
        <p className="mt-1 text-body text-ink-soft">{meal.mainRecipeName}</p>
      )}

      <div className="mt-auto pt-5">
        {meal.isCompleted ? (
          <span className="text-label text-ink-faint">Made ✓</span>
        ) : (
          <MealMeta totalTime={meal.totalTime} sideDishCount={meal.sideDishCount} />
        )}
      </div>
    </button>
  );
}

export function MealsView() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState<PlannedMeal | null>(null);
  useEffect(() => setMounted(true), []);

  const fetcher = useCallback(async (): Promise<MealPlanPayload> => {
    const res = await fetch("/api/meals", { cache: "no-store" });
    if (!res.ok) throw new Error(`meals ${res.status}`);
    return res.json();
  }, []);

  const { data, isStale, lastUpdated, isLoading } = useUpstream<MealPlanPayload>(fetcher, {
    intervalMs: 60_000,
    enabled: mounted,
  });

  // Idle reset: close an open card so the wall returns to the plan (checklist #17).
  useIdleReset(
    useCallback(() => setOpen(null), []),
    { enabled: mounted },
  );

  if (!mounted) {
    return <ViewFrame title="Meals">{null}</ViewFrame>;
  }

  const configured = data?.configured ?? false;
  const meals = data?.meals ?? [];

  return (
    <ViewFrame title="Meals" isStale={isStale} lastUpdated={lastUpdated}>
      {isLoading ? (
        // Stay quiet until the first poll resolves — never flash "not connected"
        // while we simply haven't loaded yet.
        null
      ) : !configured ? (
        <NotConnected />
      ) : meals.length === 0 ? (
        <EmptyPlan />
      ) : (
        <div className="h-full overflow-y-auto">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(26rem,1fr))] gap-5 pb-2 [grid-auto-rows:1fr]">
            {meals.map((meal) => (
              <MealTile key={meal.entryId} meal={meal} onOpen={() => setOpen(meal)} />
            ))}
          </div>
        </div>
      )}

      {open && (
        <MealCardPanel
          mealId={open.mealId}
          mealName={open.name}
          onClose={() => setOpen(null)}
        />
      )}
    </ViewFrame>
  );
}

function EmptyPlan() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-title text-ink-soft">No meals planned yet.</p>
      <p className="max-w-xl text-body text-ink-faint">
        Meals you plan in Enchanted Spoon show up here.
      </p>
    </div>
  );
}

function NotConnected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-title text-ink-soft">Not connected to Enchanted Spoon yet.</p>
      <p className="max-w-xl text-body text-ink-faint">
        The week’s meal plan appears here once Enchanted Spoon is set up.
      </p>
    </div>
  );
}
