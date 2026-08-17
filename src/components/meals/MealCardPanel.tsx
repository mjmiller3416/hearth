"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Salad, Soup, Utensils, X } from "lucide-react";
import type { CardRecipe, Ingredient, MealCard, MealCardPayload } from "@/lib/spoon/types";

// The meal card (Phase 4, spec §4.5): opens when a meal in the plan is tapped.
// Reads full — every recipe the meal is composed of (main dish first, then
// sides), each with its ingredients and step-by-step directions, the same card
// Enchanted Spoon renders in its Meal Planner. Read-only (D6): there is no
// assign, swap, or edit here — planning stays on the phone.
//
// Dismissed by tapping outside, the close control, or Escape (matches DayPanel).
// The card scrolls within the panel, never the page (kiosk — nothing scrolls at
// the app level).

/** "1 lb", "3 cloves"; plain numbers (JS already drops a trailing .0). */
function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity == null) return unit ?? "";
  const n = String(quantity);
  return unit ? `${n} ${unit}` : n;
}

function ingredientLine(ing: Ingredient): string {
  const measure = formatQuantity(ing.quantity, ing.unit).trim();
  return measure ? `${measure} · ${ing.name}` : ing.name;
}

function metaBits(recipe: CardRecipe): string[] {
  const bits: string[] = [];
  if (recipe.totalTime != null) bits.push(`${recipe.totalTime} min`);
  if (recipe.servings != null) bits.push(`Serves ${recipe.servings}`);
  if (recipe.difficulty) bits.push(recipe.difficulty);
  return bits;
}

function RecipeBlock({ recipe, isFirst }: { recipe: CardRecipe; isFirst: boolean }) {
  const bits = metaBits(recipe);
  return (
    <section className={isFirst ? "" : "border-t border-hairline pt-6"}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className="font-display text-title leading-tight text-ink">{recipe.name}</h3>
        {recipe.role === "side" && (
          <span className="rounded-full bg-ground px-3 py-1 text-label text-ink-soft">
            Side
          </span>
        )}
      </div>

      {bits.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-ink-faint">
          {bits.map((b, i) => (
            <span key={b} className="flex items-center gap-3">
              {i > 0 && <span aria-hidden>·</span>}
              {b}
            </span>
          ))}
        </div>
      )}

      {recipe.description && (
        <p className="mb-5 text-body text-ink-soft">{recipe.description}</p>
      )}

      <div className="grid grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-8 max-[70rem]:grid-cols-1">
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-label font-medium text-ink-soft">
            <Soup className="size-5" strokeWidth={2} aria-hidden />
            Ingredients
          </h4>
          {recipe.ingredients.length === 0 ? (
            <p className="text-body text-ink-faint">No ingredients listed.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recipe.ingredients.map((ing, i) => (
                <li key={`${ing.name}-${i}`} className="text-body text-ink">
                  {ingredientLine(ing)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-3 flex items-center gap-2 text-label font-medium text-ink-soft">
            <Utensils className="size-5" strokeWidth={2} aria-hidden />
            Recipe
          </h4>
          {recipe.steps.length === 0 ? (
            <p className="text-body text-ink-faint">No directions listed.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-4 text-body text-ink">
                  <span
                    className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-ground font-display text-label leading-none text-ink-soft"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">{step}</span>
                </li>
              ))}
            </ol>
          )}
          {recipe.notes && (
            <p className="mt-5 rounded-2xl bg-ground/70 p-4 text-body text-ink-soft">
              {recipe.notes}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function MealCardPanel({
  mealId,
  mealName,
  onClose,
}: {
  mealId: string;
  /** The name from the plan row, shown as the header until the card loads. */
  mealName: string;
  onClose: () => void;
}) {
  const [card, setCard] = useState<MealCard | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "gone">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/meals/${encodeURIComponent(mealId)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`card ${res.status}`);
        const data = (await res.json()) as MealCardPayload;
        if (cancelled) return;
        if (!data.card) {
          setState("gone");
          return;
        }
        setCard(data.card);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mealId]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  const title = card?.mealName ?? mealName;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/25 p-10"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-full w-[68rem] max-w-full flex-col rounded-3xl bg-surface shadow-[0_20px_60px_-20px_rgba(43,38,32,0.45)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-4 p-8 pb-5">
          <div className="flex min-w-0 items-start gap-3">
            <Utensils
              className="mt-2 size-8 shrink-0 text-ink-soft"
              strokeWidth={1.75}
              aria-hidden
            />
            <h2 className="min-w-0 font-display text-display leading-tight text-ink">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-12 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ground-2"
          >
            <X className="size-8" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
          {state === "loading" ? (
            <p className="py-10 text-center text-body text-ink-faint">Opening the card…</p>
          ) : state === "gone" ? (
            <p className="py-10 text-center text-body text-ink-faint">
              This meal isn’t on the plan anymore.
            </p>
          ) : state === "error" ? (
            <p className="py-10 text-center text-body text-ink-faint">
              Couldn’t load this meal. It’ll retry on the next refresh.
            </p>
          ) : card ? (
            <div className="flex flex-col gap-6">
              {card.recipes.map((recipe, i) => (
                <RecipeBlock key={recipe.id} recipe={recipe} isFirst={i === 0} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Kept tiny so the plan tile and the panel agree on how a meal's supporting
// facts read.
export function MealMeta({
  totalTime,
  sideDishCount,
}: {
  totalTime: number | null;
  sideDishCount: number;
}) {
  return (
    <div className="flex items-center gap-4 text-label text-ink-faint">
      {totalTime != null && (
        <span className="flex items-center gap-2">
          <Clock className="size-5" strokeWidth={2} aria-hidden />
          {totalTime} min
        </span>
      )}
      {sideDishCount > 0 && (
        <span className="flex items-center gap-2">
          <Salad className="size-5" strokeWidth={2} aria-hidden />
          {sideDishCount} {sideDishCount === 1 ? "side" : "sides"}
        </span>
      )}
    </div>
  );
}
