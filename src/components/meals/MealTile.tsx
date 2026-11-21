"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { PlannedMeal } from "@/lib/spoon/types";
import { planDay } from "@/lib/spoon/format";
import { MealMeta } from "./MealCardPanel";
import { MealImage } from "./mealVisuals";

// One planned meal: its picture (or tone), day, name and the two facts that
// matter at a glance. Tapping opens the recipe. "Cooked" is the one write, and
// because it can't be undone from Hearth it takes two taps: the first arms it
// ("Sure?"), the second does it. A stray touch on the wall no longer drops
// tonight's dinner off the plan.

/** The two-tap "Cooked" control. Disarms itself after a few seconds. */
export function CookedButton({
  name,
  onCook,
  className = "",
}: {
  name: string;
  onCook: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      onClick={() => {
        if (armed) onCook();
        else setArmed(true);
      }}
      aria-label={armed ? `Confirm: ${name} is cooked` : `Mark ${name} cooked`}
      className={`flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-label font-semibold leading-none shadow-card transition-colors active:scale-95 ${
        armed ? "bg-ink text-on-ink" : "bg-surface text-ink ring-1 ring-hairline"
      } ${className}`}
    >
      <Check className="size-4" strokeWidth={3} aria-hidden />
      {armed ? "Sure?" : "Cooked"}
    </button>
  );
}

export function MealTile({
  meal,
  today,
  onOpen,
  onCook,
}: {
  meal: PlannedMeal;
  /** Household-zone "now", for the day label. */
  today: Date;
  onOpen: () => void;
  onCook: () => void;
}) {
  const day = planDay(meal.scheduledDate, today);
  const tonight = day.offset === 0;
  return (
    // "Cooked" is a sibling of the open button, not nested inside it.
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${meal.name}`}
        className={`flex h-full w-full flex-col overflow-hidden rounded-[1.25rem] bg-surface-2 text-left transition-transform active:scale-[0.99] ${
          tonight ? "ring-2 ring-ink" : "ring-1 ring-hairline"
        }`}
      >
        <div className="relative h-28 w-full shrink-0 wide:h-32">
          <MealImage id={meal.mealId} name={meal.name} imageUrl={meal.imageUrl} iconClassName="size-14" />
          <span
            className={`absolute left-3 top-3 rounded-full px-3 py-1.5 text-stamp font-semibold leading-none ${
              tonight ? "bg-ink text-on-ink" : "bg-surface text-ink"
            }`}
          >
            {day.sub && !tonight ? `${day.label} · ${day.sub}` : day.label}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="font-display text-title leading-tight text-ink">{meal.name}</h3>
          {meal.mainRecipeName && meal.mainRecipeName !== meal.name && (
            <p className="-mt-1 line-clamp-1 text-label text-ink-soft">{meal.mainRecipeName}</p>
          )}
          {/* Room on the right for the Cooked button, which sits over this row. */}
          <div className="mt-auto flex min-h-10 items-center pr-[6.5rem]">
            <MealMeta totalTime={meal.totalTime} sideDishCount={meal.sideDishCount} />
          </div>
        </div>
      </button>
      <CookedButton name={meal.name} onCook={onCook} className="absolute bottom-4 right-3" />
    </div>
  );
}
