import type { CardRecipe, Ingredient, MealCard, PlannedMeal } from "./types";

// The Enchanted Spoon HTTP client (Phase 4, Meals — read-only). Server-side
// only: the device token is read here and sent as the `X-API-Key` header, and
// never reaches the browser (spec §3.2). Mirrors the Tada! client's shape — thin
// HTTP + normalization, errors thrown for the route to turn into a 502 so the
// stale-data contract keeps the last good render (spec §6.2).
//
// All routes are under `${ENCHANTED_SPOON_API_URL}/api/hearth`, the integration
// router scoped by shared secret to the household account (§5.4). The wire shapes
// (snake_case) are Enchanted Spoon's HearthMealPlanDTO / HearthMealCardDTO;
// they're normalized to Hearth's camelCase types here, ids coerced to strings.

function baseUrl(): string {
  const url = process.env.ENCHANTED_SPOON_API_URL?.replace(/\/+$/, "");
  if (!url) throw new Error("ENCHANTED_SPOON_API_URL is not set");
  return `${url}/api/hearth`;
}

function authHeaders(): HeadersInit {
  const token = process.env.ENCHANTED_SPOON_DEVICE_TOKEN;
  if (!token) throw new Error("ENCHANTED_SPOON_DEVICE_TOKEN is not set");
  // Enchanted Spoon's integration auth checks the X-API-Key header.
  return { "x-api-key": token };
}

// ── Wire shapes (Enchanted Spoon → Hearth) ──────────────────────────────────
interface RawPlannedMeal {
  entry_id: number | string;
  meal_id: number | string;
  meal_name: string;
  position: number;
  scheduled_date: string | null;
  is_completed: boolean;
  main_recipe_name: string | null;
  side_dish_count: number;
  total_time: number | null;
  image_url: string | null;
}

interface RawIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
}

interface RawRecipe {
  id: number | string;
  name: string;
  role: string;
  description: string | null;
  servings: number | null;
  prep_time: number | null;
  cook_time: number | null;
  total_time: number | null;
  difficulty: string | null;
  ingredients: RawIngredient[];
  steps: string[];
  notes: string | null;
  image_url: string | null;
}

interface RawMealCard {
  meal_id: number | string;
  meal_name: string;
  recipes: RawRecipe[];
}

function normalizePlannedMeal(m: RawPlannedMeal): PlannedMeal {
  return {
    entryId: String(m.entry_id),
    mealId: String(m.meal_id),
    name: m.meal_name,
    position: m.position ?? 0,
    scheduledDate: m.scheduled_date ?? null,
    isCompleted: Boolean(m.is_completed),
    mainRecipeName: m.main_recipe_name ?? null,
    sideDishCount: m.side_dish_count ?? 0,
    totalTime: m.total_time ?? null,
    imageUrl: m.image_url ?? null,
  };
}

function normalizeIngredient(i: RawIngredient): Ingredient {
  return {
    name: i.name,
    quantity: i.quantity ?? null,
    unit: i.unit ?? null,
    category: i.category ?? null,
  };
}

function normalizeRecipe(r: RawRecipe): CardRecipe {
  return {
    id: String(r.id),
    name: r.name,
    role: r.role === "side" ? "side" : "main",
    description: r.description ?? null,
    servings: r.servings ?? null,
    prepTime: r.prep_time ?? null,
    cookTime: r.cook_time ?? null,
    totalTime: r.total_time ?? null,
    difficulty: r.difficulty ?? null,
    ingredients: (r.ingredients ?? []).map(normalizeIngredient),
    steps: r.steps ?? [],
    notes: r.notes ?? null,
    imageUrl: r.image_url ?? null,
  };
}

/** GET /meals → the current plan (planner entries in order). */
export async function getMealPlan(): Promise<PlannedMeal[]> {
  const res = await fetch(`${baseUrl()}/meals`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Enchanted Spoon GET /meals failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { meals?: RawPlannedMeal[] };
  return (data.meals ?? []).map(normalizePlannedMeal);
}

/**
 * GET /meals/<id> → one meal's card (main + sides, each with ingredients and
 * steps). Returns null on 404 — a meal removed from the plan since the last poll
 * is a normal race, not an error.
 */
export async function getMealCard(mealId: string): Promise<MealCard | null> {
  const res = await fetch(`${baseUrl()}/meals/${encodeURIComponent(mealId)}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Enchanted Spoon GET /meals/${mealId} failed (${res.status}): ${detail}`,
    );
  }
  const data = (await res.json()) as RawMealCard;
  return {
    mealId: String(data.meal_id),
    mealName: data.meal_name,
    recipes: (data.recipes ?? []).map(normalizeRecipe),
  };
}
