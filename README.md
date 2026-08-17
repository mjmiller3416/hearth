# Hearth

A wall-mounted, always-on household surface. It surfaces the family calendar,
Tada!'s cleaning and lists, and Enchanted Spoon's meal plan and shopping list —
for a screen viewed six to ten feet away and a hand reaching up to it.

Hearth is a **client**, not a store — a second frontend, co-equal with the
phone, that the family can run Tada! and Enchanted Spoon from without picking up
a device. It has no database. Tada! and Enchanted Spoon own the real data and
logic (decay ranking, reward state, meal plans, shopping-list math); Hearth
reads and writes their APIs and renders them, computing nothing itself. See
[`docs/app-spec.md`](docs/app-spec.md) for the full spec and locked decisions,
and [`docs/plans/prompts.md`](docs/plans/prompts.md) for the phased build.

**Status:** Phase 2 — Clean & Chores. The shell (routing, the stale-data
contract, kiosk hardening, deploy scaffolding) is in place and hardened; device
authorization lives in the route and page logic, not middleware (see
[Security](#security)); Next is on 16.3.0. The **Calendar** view renders the
family's Google calendars and can create, edit, and delete non-recurring events
from the wall, on a per-member-calendar model (see
[Calendar](#calendar-phase-1)). Phase 2 adds **Clean** (Maryann's guided
cleaning session) and **Chores** (the kids' checklist), both driven by Tada! (see
[Clean & Chores](#clean--chores-phase-2)) — this is where Hearth stops being
read-only and begins **writing** task completions; it also adds a **Settings**
view for customizing the family colors, whose choice is Hearth's one piece of
persisted state (spec D12). The remaining views — Lists, Meals, and Shopping —
still render placeholders and land phase by phase. (The plan was reworked: Tasks
split into **Clean** + **Chores**, and Recipes was replaced by **Shopping** — see
the spec.)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · deployed on
Railway from a Dockerfile (`standalone` output). Matches the existing
recipe-app frontend conventions.

## Local development

```bash
npm install
cp .env.example .env.local   # then set HEARTH_DEVICE_TOKEN
npm run dev                  # http://localhost:3000
```

Generate a device token:

```bash
openssl rand -hex 32
# or: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Because the whole app is behind the device gate, authorize your browser once:

```
http://localhost:3000/setup?token=<HEARTH_DEVICE_TOKEN>
```

That sets a long-lived httpOnly cookie and redirects to `/calendar`. There is
no login and no timeout (spec §6.3).

## Security

Authorization lives in [`src/lib/auth.ts`](src/lib/auth.ts), **not** in
middleware. There is deliberately no `middleware.ts` / `proxy.ts`: App Router
middleware can be bypassed by crafted `.rsc` and segment-prefetch URLs that
resolve to the same route without matching the middleware rule
(CVE-2026-44575 / CVE-2026-45109), so nothing is allowed to depend on it as a
security boundary. Every protected surface verifies for itself:

- **Pages** are gated by the `app/(protected)/layout.tsx` server component,
  which calls `isAuthorizedDevice()` and redirects to `/setup` when it fails.
  Because the check runs during RSC render, it also covers the `.rsc` and
  segment-prefetch variants of every protected route.
- **Route handlers** must call `requireDevice()` as their **first statement**,
  before reading the request body, and return the `401` it hands back:

  ```ts
  export async function GET() {
    const denied = await requireDevice();
    if (denied) return denied;
    // ...authorized work
  }
  ```

- Token comparison is constant-time (`crypto.timingSafeEqual`, length-guarded).
- The device cookie is `httpOnly`, `secure` (in production), `sameSite=lax`,
  and not readable from client JavaScript.

As of Phase 1.5 the device token also gates a **write** path: `POST` (create),
`PUT` (edit), and `DELETE` on `/api/calendar/events`. Every handler calls
`requireDevice()` first, before parsing the body. A create **derives its target
calendars from member config** — the client names people to assign, never a
calendar, so it cannot write to an arbitrary calendar the household account
happens to have access to. Editing or deleting a phone-made event accepts a
`{calendarId, eventId}` only after **allowlisting it against the calendars Hearth
reads** and rejecting any synthetic wall id; recurring events are refused
server-side (corrections happen on a phone, spec D2).

Phase 2 adds a second write path — task completion. `POST /api/tasks/complete`
and `POST /api/tasks/undo` write to Tada! **as** a household member (Maryann in
the Clean session, a kid in Chores). The member is *attribution, not
authentication*: the device token carries the authority, and the acting member
only says whom to credit (spec §6.3). Both handlers call `requireDevice()` first,
then — before any write — **validate the acting member against an allowlist**
(the kids and Maryann, from `TADA_MEMBERS`); a request naming anyone else is
rejected `403`. Completions are stamped `source="hearth"`. This is a broader
grant than the old kid-only write and is acceptable only because the wall is a
trusted in-home device — it would **not** be acceptable on a public or portable
one (spec §5.3). The write list is closed at completion + undo for this phase;
anything more is a spec amendment (D11).

The only unauthenticated surfaces are `/setup` (the pairing route, in the
`app/(public)/` group) and `/health` (a literal `200`). **Any new page or route
handler must add its own check** — do not reintroduce a middleware gate and
assume it protects anything.

## Configuration

Hearth has no database — environment variables are the entire configuration
surface. See [`.env.example`](.env.example). Nothing is a `NEXT_PUBLIC_*`
value; every secret is read server-side only, in route handlers and server
components, and never reaches the browser bundle.

| Variable | Phase | Purpose |
|---|---|---|
| `HEARTH_DEVICE_TOKEN` | 0 | Long-lived device token for the `/setup` gate. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` | 1 · 1.5 | Google Calendar access. Phase 1.5 needs the `calendar.events` (read-write) scope; grant the household account "Make changes to events" on writable calendars. |
| `MEMBERS` | 1.5 | JSON array of `{ key, name, color, calendarId }` — the canonical, ordered people; each owns a Google calendar (their assigned-event write target). |
| `FAMILY_CALENDAR_ID` | 1.5 | Shared family calendar id. Whole-family events are written here as one event; phone-made events here also show on the wall. (Replaces the old `CALENDAR_MAP`.) |
| `HOUSEHOLD_TIMEZONE` | 1.5 | IANA name (e.g. `America/New_York`) — required for event creation. |
| `HEARTH_CALENDAR_MOCK` | 1 · 1.5 | Local dev only — serves synthetic calendar events (incl. the create/edit/delete reconcile). Ignored in production. |
| `HEARTH_DATA_DIR` | 2 | Absolute path (a Railway volume, e.g. `/data`) for the shared colors file (spec D12). Unset → in-process memory that resets on redeploy. |
| `TADA_API_URL` / `TADA_DEVICE_TOKEN` | 2 · 4 | Tada! base URL + device token. Reads (Clean session, rooms, completions, chores; supplies roster in Phase 4) + scoped writes: completions in Phase 2, supply flag-low in Phase 4. |
| `TADA_MEMBERS` | 2 | JSON array of `{ memberKey, tadaUserId, role }` — the people the wall may complete tasks as (the acting-member allowlist). `memberKey` links to `MEMBERS` for name + color; `role` is `adult` or `kid`. |
| `HEARTH_ADULT_ID` | 2 | Maryann's Tada! user id — whose session the Clean view is, and whose completions done-today shows. |
| `HEARTH_TASKS_MOCK` | 2 | Local dev only — serves deterministic synthetic Tada! data so Clean & Chores work without the real API. Ignored in production. |
| `ENCHANTED_SPOON_API_URL` / `ENCHANTED_SPOON_DEVICE_TOKEN` | 4 | Enchanted Spoon — Meals read-only, Shopping read-write. |

## Calendar (Phase 1)

The Calendar view reads the family Google calendars and renders a month grid
(week view is a secondary toggle). Google Calendar is the system of record; as of
Phase 1.5 Hearth is a **read + write** client — it can **create, edit, and
delete** events (including ones made on a phone), with one carve-out: **recurring
events are read-only on the wall** and refuse edits with "Edit repeating events on
your phone" (spec D2, amended).

The model is **per-member calendars**: each person owns a Google calendar, and
**assignment decides where an event lives** — there is no "which calendar"
picker. A whole-family event is one event on the shared family calendar; an event
assigned to a subset of people fans out one copy per assignee's own calendar
(linked by a `hearthGroupId`), and the wall de-dupes those copies back into one
banded chip (spec D3).

Event color comes from the assigned members, falling back to the owning
calendar's member for untagged events. One member fills the chip solid; two or
three render as hard-edged color bands; four or more collapse to a single
"everyone" treatment; an untagged family-calendar event reads "everyone" too.
Member colors are customizable in Settings (spec D12). Hearth's own metadata
(`hearthGroupId`, `hearthMembers`, a countdown flag, `hearthOwner`) rides along in
the event's `extendedProperties.private`, invisible in Google's own UI. The chip
row across the top filters the grid to one member. Tapping an empty day (or the
floating **+**) opens the Add / Edit Event panel: assign who it concerns (which
decides the calendars), set repeat / reminder / countdown, and it's written
straight to Google. Tapping an existing non-recurring event reopens the same panel
to edit or delete it.

Configuration is two variables: `MEMBERS` (the ordered people, each with their own
`calendarId`) and `FAMILY_CALENDAR_ID` (the shared calendar). There is no longer a
`CALENDAR_MAP`. See [`.env.example`](.env.example).

The whole view is authored on a fixed **1920×1080** canvas and scaled to fit the
window it runs in (spec §6.1 — one drawn resolution, fitted, never reflowed), so
it is pixel-crisp on the wall and never clipped in a smaller dev window.

**One-time manual setup** (per [`docs/plans/prompts.md`](docs/plans/prompts.md)
Phase 1, done by an operator — it needs real Google credentials):

1. Create a dedicated household Google account.
2. From each family member's account, share their calendar — and the shared
   family calendar — into the household account with **write** access ("Make
   changes to events"), since the wall now creates, edits, and deletes.
3. In Google Cloud Console: create a project, enable the Calendar API, create
   OAuth credentials, and run the consent flow **once** as the household account
   with the `calendar.events` (read-write) scope to capture a refresh token.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
   `MEMBERS`, and `FAMILY_CALENDAR_ID` (see [`.env.example`](.env.example)) as
   Railway service variables.

Until those are set the view degrades calmly to an empty grid — no error, no
crash (spec §6.2).

**How it reads:** `GET /api/calendar?start=&end=` fetches events across every
member calendar plus the family calendar via Google's `events.list`. Recurring
events are expanded
server-side (`singleEvents=true`); polls are incremental using a `syncToken`
held in process memory (a `410 Gone` discards the token and re-syncs). The
client polls every 60 seconds through the shared stale-data hook and returns to
the current month, unfiltered, after five idle minutes. The refresh token is
read only in the route handler and never reaches the browser.

**Local UI without Google:** set `HEARTH_CALENDAR_MOCK=1` in `.env.local` to
serve deterministic synthetic events, so the grid, filters, day panel, and week
view can be exercised offline. It is ignored in production builds even if set,
so it can never reach the wall.

## Clean & Chores (Phase 2)

Two sidebar destinations built from one Tada! integration, with deliberately
different philosophies (spec §4.2–4.3, D4/D5):

- **Clean** is Maryann's guided cleaning session. A room picker scopes it; below,
  Tada! surfaces the single highest-decay task **one at a time** — large and
  alone, with a big complete target. Completing it cross-fades in the next task.
  There is **no queue, no backlog, no remaining count, no "up next"** — that
  restraint is the whole point (D4): the focus session is the *anti-list*, and
  showing the quantity of undone work would rebuild the paralysis Tada! exists to
  prevent. Beside it, **done-today** celebrates completions as they land, with
  **no total, denominator, or progress bar**. When nothing is due, it rests on a
  calm "all caught up," never a reproach.
- **Chores** is the kids' checklist — one column per kid in their member color,
  each chore a row with a large tap target. The asymmetry with Clean is
  intentional: kids have a tracking problem, not a paralysis one, so their
  surface *is* a list they can check off. No streaks, badges, or stars — Tada!
  owns reward state and this screen neither renders nor summarizes it.

Both surfaces **write**. Completing a task posts to Tada! attributed to the
acting member (Maryann for Clean, the column's kid for Chores) with
`source="hearth"`; a mis-tap can be undone from the just-completed row within the
day (Q5). Hearth never computes decay or ranks anything — Tada! picks the task,
Hearth renders the result and writes the completion. Nothing in either view
exposes a decay score, dirtiness ratio, priority number, streak, or badge.

**Local UI without Tada!:** set `HEARTH_TASKS_MOCK=1` in `.env.local` to serve
deterministic synthetic tasks, rooms, and chores — the session advances, done-
today fills, and undo reverses, all in dev-server memory. Ignored in production.

**Upstream setup:** the real integration needs device-scoped Tada! endpoints
(and a completion `source` of `hearth`) that the current Tada! backend does not
yet expose — a static device token, an acting-member override, a single
next-task-by-room read, and a per-kid chores read. Those are specified precisely
in [`docs/tada-integration-requirements.md`](docs/tada-integration-requirements.md).
Until they land, `/clean` and `/chores` degrade calmly to a "not connected"
state (spec §6.2), and local development runs on `HEARTH_TASKS_MOCK=1`.

## Target device

Layout is built for a **1920×1080 landscape** panel viewed from six to ten
feet. The type scale lives in `src/app/globals.css` under `@theme` — tune those
tokens against the real hardware (do not scatter sizes through components). The
**member colors** are defined there as defaults (as CSS `--color-<slug>` tokens),
driven by the `MEMBERS` config and customizable at runtime in Settings (spec
D3/D12).

## Deploy (Railway)

One service in the existing Railway project, pointed at this repo,
single-branch auto-deploy. Docker builder (`railway.json` → `Dockerfile`),
health check at `/health`. Set the environment variables above as service
variables. No database; the only optional infrastructure is a persistent volume
mounted at `HEARTH_DATA_DIR`, which holds only the shared colors file (spec D12).

## Kiosk / hardware (Phase 5)

Hardware comes last and only if the two-week trial earns it. **Never wipe or
flash the Skylight** — no public firmware images exist and a failed flash is an
unrecoverable brick. The launcher is *disabled*, not removed. Reversal
commands, tested at least once, will live here when Phase 5 runs:

```bash
adb shell pm enable com.skylight
adb shell pm enable skylight.watchdog
adb shell cmd package set-home-activity com.skylight/.MainActivity
```
