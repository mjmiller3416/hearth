# Hearth — Build Prompts

Companion to `hearth-spec.md`. Each phase is a self-contained prompt for a Claude CLI session. Run them in order. Do not start a phase until the previous one is deployed and used for at least a few days.

Each phase carries its own **Locked decisions** block. These are repeated deliberately — a CLI session only sees the prompt in front of it, and the badge/reward system in Tada! went unbuilt for four phases because it lived in the spec but never appeared in a checklist.

---

# Phase 0 — Shell & Deploy

## Context

You are building Hearth, a wall-mounted household display for a family of four. It is a read-mostly view layer over three existing APIs: Google Calendar, Tada! (a cleaning/task app), and EnchantedSpoon (a meal planner). It has no database of its own.

This phase builds the frame and gets it on the wall showing nothing useful. That is intentional. Every later phase drops content into a shell that is already deployed, styled, and proven.

## Locked decisions

- Hearth has **no database**. No schema, no ORM, no migrations. Config is environment variables only.
- All upstream API calls go through Next.js route handlers. Credentials never reach the browser.
- No login. Authentication is a long-lived device token in the environment.
- Landscape, fixed resolution, touch only, always on.
- Failure mode is stale data with a quiet timestamp — never a blank screen, never a raw error.

## Manual setup (do this before running the build)

1. Create a new GitHub repo, `hearth`.
2. Create a new Railway service in the existing project, pointed at that repo, single-branch auto-deploy.
3. Measure the target device: exact screen resolution and physical diagonal. Write it down — the layout is built to this number.
4. Generate a random device token (`openssl rand -hex 32`) and set it as `HEARTH_DEVICE_TOKEN` in Railway.

## Checklist

1. Scaffold a Next.js app (App Router, TypeScript) in the repo root.
2. Add Tailwind. Define the four member colors as named tokens in the theme config — not hex values scattered through components.
3. Set the type scale for the confirmed read distance from step 3 of manual setup. Body text minimum should be large enough to read from six feet; verify physically, do not guess.
4. Build the persistent sidebar: five destinations (Calendar, Tasks, Lists, Meals, Recipes) plus a settings affordance. Icon over label, vertical rail on the left.
5. Wire routing so each sidebar item navigates to its own route. All five render a placeholder for now.
6. Build the header bar: day, date, time. Time updates every minute, not every second.
7. Implement device auth: a middleware that checks `HEARTH_DEVICE_TOKEN` against a cookie, and a one-time setup route that sets the cookie when given the correct token as a query param. This means the device is authorized once, by visiting a URL with the token, and stays authorized.
8. Build a shared `useUpstream` hook (or equivalent) that wraps polling with the stale-data contract: retain last good data, expose a `lastUpdated` timestamp, expose an `isStale` flag after two consecutive failed polls.
9. Build a shared `<StaleIndicator />` that renders a small "as of H:MM" when `isStale` is true and renders nothing otherwise.
10. Build a shared `<ViewFrame />` wrapper providing consistent padding, title treatment, and stale indicator placement, so later phases only supply content.
11. Add a global error boundary that renders the last good view rather than an error page. If nothing is cached, render a quiet neutral state — never a stack trace.
12. Add a PWA manifest with a name, icons, and `display: fullscreen`.
13. Implement Screen Wake Lock so the display does not sleep while the app is foregrounded. Re-acquire the lock on visibility change, since the lock is released when the page is backgrounded.
14. Disable text selection, long-press context menus, pinch zoom, and pull-to-refresh globally. All four are accidental-touch hazards on a wall.
15. Add a `/health` route returning 200 for Railway.
16. Deploy to Railway and confirm the shell renders on the target device at the real resolution.

## Acceptance criteria

1. All five sidebar destinations navigate and render a placeholder.
2. Visiting the app without a valid device cookie redirects to the setup route; visiting with the token in the query param sets the cookie and grants access thereafter.
3. The device token never appears in any client-side bundle. Verify by searching the built output.
4. The clock updates and the date is correct.
5. Screen stays awake indefinitely with the app foregrounded.
6. Body text is comfortably readable from six feet on the actual target hardware.
7. Accidental long-press, pinch, and drag produce no visible effect.
8. Forcing an error in a route handler produces a quiet state, not a stack trace.
9. Deploy is green and `/health` returns 200.

---

# Hearth — Phase 0.1: Auth Hardening & Next Upgrade

## Context

Phase 0 implemented device auth as Next.js middleware. That is the exact pattern covered by CVE-2026-44575 and CVE-2026-45109: App Router applications relying on middleware or proxy-based authorization can be bypassed with crafted `.rsc` and segment-prefetch URLs, which resolve to the same page without matching the intended middleware rule. The follow-up CVE exists because the first fix did not apply to `middleware.ts` under Turbopack, which Next 16 uses by default.

The repo is pinned to `next@16.0.10`. Both CVEs are fixed in 16.2.6, and there have been two security releases since.

Two things need to change, and the second matters more than the first:

1. The framework needs upgrading.
2. **Authorization needs to move out of middleware and into the route and page logic itself.** This is Vercel's own guidance for anyone who cannot upgrade immediately, and it is worth adopting permanently rather than as a stopgap. Middleware bypass appeared on three separate surfaces in the May 2026 release alone — it is a recurring class of defect where the App Router's matching logic and the router's actual resolution disagree about what a path is. A version bump fixes today's instances; moving the check fixes the category.

Hearth is deployed on Railway with a public URL. The device auth gate is the only thing between the open internet and the app. Phase 0 exposes nothing but placeholders, so present risk is low — but Phase 1 puts the family calendar behind this gate and Phase 2 adds the kids' names and a write endpoint. Fix it now, while the surface is empty.

## Locked decisions

- **Middleware is a convenience redirect, not a security boundary.** It may stay, but nothing may depend on it for authorization. Every protected surface verifies for itself.
- Every route handler under `/api` verifies the device token before doing any work, including before reading its own request body.
- Every protected page verifies via a server component in a shared layout, so the check runs during RSC render and therefore also runs for `.rsc` and segment-prefetch variants of the same route.
- The setup route lives outside the protected layout. It is the only unauthenticated page.
- Token comparison is constant-time. This is cheap and removes a whole class of question.

## Manual setup

1. Confirm the current `next` version in `package.json` before changing anything, and note it in the commit message.
2. Have the Railway deploy log open for the first deploy after the upgrade — a major-minor jump can surface peer dependency errors that only appear at build time.

## Checklist

1. Create `lib/auth.ts` exporting two functions:
   - `isAuthorizedDevice(): Promise<boolean>` — reads the device cookie, compares it against `HEARTH_DEVICE_TOKEN` using `crypto.timingSafeEqual`, guarding for unequal lengths before the compare so it cannot throw. Returns `false` when either value is missing.
   - `requireDevice(): Promise<Response | null>` — returns a bare `401` `Response` when unauthorized, `null` when authorized.
2. Restructure `app/` into two route groups: `app/(protected)/` holding all five views, and `app/(public)/` holding only the setup route.
3. Add `app/(protected)/layout.tsx` as a server component that awaits `isAuthorizedDevice()` and calls `redirect('/setup')` when it returns false. This is now the primary gate for page routes.
4. Confirm the protected layout is a server component with no `"use client"` directive anywhere in its own module. If it renders as a client component the check moves to the browser and is worthless.
5. Add `const denied = await requireDevice(); if (denied) return denied;` as the first statement in every route handler under `app/api/`, including `/health` if it reveals anything beyond a literal 200. Place it before any body parsing.
6. Reduce `middleware.ts` to a redirect convenience only, with a comment stating explicitly that it is not a security boundary and that authorization lives in `lib/auth.ts`. Alternatively delete it — the layout and handler checks are sufficient, and deleting removes the temptation to add logic back into it later.
7. Verify the setup route still sets the cookie correctly and that its own page does not sit inside the protected group, which would produce a redirect loop.
8. Confirm the auth cookie is set `httpOnly`, `secure`, `sameSite: 'lax'`, with a long `maxAge`. It must not be readable from client JavaScript.
9. Upgrade `next` to `16.3.0`, the current stable. Align `react` and `react-dom` to whatever the new version requires as peers.
10. Run `npm audit` and record what remains. Some transitive advisories may persist with no upstream fix available; note them rather than force-resolving, and do not run `npm audit fix --force`.
11. Run a production build locally. Confirm no new build errors and that Turbopack completes cleanly.
12. Deploy and confirm the shell still renders on the target device with the existing cookie intact — the cookie should survive this change, so no re-authorization should be needed.
13. Add a short `## Security` section to the README recording that authorization lives in `lib/auth.ts`, that middleware is not load-bearing, and that any new route handler or page must call the check itself.

## Acceptance criteria

Run 1 through 4 against the deployed Railway URL from a machine with no auth cookie.

1. `curl -i https://<app>/calendar` returns a redirect to setup, not page content.
2. `curl -i -H "RSC: 1" https://<app>/calendar` returns no protected page content.
3. `curl -i "https://<app>/calendar?_rsc=probe"` returns no protected page content.
4. A segment-prefetch URL for a protected route returns no protected content. Derive the exact URL shape from the Network tab of an authorized session — filter for requests fired on link hover, and replay the path without the cookie.
5. `curl -i https://<app>/api/calendar` with no cookie returns 401.
6. Every file under `app/api/` contains the `requireDevice()` call as its first statement. Verify by grep, not by memory.
7. The protected layout is a server component; `"use client"` does not appear in it.
8. The device cookie is not readable via `document.cookie` in the browser console.
9. An incorrect token of the same length and an incorrect token of a different length both fail cleanly, with no thrown error from the comparison.
10. `next --version` reports 16.3.0 and the two segment-prefetch CVEs no longer appear in `npm audit`.
11. The wall device still renders the shell with its existing cookie, without re-running setup.

## Follow-up, tracked separately

`recipe-app` is pinned to the same Next version and carries the same advisories. Bump it on its own branch with its own testing pass — do not couple the two upgrades just because the versions currently match. It has real user data behind its auth, so it warrants the same review of where authorization actually executes, not only a version bump.

---

# Phase 1 — Calendar

## Context

The calendar is the one thing this household actually uses on their current Skylight device. It is the reason Hearth exists and the view that must be right.

## Locked decisions

- **Google Calendar is the system of record.** Hearth does not build a calendar, store events, or offer event creation. Read only.
- **Event color comes from the owning calendar, not from attendees.** One Google Calendar per family member. There is no tagging feature, no assignment logic, no attendee resolution. Do not add one.
- Use the Google Calendar API with `syncToken` incremental sync. **Do not use secret iCal URLs** — they lag by hours and break the primary use case.
- One household Google account holds read access to all four calendars. One refresh token, not four.
- Month view is the default. Week view is secondary. Do not build day view.

## Manual setup

1. Create a dedicated Google account for the household display.
2. From each family member's Google account, share their calendar with the household account (read access is sufficient).
3. In Google Cloud Console: create a project, enable the Calendar API, create OAuth credentials.
4. Run the consent flow once as the household account. Capture the refresh token.
5. Set in Railway: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
6. Collect the four calendar IDs. Set `CALENDAR_MAP` as JSON mapping calendar ID to `{ name, color }` — four entries, one per person.

## Checklist

1. Build a Google Calendar client module: exchange refresh token for access token, cache the access token in memory until expiry, refresh on 401.
2. Build a route handler `GET /api/calendar` that fetches events across all mapped calendars for a given month range and returns a normalized shape: `{ id, title, start, end, allDay, calendarId, color, memberName }`.
3. Implement `syncToken` incremental sync with in-memory storage. On `410 Gone`, discard the token and do a full re-sync.
4. Handle recurring events correctly by requesting `singleEvents=true` with `orderBy=startTime`, so expansions arrive already resolved.
5. Handle all-day events as a distinct render case — they span differently and must not be positioned by time.
6. Build the month grid: seven columns, weeks as rows, correct leading and trailing days from adjacent months rendered dimmed.
7. Render events within day cells as color-filled chips. Color comes from `CALENDAR_MAP`. Include start time for timed events, omit it for all-day.
8. Handle day-cell overflow: show as many events as fit, then a "+N more" affordance that opens the day in a panel.
9. Mark today distinctly. Dim past days within the current month rather than hiding them.
10. Build the member chip row across the top: four chips, each in the member's color, tappable to filter the grid to that member. Tapping an active chip clears the filter.
11. Add month navigation: previous, next, and a "Today" reset.
12. Add a week view toggle. Same data, same colors, seven day-columns with events in vertical time order.
13. Poll `/api/calendar` every 60 seconds using the Phase 0 upstream hook. Wire the stale indicator.
14. Auto-reset to the current month and clear any active filter after 5 minutes of no interaction — the wall's resting state should always be today, unfiltered.
15. Make Calendar the default route so the app opens here after any reload.

## Acceptance criteria

1. All four members' events appear, each in the correct color.
2. An event created on another member's calendar from a phone appears on the wall within 90 seconds.
3. Recurring events render on every correct occurrence, and an edited single occurrence renders its edit.
4. All-day events render distinctly from timed events.
5. Tapping a member chip filters to that member; tapping again clears.
6. A day with more events than fit shows "+N more" and the panel opens with all of them.
7. Month navigation works and "Today" returns to the current month.
8. Leaving the app on a past month unattended for 5 minutes returns it to the current month.
9. Killing network access leaves the last render visible with a stale timestamp — no blank screen, no error.
10. The Google refresh token does not appear in any client bundle.

---

# Phase 2 — Tasks

## Context

Two tabs with deliberately different philosophies. Read §D4 and §D5 of the spec before writing code — the asymmetry here is the most important design decision in the project and it looks like an inconsistency if you don't understand why it exists.

## Locked decisions

- **Maryann's tab shows done-today only.** Accumulation, no denominator, no progress bar, no percentage, no queue, no "next up," no upcoming tasks. Tada! exists because a list of everything outstanding produces paralysis; putting her ranked queue on a living room wall rebuilds that problem in a place she cannot avoid. If a change to this tab makes it more informative about what remains, that change is wrong.
- **The kids' tab shows outstanding chores and allows completion.** The asymmetry is intentional. Kids have a tracking problem, not a paralysis problem, and their Tada! surface is already a list.
- **Kid completion is the only write in the system.** It uses a scoped device token, is limited to `complete_task` on kid accounts, and writes `source="hearth"` to `CompletionLog`.
- Do not render streaks, badges, or stars. Tada! owns reward state. This screen does not duplicate or summarize it.
- Do not render dirtiness ratios, decay bands, or priority ranking anywhere in this view.

## Manual setup

1. In Tada!, confirm or add endpoints for: today's completions for an adult, today's assigned tasks for a kid, and a device-scoped `complete_task`.
2. Create a Tada! device token scoped to those three operations and to kid accounts only for the write.
3. Set in Railway: `TADA_API_URL`, `TADA_DEVICE_TOKEN`, and `HEARTH_ADULT_ID` (Maryann's Tada! user id).
4. Resolve open question Q5: does the kids' tab surface undo, or are wall mistakes corrected on a phone? Answer before item 12.

## Checklist

1. Build a Tada! client module with the device token, mirroring the Phase 1 Google client's error handling.
2. Build `GET /api/tasks/done-today` returning today's completions for `HEARTH_ADULT_ID`: task name, room or zone, completion time.
3. Build `GET /api/tasks/kids` returning today's outstanding and completed chores per kid.
4. Build `POST /api/tasks/complete` accepting a task id and kid id, calling Tada!'s `complete_task` with `source="hearth"`. Reject any request naming an adult account with a 403.
5. Build the tab bar: two tabs, Maryann and Kids. Default to Kids — it is the tab that gets used, and Maryann's is a glance rather than a destination.
6. Build the Maryann tab: completed tasks in reverse-chronological order, each showing name and completion time. Nothing else.
7. Give the Maryann tab an empty state that reads as an invitation rather than a reproach. No count, no "0 of N."
8. Build the Kids tab: one column per kid, headed by name and avatar circle in their member color.
9. Render each chore as a row with an emoji or icon, the chore name, and a large circular tap target on the right.
10. On tap, optimistically settle the row into a completed state, then fire `POST /api/tasks/complete`. On failure, revert the row and show a brief inline message on that row only — never a global error.
11. Size tap targets for a child reaching up to a wall. Larger than a phone target, with generous spacing to prevent adjacent mis-taps.
12. Implement the undo decision from manual setup step 4. If undo is in scope, surface it as a brief affordance on the just-completed row that calls Tada!'s undo endpoint; if not, add a comment in the component recording the decision and why.
13. Poll both endpoints every 60 seconds. Wire stale indicators per tab.
14. Reset to the Kids tab after 5 minutes of no interaction.
15. Verify no streak, badge, star, ratio, or band data appears anywhere in the rendered output.

## Acceptance criteria

1. Maryann's tab shows tasks completed today and nothing about what remains.
2. Maryann's tab displays no number that could be read as a total or a fraction.
3. Completing a task on a phone appears on Maryann's tab within 90 seconds.
4. Each kid's column shows only that kid's chores.
5. Tapping a chore marks it complete in Tada! and the completion is attributed to the correct kid.
6. That completion carries `source="hearth"` in `CompletionLog`.
7. A completion attempt naming an adult account returns 403.
8. With the network down, a tap reverts the row and shows an inline message — the rest of the screen is unaffected.
9. Adjacent tap targets cannot be triggered by a single reasonable finger press.
10. No streak, badge, star, dirtiness ratio, or decay band appears anywhere in this view.

---

# Phase 3 — Lists

## Context

The smallest phase. Tada!'s lists, rendered for reading. Deliberately kept separate so it ships and gets used on its own.

## Locked decisions

- Read-only. No add, no edit, no check-off. Typing on a wall is bad; list editing happens on a phone.
- Respect Tada!'s existing `kind` field and section structure rather than inventing a new grouping.
- Do not render per-item prices or running totals. Those exist in Tada! for budget groundwork and are not glanceable wall information.

## Manual setup

1. Confirm Tada! exposes a lists read endpoint returning lists with items and sections, reachable with the existing device token.

## Checklist

1. Build `GET /api/lists` returning lists with `kind`, sections, items, and item counts.
2. Build the list index: each list as a panel with its name, `kind`, and item count.
3. Render sections within a list as headed groups, matching Tada!'s section ordering.
4. Render items as plain rows. No checkboxes — a checkbox that does nothing is worse than no checkbox.
5. Handle long lists by scrolling within the panel, not the page.
6. Build an empty state for a list with no items, and for the case of no lists at all.
7. Poll every 60 seconds and wire the stale indicator.
8. Reset scroll position after 5 minutes of no interaction.

## Acceptance criteria

1. All active Tada! lists appear with correct names and item counts.
2. Sections render in Tada!'s order with the right items under each.
3. Adding an item on a phone appears on the wall within 90 seconds.
4. No prices or totals appear anywhere.
5. No control implies the list can be edited from this screen.
6. A long list scrolls within its panel without moving the sidebar or header.

---

# Phase 4 — Meals & Recipes

## Context

Two thin EnchantedSpoon reads, combined into one phase because splitting them would leave a phase with almost nothing in it.

## Locked decisions

- **Read-only.** No writes to EnchantedSpoon. Adding a recipe to the meal plan from the wall is explicitly out of scope — the moment this screen writes, it needs real per-user auth and stops being a display.
- Meals shows the current week's plan only. No history, no future weeks beyond next.
- Meals shows no ingredients, no nutrition, no recipe detail. It answers "what's for dinner," nothing more.
- **If EnchantedSpoon's shopping-list sync refactor is still in flight, stop and defer this phase.** Do not integrate against a moving surface.

## Manual setup

1. Confirm the shopping-list sync refactor has landed. If not, stop here.
2. Confirm EnchantedSpoon endpoints for current-week meal plan and saved recipes.
3. Create a EnchantedSpoon read-only device token.
4. Set in Railway: `EnchantedSpoon_API_URL`, `EnchantedSpoon_DEVICE_TOKEN`.

## Checklist

1. Build a EnchantedSpoon client module matching the pattern of the Tada! and Google clients.
2. Build `GET /api/meals` returning the current week's plan: day, meal slot, meal name, recipe id if linked.
3. Build `GET /api/recipes` returning saved recipes: id, name, category, image if available.
4. Build `GET /api/recipes/[id]` returning name, ingredients, instructions.
5. Build the Meals view: seven day-columns for the current week, meals within each. Today's column is visually distinct.
6. Give Meals an empty state for unplanned days that does not read as an error.
7. Add a next-week toggle. Nothing beyond that.
8. Build the Recipes view: a scannable grid of recipe cards with name and category.
9. Add category filtering if EnchantedSpoon's categories are clean enough to be useful; skip it if they are not.
10. Build the recipe detail panel: name, ingredients, instructions, at wall-readable type size. Opens over the grid, dismissed by tapping outside.
11. Verify no control anywhere writes to EnchantedSpoon.
12. Poll both every 5 minutes — meal plans change far less often than tasks and do not warrant a 60-second poll.
13. Close any open recipe panel and reset filters after 5 minutes of no interaction.

## Acceptance criteria

1. The current week's plan matches EnchantedSpoon exactly.
2. Changing the plan on a phone appears on the wall within 6 minutes.
3. Today's column is visually distinct.
4. Unplanned days render calmly, not as errors.
5. All saved recipes appear in the grid.
6. Recipe detail is readable from six feet.
7. No request from this app mutates EnchantedSpoon state. Verify by reviewing every route handler added in this phase.

---

# Phase 5 — Hardware & Kiosk

## Context

Conditional. Only run this phase if the two-week trial on spare hardware showed the household actually uses the display. If it didn't, stop after Phase 4 and leave the Skylight alone — that is a legitimate and cheap outcome.

## Locked decisions

- **Never wipe or flash the Skylight.** No public firmware images exist and Skylight support declines to provide them. A failed flash is an unrecoverable brick.
- The Skylight launcher is **disabled**, not removed. `pm disable-user com.skylight` is reversible with one command.
- Decide Config A (coexist — Skylight app kept for calendar, Hearth one tap away) or Config B (replace — Hearth is the whole screen) before starting. Since Phase 1 builds its own calendar, Config B is the expected choice, but confirm with the household first.

## Manual setup

1. Answer Q6: can this unit reach Android developer options? On the 15", a USB OTG keyboard plus Win+N opens the notification shade; some units expose ADB directly over USB. On the Max, hold power ~2s and two-finger pull-down repeatedly until SystemUI crashes, then App Info → About tablet → tap Build Number seven times. **If developer options cannot be reached, stop — use dedicated hardware instead.**
2. Enable USB debugging and confirm `adb devices` sees it.
3. Record the exact firmware and software version before changing anything.

## Checklist

1. Install a kiosk browser APK (Fully Kiosk or equivalent) via `adb install`.
2. Configure it to load Hearth's URL on launch, in fullscreen, with no browser chrome.
3. Visit the setup route once with the device token to set the auth cookie. Confirm it persists across reboot.
4. Set the kiosk browser as the home activity: `adb shell cmd package set-home-activity`.
5. For Config B, disable the Skylight launcher and watchdog:
   `adb shell pm disable-user com.skylight`
   `adb shell pm disable-user skylight.watchdog`
   For Config A, leave both enabled and install a standard launcher plus a nav bar overlay instead.
6. Configure a screen on/off schedule in the kiosk browser to replace Skylight's Sleep feature, which is lost with the launcher.
7. Configure auto-restart of the kiosk app on crash, and auto-launch on boot.
8. Reboot and confirm the device comes back into Hearth unattended.
9. Document the exact reversal commands in the repo README:
   `adb shell pm enable com.skylight`
   `adb shell pm enable skylight.watchdog`
   `adb shell cmd package set-home-activity com.skylight/.MainActivity`
10. Run the display for 48 hours and check for burn-in on static elements, particularly the sidebar and header.
11. Confirm the device recovers on its own from a router reboot, without a manual tap.

## Acceptance criteria

1. Power cycling the device returns it to Hearth with no interaction.
2. Auth persists across reboot — no token re-entry.
3. Screen sleeps and wakes on the configured schedule.
4. Killing the kiosk app restarts it automatically.
5. A router reboot recovers without human intervention.
6. The reversal commands are in the README and have been tested at least once.
7. No visible burn-in after 48 hours of continuous operation.