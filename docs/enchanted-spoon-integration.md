# Enchanted Spoon integration (Hearth Phase 4 — Meals)

Hearth's **Meals** view reads the household's current meal plan and, on tap, a
meal's card (ingredients + recipe) from **Enchanted Spoon** — the same data its
Meal Planner renders. It is **read-only** (spec D6, §5.4): the wall reads the
plan and the card, but never assigns, swaps, or edits meals; planning stays on
the phone.

Unlike the Tada! integration (still awaiting upstream endpoints — see
[`tada-integration-requirements.md`](./tada-integration-requirements.md)), this
one is **built and live-wired on both sides**: Enchanted Spoon already had an
`X-API-Key` integration-auth path for trusted first-party app-to-app calls (the
Tada shopping-list ingest uses it), and Phase 4 adds a read-only meals router on
that same path.

---

## The contract Hearth calls

All routes are under **`${ENCHANTED_SPOON_API_URL}/api/hearth`**, authenticated
with **`X-API-Key: <ENCHANTED_SPOON_DEVICE_TOKEN>`**. The secret resolves every
request to one household account (Enchanted Spoon's `INTEGRATION_USER_ID`), so no
per-user token is involved. Shapes below are exactly what
[`src/lib/spoon/client.ts`](../src/lib/spoon/client.ts) sends and expects; the
mock ([`src/lib/spoon/mock.ts`](../src/lib/spoon/mock.ts)) serves the same shapes
offline (`HEARTH_MEALS_MOCK=1`).

### `GET /meals`
The current meal plan — the planner's entries in order. Enchanted Spoon's planner
is a positional queue (max 15) rather than a strict Mon–Sun grid, so entries come
in `position` order and carry a `scheduled_date` only where the household
scheduled them (Hearth shows a day label only then; otherwise the row reads
"Queued").

```jsonc
// 200
{ "meals": [
  { "entry_id": 1, "meal_id": 55, "meal_name": "Taco Night", "position": 0,
    "scheduled_date": "2026-08-18", "is_completed": false,
    "main_recipe_name": "Beef Tacos", "side_dish_count": 1,
    "total_time": 25, "image_url": null }
] }
```

### `GET /meals/{meal_id}`
One meal's card: the meal plus every recipe it's composed of (main dish first,
then sides in order), each with ingredients and step-by-step directions. `steps`
is the recipe's directions split into lines so the wall renders an ordered list
without parsing prose. `404` when the meal isn't on the account — Hearth treats
that as "left the plan since the last poll," not an error.

```jsonc
// 200
{ "meal_id": 55, "meal_name": "Taco Night", "recipes": [
  { "id": 9, "name": "Beef Tacos", "role": "main",
    "description": "…", "servings": 4, "prep_time": 10, "cook_time": 15,
    "total_time": 25, "difficulty": "Easy",
    "ingredients": [ { "name": "Ground beef", "quantity": 1, "unit": "lb",
                       "category": "Meat" } ],
    "steps": [ "Brown the beef…", "Warm the shells…" ],
    "notes": null, "image_url": null } ,
  { "id": 12, "name": "Mexican Rice", "role": "side", "…": "…" }
] }
```

---

## What was added on the Enchanted Spoon side

A read-only router registered under `/api/hearth`, authenticated by the existing
shared-secret dependency. No new data access — it projects what the planner,
meal, and recipe services already return.

- **`app/api/hearth.py`** — `GET /meals` and `GET /meals/{meal_id}`, both behind
  `get_integration_user` (X-API-Key), scoped to `INTEGRATION_USER_ID`, rate-limited.
- **`app/dtos/hearth_dtos.py`** — the stable contract DTOs above, plus pure
  mappers from the internal planner/meal/recipe DTOs. Decoupled from internal
  shapes on purpose, so refactors there don't silently break the wall.
- Registered in **`app/router.py`** under the `hearth`/`integration` tags.
- Tests: **`tests/test_hearth_meals.py`** (mappers + the read pipeline).

The token is scoped to these two reads only — no meal-plan write, no settings, no
Clerk-user data. Read-only matches spec D6.

---

## Operator setup

1. On **Enchanted Spoon**, set `INTEGRATION_API_KEY` (a generated secret) and
   `INTEGRATION_USER_ID` (the household account whose plan the wall shows). If the
   Tada shopping ingest is already wired, these exist — the meals reads and that
   write share the same integration account.
2. On **Hearth** (Railway), set `ENCHANTED_SPOON_API_URL` to Enchanted Spoon's
   base URL and `ENCHANTED_SPOON_DEVICE_TOKEN` to the **same value** as Enchanted
   Spoon's `INTEGRATION_API_KEY`.
3. Do **not** set `HEARTH_MEALS_MOCK` in any real environment (dev-only; hard-
   blocked in production builds). Until Hearth is pointed at the API, the Meals
   view degrades to a calm "not connected" state, never an error (§6.2).
4. Confirm on the wall: Meals shows the week's plan; tapping a meal opens its card
   with ingredients and recipe. (Both are verified against the mock and against
   the real endpoint over HTTP.)
