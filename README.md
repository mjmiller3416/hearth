# Hearth

A wall-mounted, always-on household display. It surfaces the family calendar,
Tada!'s tasks and lists, and MealGenie's meal plan and recipes — read-mostly,
for a screen viewed six to ten feet away.

Hearth is a **view layer**. It has no database. MealGenie and Tada! own the
real data and logic; Hearth reads three APIs and renders them. See
[`docs/app-spec.md`](docs/app-spec.md) for the full spec and locked decisions,
and [`docs/plans/prompts.md`](docs/plans/prompts.md) for the phased build.

**Status:** Phase 1 — Calendar. The shell (routing, the stale-data contract,
kiosk hardening, deploy scaffolding) is in place and hardened; device
authorization lives in the route and page logic, not middleware (see
[Security](#security)); Next is on 16.3.0. The **Calendar** view now renders the
family's Google calendars (see [Calendar](#calendar-phase-1)); Tasks, Lists,
Meals, and Recipes still render placeholders and land phase by phase.

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
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` / `CALENDAR_MAP` | 1 | Google Calendar read access. |
| `TADA_API_URL` / `TADA_DEVICE_TOKEN` / `HEARTH_ADULT_ID` | 2 | Tada! reads + the one scoped write. |
| `MEALGENIE_API_URL` / `MEALGENIE_DEVICE_TOKEN` | 4 | MealGenie read-only. |

## Calendar (Phase 1)

The Calendar view reads the four family Google calendars and renders a month
grid (week view is a secondary toggle). Google Calendar is the system of record
— Hearth is **read only** (spec D2). Each event is filled in its owning
calendar's member color (spec D3); the chip row across the top filters the grid
to one member.

**One-time manual setup** (per [`docs/plans/prompts.md`](docs/plans/prompts.md)
Phase 1, done by an operator — it needs real Google credentials):

1. Create a dedicated household Google account.
2. From each family member's account, share their calendar into the household
   account with read access.
3. In Google Cloud Console: create a project, enable the Calendar API, create
   OAuth credentials, and run the consent flow **once** as the household account
   to capture a refresh token.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, and
   `CALENDAR_MAP` (see [`.env.example`](.env.example)) as Railway service
   variables.

Until those are set the view degrades calmly to an empty grid — no error, no
crash (spec §6.2).

**How it reads:** `GET /api/calendar?start=&end=` fetches events across the
mapped calendars via Google's `events.list`. Recurring events are expanded
server-side (`singleEvents=true`); polls are incremental using a `syncToken`
held in process memory (a `410 Gone` discards the token and re-syncs). The
client polls every 60 seconds through the shared stale-data hook and returns to
the current month, unfiltered, after five idle minutes. The refresh token is
read only in the route handler and never reaches the browser.

**Local UI without Google:** set `HEARTH_CALENDAR_MOCK=1` in `.env.local` to
serve deterministic synthetic events, so the grid, filters, day panel, and week
view can be exercised offline. It is ignored in production builds even if set,
so it can never reach the wall.

## Target device

Layout is built for a **1920×1080 landscape** panel viewed from six to ten
feet. The type scale lives in `src/app/globals.css` under `@theme` — tune those
tokens against the real hardware (do not scatter sizes through components). The
four **member colors** are defined once there and mirrored in
`src/lib/config.ts`; Mitchell is locked to green (spec D3).

## Deploy (Railway)

One service in the existing Railway project, pointed at this repo,
single-branch auto-deploy. Docker builder (`railway.json` → `Dockerfile`),
health check at `/health`. Set the environment variables above as service
variables — no volume, no database.

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
