# Enchanted Spoon integration (Hearth Phase 4 — Meals)

Hearth's **Meals** view reads the household's current meal plan and, on tap, a
meal's card (ingredients + recipe) from **Enchanted Spoon** — the same data its
Meal Planner renders. It is **read-only but for one gesture** (spec D6, §5.4):
the wall reads the plan and the card, and can **mark a meal cooked** so it drops
off the wall — but never assigns, swaps, or edits meals, and never *un*-completes
one (restoring a mistaken completion stays in Enchanted Spoon). Planning stays on
the phone.

> **Status — the "mark cooked" write is a target contract, not yet live.** The
> two reads below are built and live on both sides. The `POST /meals/complete`
> write below is implemented on the **Hearth** side (route, client, mock, view)
> and works end-to-end in mock mode, but Enchanted Spoon's `/api/hearth` router
> does not expose it yet and its integration token is scoped to the two reads
> only. Until Enchanted Spoon adds the endpoint and widens that token's scope,
> tapping "Mark cooked" on the live wall optimistically drops the meal, then —
> when the write 502s — lets it reappear with a quiet inline note (spec §6.2).
> Mirrors how the Tada! integration was staged
> ([`tada-integration-requirements.md`](./tada-integration-requirements.md)).

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

### `POST /meals/complete` — _the one write (target contract, not yet live)_
Mark one **plan entry** cooked (set its `is_completed`), so the wall drops it.
The id is the `entry_id` from `GET /meals`, **not** the `meal_id` — the same dish
can sit in the queue more than once, and completion is a property of the entry.
Idempotent: completing an already-cooked entry is a no-op success. No un-complete
here — restoring a mistaken completion stays in the Enchanted Spoon app.

```jsonc
// request
{ "entry_id": 1 }

// 204  (no body)
```

Enchanted Spoon must: register this route on the `/api/hearth` router behind the
same `get_integration_user` (X-API-Key) dependency, scoped to `INTEGRATION_USER_ID`;
set the planner entry's completion flag through the existing service; and **widen
the integration token's scope** to permit this one write (it is read-only today).
Return `204` on success (and on a re-complete), `404` if the entry isn't on the
account. Hearth normalizes any non-2xx to a quiet retry — see
[`completeMeal`](../src/lib/spoon/client.ts).

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
Clerk-user data. **The `POST /meals/complete` write above is the one addition
still pending on this side**: a completion route on the same router plus a narrow
scope widening to permit exactly that write. Everything else stays read-only per
spec D6.

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
