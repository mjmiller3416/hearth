// Shared Enchanted Spoon types for Phase 4 (Meals and Shopping). Free of any
// server-only import so both the route handlers and the client views can import
// them.
//
// Meals is read-only but for "mark cooked" (spec D6, §4.5, §5.4): the wall reads
// the current plan and, on tap, a meal's card — ingredients and recipe. It never
// assigns, swaps, or edits meals; that stays on the phone. The meal shapes
// therefore carry no planner mutation, nothing but what the card renders.
// Shopping shapes are at the bottom of this file.

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

// ── Write contract (client → server) ────────────────────────────────────────

/**
 * POST /api/meals/complete. Marks one plan entry cooked in Enchanted Spoon (its
 * `is_completed`), so the wall can drop it — the "quick access" gesture the
 * kitchen wants. This is the ONE write Meals gains over its otherwise read-only
 * contract (spec D6): no assign, swap, or edit still holds; restoring an
 * accidental completion stays in Enchanted Spoon, so there is deliberately no
 * undo here.
 *
 * `entryId` is the plan ENTRY, not the meal — the same dish can sit in the queue
 * more than once, and completion is a property of the entry (`RawPlannedMeal`).
 */
export interface CompleteMealBody {
  entryId: string;
}

// ── Shopping list ───────────────────────────────────────────────────────────
//
// Enchanted Spoon's shopping list on the wall (spec §4.6, D6). Enchanted Spoon
// owns the list and all its logic (dedupe, categories, recipe aggregation);
// Hearth reads it and, for now, makes ONE write: add an item by name. Checking
// off, editing, and removing stay on the phone until a later pass.

/**
 * One shopping-list row. `category` is Enchanted Spoon's lowercase slug
 * ("produce", "dairy", "oils-and-vinegars"…), or null; the wall groups by it the
 * way the app does, with uncategorized rows under "other". `have` is true once
 * the item is checked off. `source` is "recipe", "manual", or an app slug like
 * "tada".
 */
export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  have: boolean;
  source: string;
}

/**
 * GET /api/shopping. The whole list. `configured` is false when Enchanted Spoon
 * isn't wired yet, so the view renders a calm "not connected" state (§6.2).
 */
export interface ShoppingListPayload {
  items: ShoppingItem[];
  configured: boolean;
}

/** POST /api/shopping/items. One item, typed on the wall. */
export interface AddShoppingItemBody {
  name: string;
}

/**
 * What an add did, as Enchanted Spoon reports it. `added`: a new row.
 * `reactivated`: a checked-off row with that name went back to "need".
 * `already_listed`: it was already needed; nothing changed. `name` is the name
 * as it reads on the list (the existing spelling on a match).
 */
export interface AddShoppingItemResult {
  status: "added" | "reactivated" | "already_listed";
  name: string;
}

/** Longest name Enchanted Spoon accepts for a shopping item. */
export const SHOPPING_NAME_MAX = 255;
