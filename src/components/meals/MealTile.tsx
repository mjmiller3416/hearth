"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { PlannedMeal } from "@/lib/spoon/types";
import { planDay } from "@/lib/spoon/format";
import { MealMeta } from "./MealCardPanel";
import { MealImage } from "./mealVisuals";

// One planned meal as a picture: the photo (or the meal's color and glyph) fills
// the tile, with the day, the name and the two facts that matter laid over it.
// Tapping opens the recipe. "Cooked" is the one write, and because it can't be
// undone from Hearth it takes two taps: the first arms it ("Sure?"), the second
// does it. A stray touch on the wall can't drop tonight's dinner off the plan.

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
      className={`flex min-h-10 items-center gap-1.5 rounded-full px-4 text-small font-semibold leading-none transition-colors active:scale-95 ${
        armed ? "bg-spark text-night" : "bg-white/25 text-white"
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
    <div className="on-color relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${meal.name}`}
        className="relative block h-48 w-full overflow-hidden rounded-[1.5rem] text-left shadow-tile transition-transform active:scale-[0.98] wide:h-[13.5rem]"
      >
        <MealImage id={meal.mealId} name={meal.name} imageUrl={meal.imageUrl} iconClassName="size-20 -translate-y-[3.1rem] translate-x-[5.6rem] opacity-85" />
        <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" aria-hidden />
        <span
          className={`absolute left-3 top-3 rounded-full px-3 py-1.5 text-tiny font-bold uppercase leading-none tracking-wide ${
            tonight ? "bg-spark text-night" : "bg-black/35 text-white"
          }`}
        >
          {day.sub && !tonight ? `${day.label} · ${day.sub}` : day.label}
        </span>
        <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-4 pr-[7.25rem]">
          <span className="line-clamp-2 font-display text-lead font-medium leading-tight text-white">
            {meal.name}
          </span>
          <MealMeta totalTime={meal.totalTime} sideDishCount={meal.sideDishCount} />
        </span>
      </button>
      <CookedButton name={meal.name} onCook={onCook} className="absolute bottom-3.5 right-3" />
    </div>
  );
}
