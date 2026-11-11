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
- `npm run build`: production build. Runs `check:auth` first (prebuild), then
  Next's type check. This is the real gate: there are no tests.
- `npm run check:auth`: fails if a `(protected)` page doesn't call
  `requireAuthorizedPage()` first.
- `npm run lint`: already red on files outside recent work (14 errors, mostly
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
  statement. There is deliberately no middleware (README → Security).
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
