@AGENTS.md

# Hearth

The family hub: the wall display in the living room and everyone's phone, from
one address. A client, not a store: it reads and writes Google Calendar, Tada!,
Tandem and Enchanted Spoon through its own route handlers. The only things it
stores itself are the family colors and the parent-entered allowance amounts
(two small files, see Storage). README.md is the operator guide;
`docs/app-spec.md` holds the decisions (D1–D13) and phase status;
`docs/enchanted-spoon-integration.md` and `docs/tada-integration-requirements.md`
are the upstream contracts.

## Commands (Windows Node; WSL has none)

Run from PowerShell, or from WSL as
`powershell.exe -NoProfile -Command "Set-Location 'D:\Dev\hearth'; <cmd>"`.

- `npm install --no-audit --no-fund`: install. Not `npm ci`: the Windows-made
  lockfile lacks the Linux/wasm optional deps, so `ci` fails its sync check (the
  Dockerfile uses `install` for the same reason). Revert the `package-lock.json`
  churn it leaves unless you meant to change dependencies.
- `npm run build`: production build. Runs `check:auth` and `check:mcp` first
  (prebuild), then Next's type check. This is the main gate.
- `npm run check:auth`: fails if a `(protected)` page doesn't call
  `requireAuthorizedPage()` first, or a route handler doesn't open with
  `requireDevice()` (`requireMcpAccess()` for `/api/mcp`; public routes are the
  explicit list in `scripts/check-route-guards.mjs`).
- `npm run check:mcp`: fails if a route method under `src/app/api` has no MCP
  tool (`routes` in `src/lib/mcp/tools.ts`) and isn't in `UNCOVERED_ROUTES`.
- `npm run test:home-base`: the Home Base feed end to end (:3918, mocks plus a fake
  Homeroom/Every Cent in the test process, ~1 minute). Don't run it alongside
  `test:mcp`: two `next dev`s can't share `.next`.
- `npm run test:mcp`: the connector suite. Starts `next dev` on :3917 with every
  mock on and runs the connector end to end (OAuth discovery, DCR, consent,
  tokens, refresh, revoke, MCP tool calls) plus the wall routes, including the
  allowance PIN rules. Uses a throwaway `HEARTH_DATA_DIR`. ~1 minute.
- `npm run lint`: clean (0 errors) as of the 2026-11-20 redesign; keep it that
  way. The rules that bite: no `setState` straight in an effect body (use
  `useMounted()`/`usePref()` from `src/lib/prefs.ts`, which read through
  `useSyncExternalStore`, or do the update in a callback such as `useUpstream`'s
  `onData`), no refs written during render (assign in `useLayoutEffect`), and no
  `Date.now()` in render (use `useClock()`/`useNow()` from `src/hooks/useNow.ts`).
- `npx tsc --noEmit` alone reports `RouteContext` missing; that type is generated
  by `next build`/`next dev`, so use the build.
- Local dev: `npx next dev -p <port>` with `HEARTH_DEVICE_TOKEN` set, then open
  `/setup?token=<token>` once. Process env overrides `.env.local`. Mock flags:
  `HEARTH_CALENDAR_MOCK`, `HEARTH_TASKS_MOCK`, `HEARTH_MEALS_MOCK` (meals and
  shopping), `HEARTH_SCHEDULE_MOCK`, all ignored in production. The mocks keep
  no server-side store: a mock-created event can't be edited ("no longer
  exists"); edit one of the mock feed's own events instead.
- A production build run locally (`npx next start`) ignores the mocks, so with
  no upstream credentials every card shows its "isn't connected" state: the
  quick way to see those.
- Browser checks: headless Chrome via the `headless-browser-test` skill at
  1920×1080 and 390×844. To see the wall's behavior (in-app keyboard, idle
  return, covered allowance) in a desktop browser, set
  `localStorage["hearth.device"]="wall"`; `hearth.theme` is `light`/`dark`,
  `hearth.lens` a member key.

## Layout

- Destinations are `NAV` in `src/lib/config.ts` (Today `/`, Calendar, School,
  Chores, Kitchen; exactly five, because the same list is the phone's tab bar)
  plus Settings. The old addresses redirect in `next.config.ts`. The frame
  (rail + header on a wide screen, top bar + tab bar on a phone, the lens) is
  `src/components/app/AppShell.tsx`.
- `src/app/(protected)/<view>/page.tsx`: one per destination; each awaits
  `requireAuthorizedPage()` first and renders a client view from
  `src/components/<area>/`. A server page can't hand a lucide icon (or any
  function) to a client component: put the icon-bearing markup in a client
  component (see `SettingsView`).
- `src/app/api/**/route.ts`: every handler calls `requireDevice()` as its first
  statement (except the connector's, below). There is deliberately no middleware
  (README → Security). Handlers are thin: the rules live in
  `src/lib/<area>/actions.ts` (calendar, tada, spoon, tandem, allowance),
  returning an `ActionResult` (`src/lib/action.ts`) that both the route and the
  MCP tool use. Put new logic in an action, not the route.
- `src/lib/<upstream>/`: `client.ts` (server-only HTTP + snake→camel
  normalization), `config.ts` (env checks), `mock.ts` (dev data), `types.ts`
  (shared with client views). Upstream tokens never reach the browser.
- One hook per source in `src/hooks/useHub.ts` (chores, cleaning, meals,
  shopping, school) and `useCalendarEvents.ts`: polling plus the optimistic
  writes. Today's cards and the full pages use the SAME hooks, so add behavior
  there, not in a view. They poll with `useUpstream` (keeps last good data,
  stale after two failures, refetches when the page becomes visible; `onData`
  is where optimistic state is retired).
- `src/components/ui/`: the shared pieces. `Card` with `SourceGate` (the
  loading / not connected / can't reach states every source shares), `Sheet`
  (the one overlay: bottom sheet on a phone, centered on a wide screen),
  `Button`/`Segmented`/`Toggle`, `Avatar`, `Page`, `Keypad`.
- The lens ("who's looking") and the household are `useHousehold()`
  (`src/components/app/Household.tsx`); `src/lib/household.ts` maps each member
  to their Tada! id and Tandem lane. The lens is attribution, not auth.
- Per-device preferences (lens, theme, screen type) live in localStorage via
  `src/lib/prefs.ts`. `useDeviceClass()` returns `wall` (large, touch-only),
  `phone` or `personal`; only a wall uses the in-app `OnScreenKeyboard`
  (`useTouchWall()`), returns to Today when idle and dims at night
  (`src/components/app/ScreenKeepers.tsx`).

## Design system (src/app/globals.css)

- Two layouts, one breakpoint: `wide:` is 900px and up. Phone-first classes,
  `wide:` for the wall/desktop. On a wide screen the page fills the frame and
  panels scroll inside it (`wide:h-full`, `wide:overflow-y-auto`); a phone
  page-scrolls.
- On a wide screen the ROOT FONT SIZE scales with the viewport
  (`min(100vw/96, 100vh/54)`, so 20px at 1920×1080 and 13.3px at 1280×720).
  Size everything in rem (Tailwind spacing already is) and the wall keeps its
  proportions at any resolution. Never use px for layout.
- Every color is a token with a second value under `:root[data-theme="dark"]`
  (the evening theme). Use `text-ink`, `bg-surface`, `text-on-ink`, `bg-scrim`
  and so on; never a hex in a component. The exception is text ON a member
  color, which is a fixed `#27221c` or `#ffffff` from `useTextOn()`, because
  member colors don't change with the theme.
- Saturation is reserved for people (spec §7): primary actions are ink, not a
  brand color. `--color-ember` is only the logo and the "now" marker.
- The font variables are on `<html>`, not `<body>`: `--font-display` and
  `--font-body` are defined at `:root` and must resolve there (on `<body>` they
  silently fell back to system fonts for the app's whole first life).
- `<html data-theme>` is set before paint by the inline script in
  `src/app/layout.tsx` and kept right by `ThemeKeeper`; the two must agree.
- The wall's WebView is modern enough for `color-mix`, `dvh` and Tailwind v4,
  but event chips still paint bands with `clip-path` over solid fills, not
  gradients with custom properties (those vanished on the wall once).

## Storage (the two files Hearth keeps)

- `src/lib/settings/dataDir.ts` resolves the directory: `HEARTH_DATA_DIR` (a
  Railway volume at `/data`), else `./.hearth-data` (replaced on every deploy).
  `settings.json` is the family colors (spec D12); `allowance.json` is the
  parent-entered balances and the hashed parent PIN (spec D13).
- The container starts as root only so `scripts/docker-entrypoint.sh` can chown
  the volume, then drops to the `nextjs` user with su-exec. Keep it that way
  rather than setting `RAILWAY_RUN_UID=0`.

## Allowance (parent-entered; Greenlight has no API)

- Greenlight offers a household no supported way to read balances (README →
  Allowance and Greenlight has the findings and sources checked 2026-11-20). Do
  not add private endpoints, scraping or a Greenlight login.
- `src/lib/allowance/`: `GET /api/allowance?viewer=<key>` returns a balance only
  to the kid it belongs to; everything else (`/unlock`, `PUT`) needs the parent
  PIN, checked server-side on every request and rate-limited (5 wrong per 15
  minutes, in process memory). The MCP tools (`get_allowance`,
  `set_allowance_balance`) skip the PIN: the connector is already parent-only.
- Every balance has `source: "manual"`. If a synced source ever exists, add a
  value there and a different label; never present a typed amount as synced.
- `AllowanceCard` is keyed by the kid so switching lens remounts it: the
  previous kid's amount must not linger on screen.

## Git and deploy

- Windows checkout with CRLF files: WSL git shows everything modified. Use
  `git.exe` from WSL for status, commits and pushes in this folder.
- Workflow is the Dev-wide one: branch off `origin/staging`, squash-merge into
  `staging`, push `staging`, then `git push origin staging:main`. `main` has old
  PR merge commits, so merge `origin/main` into `staging` first when it's ahead.
- Railway project `hearth`, one service, production only, deploys `main`. The
  Dockerfile builder and `/health` check come from `railway.json` (the dashboard
  shows Railpack and no health check), so they need moving before Railway stops
  reading config-as-code on 2026-12-01. The entrypoint and the volume
  permissions depend on the Dockerfile build: a Railpack build would run without
  the chown step.
- Enchanted Spoon's side of the integration (`backend/app/api/hearth.py`) lives in
  the enchanted-spoon repo and ships through that repo's own `/git` workflow;
  its rules and hooks don't load from here.

## ChatGPT connector (MCP + OAuth 2.1)

- URL to paste into ChatGPT (custom MCP server, OAuth):
  `https://hearth-production-e964.up.railway.app/api/mcp`.
- Code: `src/lib/mcp/` (config, stateless tokens, OAuth helpers, consent page,
  JSON-RPC server, tools), routes `src/app/api/mcp`, `src/app/api/oauth/*`,
  `src/app/.well-known/*`. JSON-RPC is hand-rolled (initialize, notifications,
  ping, tools/list, tools/call; GET/DELETE → 405), no SDK dependency.
- No database, so nothing is stored: DCR client ids are signed client records,
  confidential secrets are derived from them, codes (10 min) and tokens (access
  1 h, refresh 90 days from last use) are HMAC-signed with `HEARTH_MCP_SECRET`.
  Used codes, rotated refresh tokens and revocations are remembered in process
  memory only: after a restart an old refresh token works again until it expires.
  Accepted; the durable revoke is rotating the secret.
- Consent: the connect password `HEARTH_MCP_PASSWORD` (5 wrong per IP / 20
  overall per 15 min), or none for a browser holding the wall's device cookie.
  The local copy of the password and secret is in `.env.local`; Railway
  production has the same values.
- Kill switch: `HEARTH_MCP_ENABLED=0` (every connector route 404s). Disconnect
  everyone: set a new `HEARTH_MCP_SECRET` on Railway.
- Tools (22) call the same action functions as the wall's routes, so the
  allowlists hold (member calendars, read-set allowlist on edit/delete, the
  Tada! acting-member allowlist). A new wall route needs a tool or an
  `UNCOVERED_ROUTES` entry, or the build fails. Settings (colors) and the parent
  PIN are left out.
  `list_events` returns each event's `copies` (the real Google calendar/event
  ids behind a Hearth group's synthetic id).
- Every Hearth event is on the family calendar (`FAMILY_CALENDAR_ID`,
  miller.family3416@gmail.com, owned by Maryann's account): `reconcileEvent` adds a
  family copy beside the assignees' own copies (spec D3, 2026-11-15). Her account
  doesn't have Mitchell's or the kids' calendars, so the family copy is where her
  reminders go (`suggested_copy` picks it when she isn't assigned).
- Reminder tools (`src/lib/calendar/reminders.ts` rules, `src/lib/google/reminders.ts`
  Google calls): Google keeps `reminders` private to each user, so the household
  token can't set anyone's alarms (spec D9's correction). These run as one
  person's own token, `GOOGLE_REMINDER_REFRESH_TOKEN` (Maryann; captured with
  `scripts/google-reminder-consent.mjs`, run under `railway run` because the
  Google client id/secret are only on Railway, not in `.env.local`), and refuse
  with "aren't set up" without it. The OAuth client's only registered redirect is
  the OAuth Playground (the household token came from there too), so the script
  uses it: she signs in, copies the Playground page's address into a file, and
  `finish <file>` sets the variable on Railway via stdin. Never put that address
  on a `railway run` command line: it runs through cmd.exe and `&code=…` launches
  VS Code. The only write is a PATCH of `reminders` alone with `If-Match` (etag) and
  `sendUpdates=none`, then a read-back. The "appointment" preset's 8 a.m. reminder
  is minutes before start, worked out in the event's zone; all-day and ≤ 8 a.m.
  starts are refused. `editEvent` rechecks after every edit and recalculates a
  stale preset (`reminders` in its result); phone reschedules only show up in
  `check_appointment_reminders`. The mock keeps reminders in memory.

## Home Base feed (Maryann's dashboard site)

- `GET /api/home-base/summary?date=YYYY-MM-DD&days=1..7`, read-only. Code in
  `src/lib/homeBase/` (`types.ts` is the contract). One envelope per source
  (`status`, `fetched_at`, `data_as_of`, `error`, `data`); each source has its own
  time limit and one failing source never fails the response.
- Auth: its own bearer token, digests in `HOME_BASE_TOKEN_SHA256` (comma list for
  rotation; unset = 404). Guarded by `requireHomeBaseToken` (listed in
  `check-route-guards.mjs`); the token opens nothing else and the device cookie
  doesn't open it. In-process limit 30 requests/minute. Make tokens with
  `node scripts/home-base-token.mjs <out-file>` (writes the raw token to the file,
  prints only the digest). Revoke: remove the digest on Railway.
- Sources: calendar (`getEventsWithStatus`, which reports skipped calendars and the
  stalest sync instead of hiding them), Tandem, Spoon, Tada! (today only; other
  dates answer `unavailable_for_date`; no counts or scores, spec D4), plus two
  apps Hearth reads only here: Homeroom `GET /api/home-base/summary` (school hours
  and Connexus lessons) and Every Cent `GET /api/home-base/budget-summary`. Each
  of those checks its own key (`HOME_BASE_KEY_SHA256` there); Hearth holds the raw
  keys in `HOMEROOM_HOME_BASE_KEY` / `EVERY_CENT_HOME_BASE_KEY` (URLs default to
  production; override with `HOMEROOM_API_URL` / `EVERY_CENT_API_URL`).
