@AGENTS.md

# Hearth

Wall-mounted household display (1920×1080 touch panel). A client, not a store: it
reads and writes Google Calendar, Tada!, Tandem and Enchanted Spoon through its own
route handlers and keeps no household data. README.md is the operator guide;
`docs/app-spec.md` holds the decisions (D1–D12) and phase status;
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
- `npm run test:mcp`: the only test suite. Starts `next dev` on :3917 with every
  mock on and runs the connector end to end (OAuth discovery, DCR, consent,
  tokens, refresh, revoke, MCP tool calls) plus a few wall routes. ~1 minute.
- `npm run lint`: already red on files outside recent work (13 errors, mostly
  `react-hooks/set-state-in-effect` from `useEffect(() => setMounted(true), [])`
  and refs written during render in `useUpstream`/`useIdleReset`). Lint the files
  you touch and add no new errors; `useSyncExternalStore` (see `ShoppingView`)
  gives a mounted flag without the lint error.
- `npx tsc --noEmit` alone reports `RouteContext` missing; that type is generated
  by `next build`/`next dev`, so use the build.
- Local dev: `npx next dev -p <port>` with `HEARTH_DEVICE_TOKEN` set, then open
  `/setup?token=<token>` once. Process env overrides `.env.local`. Mock flags:
  `HEARTH_CALENDAR_MOCK`, `HEARTH_TASKS_MOCK`, `HEARTH_MEALS_MOCK` (meals and
  shopping), all ignored in production.

## Layout

- `src/app/(protected)/<view>/page.tsx`: one per sidebar view; each awaits
  `requireAuthorizedPage()` first and renders a client view from
  `src/components/<area>/`.
- `src/app/api/**/route.ts`: every handler calls `requireDevice()` as its first
  statement (except the connector's, below). There is deliberately no middleware
  (README → Security). Handlers are thin: the rules live in
  `src/lib/<area>/actions.ts` (calendar, tada, spoon, tandem), returning an
  `ActionResult` (`src/lib/action.ts`) that both the route and the MCP tool use.
  Put new wall logic in an action, not the route.
- `src/lib/<upstream>/`: `client.ts` (server-only HTTP + snake→camel
  normalization), `config.ts` (env checks), `mock.ts` (dev data), `types.ts`
  (shared with client views). Upstream tokens never reach the browser.
- Navigation is `NAV` in `src/lib/config.ts` plus the icon map in
  `src/components/layout/Sidebar.tsx`. The timed view schedule is
  `VIEW_SCHEDULE` in the same config file.
- Views poll with `useUpstream` (keeps last good data, stale after two failures)
  and reset with `useIdleReset`. Text entry uses `useTouchWall()`: the in-app
  `OnScreenKeyboard` on the wall, a real input on a PC.

## Git and deploy

- Windows checkout with CRLF files: WSL git shows everything modified. Use
  `git.exe` from WSL for status, commits and pushes in this folder.
- Workflow is the Dev-wide one: branch off `origin/staging`, squash-merge into
  `staging`, push `staging`, then `git push origin staging:main`. `main` has old
  PR merge commits, so merge `origin/main` into `staging` first when it's ahead.
- Railway project `hearth`, one service, production only, deploys `main`. The
  Dockerfile builder and `/health` check come from `railway.json` (the dashboard
  shows Railpack and no health check), so they need moving before Railway stops
  reading config-as-code on 2026-12-01.
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
- Tools (20) call the same action functions as the wall's routes, so the
  allowlists hold (member calendars, read-set allowlist on edit/delete, the
  Tada! acting-member allowlist). A new wall route needs a tool or an
  `UNCOVERED_ROUTES` entry, or the build fails. Settings (colors) is left out.
  `list_events` returns each event's `copies` (the real Google calendar/event
  ids behind a Hearth group's synthetic id).
- Reminder tools (`src/lib/calendar/reminders.ts` rules, `src/lib/google/reminders.ts`
  Google calls): Google keeps `reminders` private to each user, so the household
  token can't set anyone's alarms (spec D9's correction). These run as one
  person's own token, `GOOGLE_REMINDER_REFRESH_TOKEN` (Maryann; captured with
  `scripts/google-reminder-consent.mjs`), and refuse with "aren't set up" without
  it. The only write is a PATCH of `reminders` alone with `If-Match` (etag) and
  `sendUpdates=none`, then a read-back. The "appointment" preset's 8 a.m. reminder
  is minutes before start, worked out in the event's zone; all-day and ≤ 8 a.m.
  starts are refused. `editEvent` rechecks after every edit and recalculates a
  stale preset (`reminders` in its result); phone reschedules only show up in
  `check_appointment_reminders`. The mock keeps reminders in memory.

