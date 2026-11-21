"use client";

import { useCallback, useState } from "react";
import { CookingPot, ShoppingBasket, UtensilsCrossed } from "lucide-react";
import { useTimeZone } from "@/components/common/TimeZone";
import { MealCardPanel } from "@/components/meals/MealCardPanel";
import { MealTile } from "@/components/meals/MealTile";
import { AddItemBar, ShoppingItems } from "@/components/shopping/ShoppingPanel";
import { Segmented } from "@/components/ui/Button";
import { AsOf, EmptyState, SourceGate, Tile } from "@/components/ui/Tile";
import { Page } from "@/components/ui/Page";
import { useMealPlan, useShoppingList } from "@/hooks/useHub";
import { useIdleReset } from "@/hooks/useIdleReset";
import { zonedNow } from "@/lib/calendar/dates";
import type { PlannedMeal } from "@/lib/spoon/types";

// Kitchen: the meal plan and the shopping list together, because in the kitchen
// they are one job (what's for dinner, do we have what it needs). Both come
// from Enchanted Spoon, which still owns the plan and all the list's logic
// (spec D6): the plan is read-only here but for "Cooked", and the list takes
// additions.
//
// On a wide screen the two sit side by side. A phone shows one at a time.

type Tab = "meals" | "shopping";

export function KitchenView({ initialTab }: { initialTab: Tab }) {
  const timeZone = useTimeZone();
  const plan = useMealPlan();
  const list = useShoppingList();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [open, setOpen] = useState<PlannedMeal | null>(null);
  const today = zonedNow(timeZone);

  const clearPlanError = plan.clearError;
  const clearNotice = list.clearNotice;
  useIdleReset(
    useCallback(() => {
      setOpen(null);
      clearPlanError();
      clearNotice();
    }, [clearPlanError, clearNotice]),
  );

  const meals = (
    <Tile
      tone="glass"
      title="Dinner plan"
      icon={UtensilsCrossed}
      className="wide:h-full wide:flex-[3]"
      bodyClassName="flex flex-col wide:overflow-y-auto"
      stamp={<AsOf isStale={plan.state.isStale} lastUpdated={plan.state.lastUpdated} />}
    >
      <SourceGate
        state={plan.state}
        configured={plan.configured}
        app="Enchanted Spoon"
        what="The week's dinners"
        rows={4}
      >
        {plan.all.length === 0 ? (
          <EmptyState icon={CookingPot} title="No meals planned yet">
            Meals you plan in Enchanted Spoon show up here.
          </EmptyState>
        ) : plan.meals.length === 0 ? (
          <EmptyState icon={CookingPot} title="All cooked">
            Plan the next meals in Enchanted Spoon and they&rsquo;ll appear here.
          </EmptyState>
        ) : (
          <div
            className="grid gap-3 wide:gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 16rem), 1fr))" }}
          >
            {plan.meals.map((meal) => (
              <MealTile
                key={meal.entryId}
                meal={meal}
                today={today}
                onOpen={() => setOpen(meal)}
                onCook={() => plan.cook(meal)}
              />
            ))}
          </div>
        )}
        {plan.error && (
          <p className="pt-3 text-small text-bad" role="status">
            {plan.error}
          </p>
        )}
      </SourceGate>
    </Tile>
  );

  const shopping = (
    <Tile
      tone="paper"
      title="Shopping list"
      icon={ShoppingBasket}
      className="wide:h-full wide:flex-[2]"
      bodyClassName="flex flex-col gap-4"
      stamp={<AsOf isStale={list.state.isStale} lastUpdated={list.state.lastUpdated} />}
    >
      <SourceGate
        state={list.state}
        configured={list.configured}
        app="Enchanted Spoon"
        what="The shopping list"
        rows={5}
      >
        <AddItemBar list={list} />
        <div className="min-h-0 flex-1 wide:overflow-y-auto">
          <ShoppingItems list={list} />
        </div>
      </SourceGate>
    </Tile>
  );

  return (
    <Page
      title="Kitchen"
      controls={
        <Segmented
          className="wide:hidden"
          label="Kitchen section"
          value={tab}
          onChange={setTab}
          options={[
            { value: "meals", label: "Meals" },
            { value: "shopping", label: "Shopping" },
          ]}
        />
      }
    >
      <div className="flex flex-col gap-5 wide:h-full wide:flex-row">
        <div className={`min-h-0 wide:flex wide:flex-[3] ${tab === "meals" ? "" : "hidden"}`}>
          {meals}
        </div>
        <div className={`min-h-0 wide:flex wide:flex-[2] ${tab === "shopping" ? "" : "hidden"}`}>
          {shopping}
        </div>
      </div>

      {open && (
        <MealCardPanel
          mealId={open.mealId}
          mealName={open.name}
          onClose={() => setOpen(null)}
          onCooked={() => {
            const meal = open;
            setOpen(null);
            plan.cook(meal);
          }}
        />
      )}
    </Page>
  );
}
