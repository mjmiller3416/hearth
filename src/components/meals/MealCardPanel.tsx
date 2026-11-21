"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
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
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState, Loading } from "@/components/ui/Tile";
import { Sheet, SheetBody, SheetFooter } from "@/components/ui/Sheet";
import { FoodGlyph, mealTone, type MealTone } from "./mealVisuals";

// The meal card (spec §4.5): opens when a meal is tapped, anywhere it appears.
// Every recipe the meal is made of (main dish first, then sides), each with its
// ingredients and step-by-step directions: the same card Enchanted Spoon shows
// in its planner. Read-only (D6) but for "Mark as cooked"; planning stays in
// Enchanted Spoon.

/** "1 lb", "3 cloves"; plain numbers (JS already drops a trailing .0). */
function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity == null) return unit ?? "";
  return unit ? `${quantity} ${unit}` : String(quantity);
}

// Ingredients are grouped by aisle, the way a shopping list reads. Known
// categories sort in a sensible kitchen order; anything else falls to the end.
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

function SectionHeader({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <h4 className="mb-3 flex items-center gap-2.5 text-small font-semibold uppercase tracking-[0.08em] text-fg-soft">
      <Icon className="size-5 text-fg-faint" strokeWidth={2} aria-hidden />
      {label}
    </h4>
  );
}

/** The prep / cook / total / servings / difficulty row. */
function Stats({ recipe }: { recipe: CardRecipe }) {
  const stats: Array<{ icon: LucideIcon; label: string; value: string }> = [];
  if (recipe.prepTime != null) stats.push({ icon: Timer, label: "Prep", value: `${recipe.prepTime} min` });
  if (recipe.cookTime != null) stats.push({ icon: Flame, label: "Cook", value: `${recipe.cookTime} min` });
  if (recipe.totalTime != null) stats.push({ icon: Clock, label: "Total", value: `${recipe.totalTime} min` });
  if (recipe.servings != null) stats.push({ icon: Users, label: "Serves", value: String(recipe.servings) });
  if (recipe.difficulty) stats.push({ icon: Gauge, label: "Level", value: recipe.difficulty });
  if (stats.length === 0) return null;
  return (
    <dl className="mb-5 flex flex-wrap gap-2">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-2 rounded-full bg-fill px-3.5 py-2">
          <s.icon className="size-4 text-fg-faint" strokeWidth={2} aria-hidden />
          <dt className="text-tiny text-fg-faint">{s.label}</dt>
          <dd className="text-small font-semibold text-fg">{s.value}</dd>
        </div>
      ))}
    </dl>
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
    <section className={isFirst ? "" : "border-t border-line pt-7"}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="font-display text-big font-medium leading-tight text-fg">{recipe.name}</h3>
        {recipe.role === "side" && (
          <span className="rounded-full bg-fill px-3 py-1 text-tiny font-semibold uppercase tracking-wide text-fg-soft">
            Side
          </span>
        )}
      </div>

      <Stats recipe={recipe} />

      {recipe.description && (
        <p className="mb-5 text-body leading-relaxed text-fg-soft">{recipe.description}</p>
      )}

      <div className="grid gap-8 wide:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
        <div>
          <SectionHeader icon={BookOpen} label="Ingredients" />
          {recipe.ingredients.length === 0 ? (
            <p className="text-body text-fg-faint">No ingredients listed.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <div key={group.category}>
                  <p className="mb-1.5 text-tiny font-semibold uppercase tracking-[0.1em] text-fg-faint">
                    {group.category}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {group.items.map((ing, i) => {
                      const measure = formatQuantity(ing.quantity, ing.unit).trim();
                      return (
                        <li key={`${ing.name}-${i}`} className="flex items-baseline gap-2.5 text-body text-fg">
                          <span
                            className="relative top-[-0.15em] size-1.5 shrink-0 rounded-full"
                            style={{ background: tone.ink }}
                            aria-hidden
                          />
                          <span className="min-w-0">
                            {measure && <span className="font-semibold">{measure} </span>}
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
          <SectionHeader icon={Utensils} label="Directions" />
          {recipe.steps.length === 0 ? (
            <p className="text-body text-fg-faint">No directions listed.</p>
          ) : (
            <ol className="flex flex-col gap-3.5">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-3.5 text-body leading-relaxed text-fg">
                  <span
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-display text-small leading-none text-on-accent"
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
            <p className="mt-5 rounded-2xl bg-fill p-4 text-body text-fg-soft">
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
  onCooked,
}: {
  mealId: string;
  /** The name from the plan row, shown as the header until the card loads. */
  mealName: string;
  onClose: () => void;
  /** Mark this meal cooked and dismiss. Omit to hide the action. */
  onCooked?: () => void;
}) {
  const [card, setCard] = useState<MealCard | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "gone">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/meals/${encodeURIComponent(mealId)}`, { cache: "no-store" });
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
  }, [mealId, attempt]);

  const title = card?.mealName ?? mealName;
  const tone = mealTone(card?.mealId ?? mealId);
  const heroImage =
    card?.recipes.find((r) => r.role === "main")?.imageUrl ?? card?.recipes[0]?.imageUrl ?? null;

  return (
    <Sheet label={title} onClose={onClose} size="xl">
      {/* Hero: a photo when Enchanted Spoon has one, else the meal's tone. */}
      <div className="relative h-36 w-full shrink-0 wide:h-44">
        {heroImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImage} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <h2 className="absolute inset-x-0 bottom-0 px-5 pb-4 font-display text-big font-medium leading-tight text-white wide:px-7">
              {title}
            </h2>
          </>
        ) : (
          <div
            className="relative h-full w-full overflow-hidden"
            style={{ backgroundColor: tone.bg, backgroundImage: tone.gradient }}
          >
            <FoodGlyph
              name={title}
              className="pointer-events-none absolute -bottom-8 -right-4 size-48 text-white opacity-25"
              strokeWidth={1.25}
            />
            <h2 className="absolute inset-x-0 bottom-0 px-5 pb-4 pr-16 font-display text-big font-medium leading-tight text-white wide:px-7">
              {title}
            </h2>
          </div>
        )}
        <IconButton
          label="Close"
          onClick={onClose}
          variant="secondary"
          className="absolute right-3 top-3 !bg-white !text-night shadow-float"
        >
          <X className="size-6" strokeWidth={2} aria-hidden />
        </IconButton>
      </div>

      <SheetBody>
        {state === "loading" ? (
          <Loading rows={5} />
        ) : state === "gone" ? (
          <EmptyState icon={Salad} title="This meal isn't on the plan anymore" />
        ) : state === "error" ? (
          <EmptyState
            icon={Salad}
            title="Couldn't open this recipe"
            action={<Button onClick={() => { setState("loading"); setAttempt((n) => n + 1); }}>Try again</Button>}
          >
            Enchanted Spoon didn&rsquo;t answer.
          </EmptyState>
        ) : card ? (
          <div className="flex flex-col gap-7">
            {card.recipes.map((recipe, i) => (
              <RecipeBlock key={recipe.id} recipe={recipe} isFirst={i === 0} tone={tone} />
            ))}
          </div>
        ) : null}
      </SheetBody>

      {onCooked && (
        <SheetFooter>
          <span className="hidden flex-1 text-tiny text-fg-faint wide:block">
            Cooked meals leave the plan. Bring one back in Enchanted Spoon.
          </span>
          <Button variant="primary" className="flex-1 wide:flex-none" onClick={onCooked}>
            <Check className="size-5" strokeWidth={2.75} aria-hidden />
            Mark as cooked
          </Button>
        </SheetFooter>
      )}
    </Sheet>
  );
}

/** A meal's supporting facts (time, sides), the same wherever a meal shows. */
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-fg-soft">
      {items.map(({ icon: Icon, text }) => (
        <span key={text} className="flex items-center gap-1.5">
          <Icon className="size-4" strokeWidth={2.25} aria-hidden />
          {text}
        </span>
      ))}
    </div>
  );
}
