import type { CardRecipe, MealCard, PlannedMeal } from "./types";

// Synthetic Enchanted Spoon data for LOCAL development only (Phase 4, Meals).
// The plan grid and the tap-to-open card are impossible to exercise without meal
// data, and pointing local dev at the real Enchanted Spoon account isn't always
// wanted. This serves a deterministic week of meals and their cards so the whole
// read flow — plan → card, ingredients, steps — can be driven offline.
//
// Read-only, so unlike the Tada! mock this holds no mutable state: there is
// nothing to complete or undo (spec D6). It resets nothing because it changes
// nothing.
//
// SAFETY: enabled only when HEARTH_MEALS_MOCK=1 AND NODE_ENV !== production, so
// synthetic meals can never reach the real wall.

export function isMealsMockEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.HEARTH_MEALS_MOCK === "1"
  );
}

// A fixed clock read at module load; scheduled dates anchor to the current week
// so the plan shows real day labels in dev. The exact day doesn't matter — only
// that the dates land in "this week".
const MODULE_NOW = new Date();

/** YYYY-MM-DD for `daysFromToday` days out, in local time. */
function isoDate(daysFromToday: number): string {
  const d = new Date(MODULE_NOW);
  d.setDate(d.getDate() + daysFromToday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface MockMeal {
  mealId: string;
  name: string;
  scheduledOffset: number | null; // days from today, or null = unscheduled
  recipes: CardRecipe[];
}

function recipe(
  id: string,
  name: string,
  role: "main" | "side",
  detail: Partial<CardRecipe> & {
    ingredients: CardRecipe["ingredients"];
    steps: string[];
  },
): CardRecipe {
  return {
    id,
    name,
    role,
    description: detail.description ?? null,
    servings: detail.servings ?? null,
    prepTime: detail.prepTime ?? null,
    cookTime: detail.cookTime ?? null,
    totalTime: detail.totalTime ?? null,
    difficulty: detail.difficulty ?? null,
    ingredients: detail.ingredients,
    steps: detail.steps,
    notes: detail.notes ?? null,
    imageUrl: detail.imageUrl ?? null,
  };
}

const MEALS: MockMeal[] = [
  {
    mealId: "m-1",
    name: "Spaghetti Bolognese",
    scheduledOffset: 0,
    recipes: [
      recipe("r-1", "Spaghetti Bolognese", "main", {
        description: "A weeknight ragù that tastes like it simmered all day.",
        servings: 4,
        prepTime: 15,
        cookTime: 40,
        totalTime: 55,
        difficulty: "Easy",
        ingredients: [
          { name: "Spaghetti", quantity: 1, unit: "lb", category: "Pasta" },
          { name: "Ground beef", quantity: 1, unit: "lb", category: "Meat" },
          { name: "Yellow onion", quantity: 1, unit: null, category: "Produce" },
          { name: "Garlic", quantity: 3, unit: "cloves", category: "Produce" },
          { name: "Crushed tomatoes", quantity: 28, unit: "oz", category: "Canned" },
          { name: "Olive oil", quantity: 2, unit: "tbsp", category: "Pantry" },
          { name: "Parmesan", quantity: null, unit: null, category: "Dairy" },
        ],
        steps: [
          "Bring a large pot of salted water to a boil.",
          "Sweat the onion and garlic in olive oil until soft, about 5 minutes.",
          "Add the beef and brown, breaking it up as it cooks.",
          "Stir in the crushed tomatoes and simmer 25 minutes.",
          "Cook the spaghetti to al dente and toss with the sauce.",
          "Finish with grated Parmesan.",
        ],
      }),
      recipe("r-2", "Garlic Bread", "side", {
        servings: 4,
        prepTime: 5,
        cookTime: 10,
        totalTime: 15,
        difficulty: "Easy",
        ingredients: [
          { name: "Baguette", quantity: 1, unit: null, category: "Bakery" },
          { name: "Butter", quantity: 4, unit: "tbsp", category: "Dairy" },
          { name: "Garlic", quantity: 2, unit: "cloves", category: "Produce" },
          { name: "Parsley", quantity: null, unit: null, category: "Produce" },
        ],
        steps: [
          "Heat the oven to 400°F.",
          "Mash the butter with minced garlic and chopped parsley.",
          "Split the baguette, spread the butter, and bake 10 minutes.",
        ],
      }),
    ],
  },
  {
    mealId: "m-2",
    name: "Taco Tuesday",
    scheduledOffset: 1,
    recipes: [
      recipe("r-3", "Beef Tacos", "main", {
        description: "Crisp shells, seasoned beef, all the toppings.",
        servings: 4,
        prepTime: 10,
        cookTime: 15,
        totalTime: 25,
        difficulty: "Easy",
        ingredients: [
          { name: "Ground beef", quantity: 1, unit: "lb", category: "Meat" },
          { name: "Taco shells", quantity: 8, unit: null, category: "Pantry" },
          { name: "Cheddar cheese", quantity: 1, unit: "cup", category: "Dairy" },
          { name: "Lettuce", quantity: null, unit: null, category: "Produce" },
          { name: "Tomato", quantity: 1, unit: null, category: "Produce" },
          { name: "Taco seasoning", quantity: 1, unit: "packet", category: "Pantry" },
        ],
        steps: [
          "Brown the beef, then stir in the seasoning and a splash of water.",
          "Simmer until thickened, about 5 minutes.",
          "Warm the shells and set out the toppings.",
          "Build tacos to taste.",
        ],
      }),
      recipe("r-4", "Mexican Rice", "side", {
        servings: 4,
        prepTime: 5,
        cookTime: 20,
        totalTime: 25,
        difficulty: "Medium",
        ingredients: [
          { name: "Long-grain rice", quantity: 1, unit: "cup", category: "Pantry" },
          { name: "Tomato sauce", quantity: 0.5, unit: "cup", category: "Canned" },
          { name: "Chicken broth", quantity: 2, unit: "cups", category: "Canned" },
          { name: "Cumin", quantity: 1, unit: "tsp", category: "Spices" },
        ],
        steps: [
          "Toast the rice in oil until golden.",
          "Add the tomato sauce, broth, and cumin.",
          "Cover and simmer 20 minutes, then fluff.",
        ],
      }),
    ],
  },
  {
    mealId: "m-3",
    name: "Sheet-Pan Salmon",
    scheduledOffset: 2,
    recipes: [
      recipe("r-5", "Sheet-Pan Salmon & Vegetables", "main", {
        description: "One pan, fifteen minutes of hands-on, dinner done.",
        servings: 4,
        prepTime: 10,
        cookTime: 20,
        totalTime: 30,
        difficulty: "Easy",
        ingredients: [
          { name: "Salmon fillets", quantity: 4, unit: null, category: "Seafood" },
          { name: "Broccoli", quantity: 1, unit: "head", category: "Produce" },
          { name: "Baby potatoes", quantity: 1, unit: "lb", category: "Produce" },
          { name: "Lemon", quantity: 1, unit: null, category: "Produce" },
          { name: "Olive oil", quantity: 2, unit: "tbsp", category: "Pantry" },
        ],
        steps: [
          "Heat the oven to 425°F.",
          "Roast the potatoes 15 minutes.",
          "Add the salmon and broccoli, drizzle with oil, and roast 12 more minutes.",
          "Finish with a squeeze of lemon.",
        ],
      }),
    ],
  },
  {
    mealId: "m-4",
    name: "Chicken Stir-Fry",
    scheduledOffset: 3,
    recipes: [
      recipe("r-6", "Chicken Stir-Fry", "main", {
        description: "Fast, colorful, and endlessly adaptable.",
        servings: 4,
        prepTime: 15,
        cookTime: 12,
        totalTime: 27,
        difficulty: "Medium",
        ingredients: [
          { name: "Chicken breast", quantity: 1, unit: "lb", category: "Meat" },
          { name: "Bell peppers", quantity: 2, unit: null, category: "Produce" },
          { name: "Snap peas", quantity: 2, unit: "cups", category: "Produce" },
          { name: "Soy sauce", quantity: 3, unit: "tbsp", category: "Pantry" },
          { name: "Ginger", quantity: 1, unit: "tbsp", category: "Produce" },
        ],
        steps: [
          "Slice the chicken thin and sear in a hot wok.",
          "Add the vegetables and stir-fry until crisp-tender.",
          "Pour in the soy sauce and ginger, toss, and serve over rice.",
        ],
      }),
      recipe("r-7", "Jasmine Rice", "side", {
        servings: 4,
        prepTime: 2,
        cookTime: 15,
        totalTime: 17,
        difficulty: "Easy",
        ingredients: [
          { name: "Jasmine rice", quantity: 1.5, unit: "cups", category: "Pantry" },
          { name: "Water", quantity: 2.25, unit: "cups", category: null },
        ],
        steps: [
          "Rinse the rice until the water runs clear.",
          "Simmer covered 15 minutes, then rest 5 and fluff.",
        ],
      }),
    ],
  },
  {
    mealId: "m-5",
    name: "Homemade Pizza Night",
    scheduledOffset: 4,
    recipes: [
      recipe("r-8", "Margherita Pizza", "main", {
        description: "Blistered crust, fresh mozzarella, torn basil.",
        servings: 4,
        prepTime: 20,
        cookTime: 12,
        totalTime: 32,
        difficulty: "Medium",
        ingredients: [
          { name: "Pizza dough", quantity: 1, unit: "lb", category: "Bakery" },
          { name: "Fresh mozzarella", quantity: 8, unit: "oz", category: "Dairy" },
          { name: "Tomato sauce", quantity: 0.75, unit: "cup", category: "Canned" },
          { name: "Fresh basil", quantity: null, unit: null, category: "Produce" },
        ],
        steps: [
          "Heat the oven as hot as it goes with a stone or steel inside.",
          "Stretch the dough and top with sauce and torn mozzarella.",
          "Bake until the crust is blistered, then scatter basil.",
        ],
      }),
    ],
  },
  {
    // An unscheduled queue entry — demonstrates the null-day render path.
    mealId: "m-6",
    name: "Sunday Roast",
    scheduledOffset: null,
    recipes: [
      recipe("r-9", "Roast Chicken", "main", {
        description: "A whole bird, crisp-skinned and simple.",
        servings: 6,
        prepTime: 15,
        cookTime: 80,
        totalTime: 95,
        difficulty: "Medium",
        ingredients: [
          { name: "Whole chicken", quantity: 1, unit: null, category: "Meat" },
          { name: "Butter", quantity: 3, unit: "tbsp", category: "Dairy" },
          { name: "Lemon", quantity: 1, unit: null, category: "Produce" },
          { name: "Thyme", quantity: null, unit: null, category: "Produce" },
        ],
        steps: [
          "Heat the oven to 425°F.",
          "Rub the bird with butter, salt, and pepper; stuff with lemon and thyme.",
          "Roast about 80 minutes, until the juices run clear.",
          "Rest 15 minutes before carving.",
        ],
      }),
      recipe("r-10", "Mashed Potatoes", "side", {
        servings: 6,
        prepTime: 10,
        cookTime: 20,
        totalTime: 30,
        difficulty: "Easy",
        ingredients: [
          { name: "Russet potatoes", quantity: 3, unit: "lb", category: "Produce" },
          { name: "Butter", quantity: 6, unit: "tbsp", category: "Dairy" },
          { name: "Milk", quantity: 0.5, unit: "cup", category: "Dairy" },
        ],
        steps: [
          "Boil the potatoes until fork-tender.",
          "Mash with warm butter and milk; season well.",
        ],
      }),
      recipe("r-11", "Roasted Carrots", "side", {
        servings: 6,
        prepTime: 5,
        cookTime: 25,
        totalTime: 30,
        difficulty: "Easy",
        ingredients: [
          { name: "Carrots", quantity: 2, unit: "lb", category: "Produce" },
          { name: "Honey", quantity: 1, unit: "tbsp", category: "Pantry" },
          { name: "Olive oil", quantity: 2, unit: "tbsp", category: "Pantry" },
        ],
        steps: [
          "Toss the carrots with oil and honey.",
          "Roast at 425°F for 25 minutes, turning once.",
        ],
      }),
    ],
  },
];

export function mockMealPlan(): PlannedMeal[] {
  return MEALS.map((meal, i) => {
    const main = meal.recipes.find((r) => r.role === "main") ?? null;
    return {
      entryId: `e-${i + 1}`,
      mealId: meal.mealId,
      name: meal.name,
      position: i,
      scheduledDate:
        meal.scheduledOffset === null ? null : isoDate(meal.scheduledOffset),
      isCompleted: false,
      mainRecipeName: main?.name ?? null,
      sideDishCount: meal.recipes.filter((r) => r.role === "side").length,
      totalTime: main?.totalTime ?? null,
      imageUrl: null,
    };
  });
}

export function mockMealCard(mealId: string): MealCard | null {
  const meal = MEALS.find((m) => m.mealId === mealId);
  if (!meal) return null;
  return { mealId: meal.mealId, mealName: meal.name, recipes: meal.recipes };
}
