import { fail, noContent, ok, type ActionResult } from "@/lib/action";
import { hasSpoonCredentials } from "@/lib/spoon/config";
import {
  addShoppingItem,
  completeMeal,
  getMealCard,
  getMealPlan,
  getShoppingList,
} from "@/lib/spoon/client";
import {
  isMealsMockEnabled,
  mockAddShoppingItem,
  mockCompleteMeal,
  mockMealCard,
  mockMealPlan,
  mockShoppingList,
} from "@/lib/spoon/mock";
import {
  SHOPPING_NAME_MAX,
  type AddShoppingItemBody,
  type AddShoppingItemResult,
  type CompleteMealBody,
  type MealCardPayload,
  type MealPlanPayload,
  type ShoppingListPayload,
} from "@/lib/spoon/types";

// Enchanted Spoon's actions (Meals and Shopping): read the plan and a meal's
// card, mark a plan entry cooked, read the shopping list, add an item. Shared by
// the wall's /api/meals* and /api/shopping* route handlers and the MCP tools
// (src/lib/action.ts). The meal plan itself stays read-only (spec D6).
//
// SECURITY: callers authenticate first. The list is shared and unowned and a
// plan entry belongs to the household account, so there is no acting member to
// validate (spec §6.3).

/** The current meal plan, in the planner's order. */
export async function mealPlan(): Promise<ActionResult> {
  const mock = isMealsMockEnabled();
  const configured = mock || hasSpoonCredentials();
  try {
    const meals = mock ? mockMealPlan() : configured ? await getMealPlan() : [];
    return ok({ meals, configured } satisfies MealPlanPayload);
  } catch (err) {
    console.error("[spoon] meals upstream error:", err);
    return fail("upstream unavailable", 502);
  }
}

/** One meal's card (main dish and sides, ingredients and steps), or null if gone. */
export async function mealCard(mealId: string): Promise<ActionResult> {
  const mock = isMealsMockEnabled();
  if (!mock && !hasSpoonCredentials()) return ok({ card: null } satisfies MealCardPayload);
  try {
    const card = mock ? mockMealCard(mealId) : await getMealCard(mealId);
    return ok({ card } satisfies MealCardPayload);
  } catch (err) {
    console.error("[spoon] meal card upstream error:", err);
    return fail("upstream unavailable", 502);
  }
}

/** Mark one plan entry cooked. No undo here: restoring it lives in Enchanted Spoon. */
export async function markCooked(input: unknown): Promise<ActionResult> {
  const body = (input && typeof input === "object" ? input : {}) as Partial<CompleteMealBody>;
  const { entryId } = body;
  if (typeof entryId !== "string" || !entryId) return fail("entryId is required");

  const mock = isMealsMockEnabled();
  if (!mock && !hasSpoonCredentials()) return fail("meals are not configured", 503);

  try {
    if (mock) mockCompleteMeal(entryId);
    else await completeMeal(entryId);
    return noContent();
  } catch (err) {
    console.error("[spoon] complete upstream error:", err);
    return fail("upstream unavailable", 502);
  }
}

/** The whole shopping list, needed and checked off. */
export async function shoppingList(): Promise<ActionResult> {
  const mock = isMealsMockEnabled();
  const configured = mock || hasSpoonCredentials();
  try {
    const items = mock ? mockShoppingList() : configured ? await getShoppingList() : [];
    return ok({ items, configured } satisfies ShoppingListPayload);
  } catch (err) {
    console.error("[spoon] shopping upstream error:", err);
    return fail("upstream unavailable", 502);
  }
}

/** Add one item by name; Enchanted Spoon files it, skips a duplicate, or reactivates it. */
export async function addItem(input: unknown): Promise<ActionResult> {
  const body = (input && typeof input === "object" ? input : {}) as Partial<AddShoppingItemBody>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return fail("name is required");
  if (name.length > SHOPPING_NAME_MAX) return fail("name is too long");

  const mock = isMealsMockEnabled();
  if (!mock && !hasSpoonCredentials()) return fail("shopping is not configured", 503);

  try {
    const result = mock ? mockAddShoppingItem(name) : await addShoppingItem(name);
    return ok(result satisfies AddShoppingItemResult);
  } catch (err) {
    console.error("[spoon] add item upstream error:", err);
    return fail("upstream unavailable", 502);
  }
}
