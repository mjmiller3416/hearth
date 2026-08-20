"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Clock,
  Flame,
  Gauge,
  type LucideIcon,
  Salad,
  Timer,
  Users,
  Utensils,
  X,
} from "lucide-react";
import type { CardRecipe, Ingredient, MealCard, MealCardPayload } from "@/lib/spoon/types";
import { FoodGlyph, mealTone, type MealTone } from "./mealVisuals";

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

// Ingredients are grouped by aisle on the card, the way a shopping list reads.
// Known categories sort in a sensible kitchen order; anything else falls to the
// end alphabetically, and missing categories collect under "Other".
const CATEGORY_ORDER = [
  "Produce",
  "Meat",
  "Seafood",
  "Dairy",
  "Bakery",
  "Bread",
  "Pasta",
  "Canned",
  "Frozen",
  "Pantry",
  "Spices",
  "Other",
];

function groupIngredients(ingredients: Ingredient[]): Array<{ category: string; items: Ingredient[] }> {
  const byCategory = new Map<string, Ingredient[]>();
  for (const ing of ingredients) {
    const category = ing.category?.trim() || "Other";
    const bucket = byCategory.get(category);
    if (bucket) bucket.push(ing);
    else byCategory.set(category, [ing]);
  }
  const known = CATEGORY_ORDER.filter((c) => byCategory.has(c));
  const extra = [...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [...known, ...extra].map((category) => ({ category, items: byCategory.get(category)! }));
}

/** A section title with a soft tinted icon badge (Ingredients teal, Directions
 *  purple — echoing Enchanted Spoon's own card). */
function SectionHeader({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: "teal" | "accent";
}) {
  const badge = tone === "teal" ? "bg-teal-soft text-teal-strong" : "bg-accent-soft text-accent";
  return (
    <h4 className="mb-4 flex items-center gap-3">
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${badge}`}>
        <Icon className="size-6" strokeWidth={2} aria-hidden />
      </span>
      <span className="text-title font-display leading-none text-ink">{label}</span>
    </h4>
  );
}

/** The prep / cook / total / servings / difficulty row, as small chips. */
function StatChips({ recipe }: { recipe: CardRecipe }) {
  const stats: Array<{ icon: LucideIcon; label: string; value: string }> = [];
  if (recipe.prepTime != null) stats.push({ icon: Timer, label: "Prep", value: `${recipe.prepTime}m` });
  if (recipe.cookTime != null) stats.push({ icon: Flame, label: "Cook", value: `${recipe.cookTime}m` });
  if (recipe.totalTime != null) stats.push({ icon: Clock, label: "Total", value: `${recipe.totalTime}m` });
  if (recipe.servings != null) stats.push({ icon: Users, label: "Serves", value: String(recipe.servings) });
  if (recipe.difficulty) stats.push({ icon: Gauge, label: "Level", value: recipe.difficulty });
  if (stats.length === 0) return null;
  return (
    <div className="mb-6 flex flex-wrap gap-3">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-3 rounded-2xl bg-ground px-4 py-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <s.icon className="size-5" strokeWidth={2} aria-hidden />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-stamp text-ink-faint">{s.label}</span>
            <span className="text-label font-medium text-ink">{s.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function RecipeBlock({
  recipe,
  isFirst,
  tone,
}: {
  recipe: CardRecipe;
  isFirst: boolean;
  tone: MealTone;
}) {
  const groups = groupIngredients(recipe.ingredients);
  return (
    <section className={isFirst ? "" : "border-t border-hairline pt-8"}>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="font-display text-title leading-tight text-ink">{recipe.name}</h3>
        {recipe.role === "side" && (
          <span className="rounded-full bg-teal-soft px-4 py-1 text-label font-medium leading-none text-teal-strong">
            Side
          </span>
        )}
      </div>

      <StatChips recipe={recipe} />

      {recipe.description && (
        <p className="mb-6 text-body leading-relaxed text-ink-soft">{recipe.description}</p>
      )}

      <div className="grid grid-cols-[minmax(0,24rem)_minmax(0,1fr)] gap-10 max-[70rem]:grid-cols-1">
        <div>
          <SectionHeader icon={BookOpen} label="Ingredients" tone="teal" />
          {recipe.ingredients.length === 0 ? (
            <p className="text-body text-ink-faint">No ingredients listed.</p>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((group) => (
                <div key={group.category}>
                  <p className="mb-2 text-stamp font-medium uppercase tracking-wide text-ink-faint">
                    {group.category}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {group.items.map((ing, i) => {
                      const measure = formatQuantity(ing.quantity, ing.unit).trim();
                      return (
                        <li
                          key={`${ing.name}-${i}`}
                          className="flex items-baseline gap-3 text-body text-ink"
                        >
                          <span
                            className="mt-3 size-2 shrink-0 rounded-full"
                            style={{ background: tone.ink }}
                            aria-hidden
                          />
                          <span className="min-w-0">
                            {measure && <span className="font-medium">{measure} </span>}
                            {ing.name}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionHeader icon={Utensils} label="Directions" tone="accent" />
          {recipe.steps.length === 0 ? (
            <p className="text-body text-ink-faint">No directions listed.</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-4 text-body leading-relaxed text-ink">
                  <span
                    className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-label leading-none text-accent"
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
            <p className="mt-6 rounded-2xl bg-accent-soft/50 p-5 text-body text-ink-soft">
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
  const tone = mealTone(card?.mealId ?? mealId);
  // The hero uses the main dish's photo when there is one; otherwise a tone
  // banner. (imageUrl is null on every recipe today — see mealVisuals.)
  const heroImage =
    card?.recipes.find((r) => r.role === "main")?.imageUrl ?? card?.recipes[0]?.imageUrl ?? null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-10"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-full w-[72rem] max-w-full flex-col overflow-hidden rounded-3xl bg-surface shadow-[0_24px_70px_-24px_rgba(43,38,32,0.5)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Hero banner — a photo when Enchanted Spoon has one, else a colored
            tone banner with a large watermark glyph and dark, legible title. */}
        <div className="relative h-52 w-full shrink-0">
          {heroImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroImage} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/15 to-transparent" />
              <h2 className="absolute inset-x-0 bottom-0 px-8 pb-6 font-display text-display leading-tight text-white">
                {title}
              </h2>
            </>
          ) : (
            <div className="relative h-full w-full overflow-hidden" style={{ background: tone.gradient }}>
              <FoodGlyph
                name={title}
                className="pointer-events-none absolute -right-6 -bottom-10 size-64"
                strokeWidth={1.25}
                style={{ color: tone.ink, opacity: 0.18 }}
              />
              <h2
                className="absolute inset-x-0 bottom-0 px-8 pb-6 font-display text-display leading-tight"
                style={{ color: tone.ink }}
              >
                {title}
              </h2>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-6 top-6 flex size-12 shrink-0 items-center justify-center rounded-full bg-surface/90 text-ink-soft shadow-sm backdrop-blur-sm transition-colors hover:bg-surface"
          >
            <X className="size-7" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
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
            <div className="flex flex-col gap-8">
              {card.recipes.map((recipe, i) => (
                <RecipeBlock key={recipe.id} recipe={recipe} isFirst={i === 0} tone={tone} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Kept tiny so the plan tile and the panel agree on how a meal's supporting
// facts read. Each fact gets a soft accent icon chip (a Tada touch).
export function MealMeta({
  totalTime,
  sideDishCount,
}: {
  totalTime: number | null;
  sideDishCount: number;
}) {
  const items: Array<{ icon: LucideIcon; text: string }> = [];
  if (totalTime != null) items.push({ icon: Clock, text: `${totalTime} min` });
  if (sideDishCount > 0) {
    items.push({ icon: Salad, text: `${sideDishCount} ${sideDishCount === 1 ? "side" : "sides"}` });
  }
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-label text-ink-soft">
      {items.map(({ icon: Icon, text }) => (
        <span key={text} className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Icon className="size-5" strokeWidth={2} aria-hidden />
          </span>
          {text}
        </span>
      ))}
    </div>
  );
}
