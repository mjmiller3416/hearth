// Shared Enchanted Spoon types for Phase 4 (Meals, read-only). Free of any
// server-only import so both the route handlers and the client view can import
// them.
//
// Meals is read-only (spec D6, §4.5, §5.4): the wall reads the current plan and,
// on tap, a meal's card — ingredients and recipe. It never assigns, swaps, or
// edits meals; that stays on the phone. These shapes therefore carry no write
// affordance, no planner position mutation, nothing but what the card renders.

/**
 * One meal in the plan, as a glanceable row (spec §4.5). Enchanted Spoon's
 * planner is a positional queue rather than a strict Mon–Sun grid, so `position`
 * is the render order and `scheduledDate` is the day label shown only when the
 * household actually scheduled the entry (otherwise null — an unscheduled queue
 * entry). `mealId` opens the card.
 */
export interface PlannedMeal {
  entryId: string;
  mealId: string;
  name: string;
  position: number;
  /** ISO date (YYYY-MM-DD), or null for an unscheduled queue entry. */
  scheduledDate: string | null;
  isCompleted: boolean;
  mainRecipeName: string | null;
  sideDishCount: number;
  /** Main dish total time in minutes, or null. */
  totalTime: number | null;
  imageUrl: string | null;
}

/** One ingredient line on a card. Quantity/unit may be absent. */
export interface Ingredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
}

/**
 * One recipe within a meal card — the main dish or a side. `steps` is the
 * recipe's directions already split into lines by Enchanted Spoon, so the wall
 * renders an ordered list without parsing prose.
 */
export interface CardRecipe {
  id: string;
  name: string;
  role: "main" | "side";
  description: string | null;
  servings: number | null;
  prepTime: number | null;
  cookTime: number | null;
  totalTime: number | null;
  difficulty: string | null;
  ingredients: Ingredient[];
  steps: string[];
  notes: string | null;
  imageUrl: string | null;
}

/** A meal's full card: its name and every recipe it's composed of (main first). */
export interface MealCard {
  mealId: string;
  mealName: string;
  recipes: CardRecipe[];
}

// ── Route payloads (server → client) ────────────────────────────────────────

/**
 * GET /api/meals. The current plan. `configured` is false when Enchanted Spoon
 * isn't wired yet, so the view renders a calm "not connected" state rather than
 * an error (spec §6.2), exactly like the Tada! surfaces.
 */
export interface MealPlanPayload {
  meals: PlannedMeal[];
  configured: boolean;
}

/** GET /api/meals/<id>. One meal's card, or null when the meal is gone. */
export interface MealCardPayload {
  card: MealCard | null;
}
