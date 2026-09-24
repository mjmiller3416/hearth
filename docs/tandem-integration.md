# Tandem integration (Schedule)

Hearth's **Schedule** view shows Lincoln's and Ollie's Monday–Friday school
days and activities from **Tandem**, side by side in their Hearth member colors.
It is **read-only**. Adding, editing, and copying last week forward stay in
Tandem on the phone, the same split as Meals (spec D6).

> **Status: built on both sides.** Tandem exposes `GET /api/hearth/week` behind
> a shared-secret key. Hearth's route, client, mock, and view call it.

---

## How Hearth reaches Tandem

Tandem runs in its own Railway project (`tandem`: `frontend`, `backend`,
`Postgres`). Its backend has **no public URL**: the browser, and now Hearth, only
talk to the frontend, whose `/api/*` proxy forwards to the backend over
Railway's private network. So:

- `TANDEM_API_URL` is Tandem's **frontend** origin (production:
  `https://frontend-production-e343.up.railway.app`).
- Hearth sends `X-API-Key: <TANDEM_API_KEY>`. The proxy passes headers through,
  and the backend compares the key to its `HEARTH_API_KEY` in constant time.
- There is no user session. The key can read the schedule and nothing else.

## The contract Hearth calls

### `GET ${TANDEM_API_URL}/api/hearth/week?week=YYYY-MM-DD`

`week` is any date in the week. Hearth sends the wall's local date, so "this
week" follows the household's calendar and not the server's. Activities come in
day, then start-time order.

```jsonc
// 200
{ "week_start": "2026-09-21",
  "activities": [
    { "id": 12, "child": "link", "name": "Math live class", "day": "2026-09-21",
      "start_time": "10:15:00", "end_time": "10:45:00", "important": false }
  ] }
// 401 — missing or wrong key · 503 — HEARTH_API_KEY not set on Tandem
```

`child` is `"link"` or `"ollie"`. Hearth maps these to the `lincoln` and `ollie`
entries in `MEMBERS` for each lane's name and color
([`src/lib/tandem/config.ts`](../src/lib/tandem/config.ts)). The client
([`src/lib/tandem/client.ts`](../src/lib/tandem/client.ts)) trims times to
`HH:MM` and turns ids into strings. The mock
([`src/lib/tandem/mock.ts`](../src/lib/tandem/mock.ts),
`HEARTH_SCHEDULE_MOCK=1`) serves the same shape offline.

On the Tandem side: `backend/app/api/routes/hearth.py`, the
`require_integration_key` dependency in `backend/app/api/deps.py`,
`HearthWeekOut` in `backend/app/schemas/activity.py`, and tests in
`backend/tests/test_hearth.py`.

## The view

- One column per weekday, each split into a lane per kid. Blocks are placed by
  start and end time, and overlapping blocks sit side by side (the same layout
  as Tandem).
- Regular blocks use a soft member tint. **Important** blocks use a solid member
  fill with a star.
- The hour axis fits the hours this week actually uses (never under six hours)
  instead of Tandem's full 8 AM – 10 PM, which keeps blocks legible from across
  the room.
- The view rests on this week, or next week on Saturday and Sunday. Prev, Today,
  and Next page through weeks, and idle reset returns to the resting week. A wall
  left on the view rolls over to the new week on its own.
- Polls every 60s on the stale-data contract. Not configured shows a calm "not
  connected" state.

## Operator setup

1. On **Tandem**, set `HEARTH_API_KEY` in the repo-root `.env` and push it:
   `backend/.venv/Scripts/python scripts/railway_env.py --environment production --only HEARTH_API_KEY`
   (and `staging`).
2. On **Hearth** (Railway service `hearth`), set `TANDEM_API_URL` to Tandem's
   production frontend origin and `TANDEM_API_KEY` to the **same value** as
   Tandem's `HEARTH_API_KEY`.
3. Do **not** set `HEARTH_SCHEDULE_MOCK` in any real environment.
4. Confirm on the wall: Schedule shows this week, with both kids' lanes in their
   colors.
