# Hearth — Build Prompts

Companion to `app-spec.md`. Each phase is a self-contained prompt for a Claude CLI session. Run them in order. Do not start a phase until the previous one is deployed and used for at least a few days.

Each phase carries its own **Locked decisions** block. These are repeated deliberately — a CLI session only sees the prompt in front of it, and the badge/reward system in Tada! went unbuilt for four phases because it lived in the spec but never appeared in a checklist.

---

# Phase 0 — Shell & Deploy

## Context

You are building Hearth, a wall-mounted household display for a family of four. It is a **client** — a second frontend, co-equal with the phone — for three existing apps: Google Calendar, Tada! (a cleaning/task app), and Enchanted Spoon (a meal planner). It reads and writes their APIs and keeps no database of its own. (Phase 0 builds only the read-only shell; the write surfaces arrive in later phases.)

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

`enchanted-spoon` is pinned to the same Next version and carries the same advisories. Bump it on its own branch with its own testing pass — do not couple the two upgrades just because the versions currently match. It has real user data behind its auth, so it warrants the same review of where authorization actually executes, not only a version bump.

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

# Hearth — Phase 1.5: Event Creation

Run after Phase 1 is deployed and in use. Insert into `prompts.md` between Phase 1 and Phase 2. The spec amendments below should be applied to `app-spec.md` §2 at the same time.

---

# Part A — Spec amendments

Two locked decisions change. Replace them in `app-spec.md` §2 rather than appending, and keep the rationale — it is the part that stops a future session from reverting them.

## D2 (amended) — Google Calendar is the system of record. Hearth may create events.

Unchanged: Hearth does not build a calendar, does not store events, and does not maintain its own copy of anything. Google holds the data; phones use the Google Calendar app; widgets and notifications come from Google for free.

Changed: Hearth is now a read-write client for **event creation only**. It may not edit or delete events. Editing a recurring event opens the this-instance / this-and-following / all-events question, plus conflict handling when two people edit at once, and none of that is what a wall display is for. Corrections happen on a phone.

## D3 (amended) — Event color comes from member tags, falling back to the owning calendar.

The original decision — color determined solely by which calendar owns the event, with no tagging feature — was correct for a read-only display and is wrong now that events can be created here. Its load-bearing use case was Maryann creating Lincoln's appointment directly on Mitchell's calendar so it rendered green. That worked, but it conflates two separate ideas: where an event lives, and who it concerns.

The replacement separates them:

- **Where it lives** is the Google calendar the event is written to. Selected at creation.
- **Who it concerns** is a set of Hearth member tags stored on the event.

An event tagged with two members renders half-and-half. Untagged events fall back to their owning calendar's color, which is exactly the Phase 1 behavior — so every event that already exists keeps rendering the way it does today, and there is no backfill.

Tags are stored in `extendedProperties.private` on the Google event. This is arbitrary key/value data that Google persists, returns on read, and never displays in its own UI. It behaves like an internal tag while requiring no database and no sync layer — which is why it does not violate D1.

## D9 (new) — Reminders are per-calendar, and that imprecision is accepted.

Google fires reminders to everyone subscribed to the owning calendar with notifications enabled, not to the tagged members. A reminder on Lincoln's appointment pings the whole household.

The alternative — using real Google attendees instead of extended properties — would notify each person individually and correctly, but generates invitation emails and RSVP prompts for every piece of family logistics, and requires email addresses for the kids. Too noisy for the value.

Accepted as-is. If it becomes annoying in practice, switching the tag mechanism from extended properties to attendees is a contained change to the read and write paths, not a redesign.

## D10 (new) — Countdown is a Hearth-only flag.

Stored as an extended property, rendered by Hearth, ignored by Google. Countdown and repeat are mutually exclusive: counting down to a recurring event means counting to the next occurrence, which is a different feature and not this one.

---

# Part B — Build prompt

## Context

Phase 1 renders a read-only Google Calendar. This phase adds event creation from the wall, modeled on the Skylight interface the household already knows: a form where you pick which calendar the event syncs to, and separately tag which family members it concerns.

Read Part A before starting. Two locked decisions from the original spec are being deliberately replaced, and the reasoning matters.

## Locked decisions

- **Create only.** No editing, no deletion. Both happen on phones.
- Member tags live in `extendedProperties.private.hearthMembers` as a comma-separated list of member keys.
- Countdown lives in `extendedProperties.private.hearthCountdown`.
- **Recurrence is native Google RRULE**, not an extended property. It is real calendar data and phones must honor it.
- **Reminders are native Google reminders** via `reminders.overrides`. Per-calendar imprecision is accepted per D9.
- Untagged events fall back to owning-calendar color. No backfill of existing events.
- Countdown and repeat cannot both be enabled on one event.
- The write path validates the target calendar against an allowlist. A crafted request must not be able to write to an arbitrary calendar the household account happens to have access to.

## Manual setup

1. **Grant write access.** The household account currently has read access to the shared calendars. For every calendar that should appear in the picker, change its sharing permission to **Make changes to events**. Without this, event creation returns 403 on those calendars while succeeding on ones the household account owns — a confusing partial failure.
2. **Re-consent with a write scope.** Cloud Console → Data access → add `https://www.googleapis.com/auth/calendar.events`. Remove `calendar.readonly` — the new scope covers reading. Then re-run the Playground flow and replace `GOOGLE_REFRESH_TOKEN` in Railway.
3. Revoke the previous grant at myaccount.google.com/permissions once the new token is confirmed working.
4. Set `HOUSEHOLD_TIMEZONE` in Railway to the IANA name (e.g. `America/New_York`). Google requires an explicit timezone on event creation and will not infer it.

## Config refactor

Members and calendars are no longer the same thing — there are more calendars than people, and a tag is not a calendar. Split the existing config:

- **`MEMBERS`** — JSON array of `{ key, name, color }`. The canonical list of people who can be tagged. `key` is a stable lowercase slug and is what gets written into `hearthMembers`.
- **`CALENDAR_MAP`** — JSON map of calendar ID to `{ label, writable, defaultMemberKey? }`. `label` shows in the picker, `writable` controls whether it appears there at all, `defaultMemberKey` supplies the fallback color for untagged events on that calendar.

## Checklist

1. Refactor config into `MEMBERS` and `CALENDAR_MAP` as described above. Update the Phase 1 read path to use the new shape.
2. Extend the Phase 1 normalizer to read `extendedProperties.private.hearthMembers` into a `memberKeys: string[]` field, and `hearthCountdown` into a boolean. Missing properties yield an empty array and false.
3. Build a `resolveEventColors(event)` helper returning an ordered array of colors: the tagged members' colors when tags exist, otherwise a single-element array from the owning calendar's `defaultMemberKey`, otherwise a neutral.
4. Update the event chip to render multiple colors as **hard-stop vertical bands** — a `linear-gradient` with coincident stops, not a blend. A gradient blend at six feet reads as a smudge.
5. Cap bands at three. Four or more tagged members renders a single defined "everyone" treatment rather than four slivers.
6. Build `POST /api/calendar/events`. Validate: title non-empty, end after start, `calendarId` present in `CALENDAR_MAP` **with `writable: true`**, every submitted member key present in `MEMBERS`, and countdown and recurrence not both set. Reject with 400 and a specific message on each.
7. In that handler, construct the Google event: `summary`, `start`/`end` as `date` for all-day or `dateTime` plus `timeZone` for timed, `recurrence` as an RRULE array when repeating, `reminders` with `useDefault: false` and an `overrides` entry when a reminder is set, and `extendedProperties.private` carrying `hearthMembers` and `hearthCountdown`.
8. Return the created event, normalized through the same path as reads, so the client receives an object identical in shape to a polled one.
9. Build the Add Event panel, ordered to match the interface the household already knows: Title, All-day toggle, Start and End (date and time), Repeats, Countdown, Reminder, Assign, Calendar. Slides in from the right over the grid.
10. Wire two entry points: a floating add button, and tapping an empty area of a day cell — which pre-fills that date. The second is the one that will get used.
11. All-day toggle hides the time fields and switches the payload to `date` form.
12. Default a new event to the tapped day at the next upcoming hour, running one hour. Nobody should have to set four fields to log a 3pm appointment.
13. Repeats offers daily, weekly on the start day, monthly on the start date, and yearly. End condition: never, after N occurrences, or until a date. Build the RRULE server-side from these choices, not in the browser.
14. Disable the Countdown toggle whenever Repeats is on, with a one-line explanation rather than a silent disabled state.
15. Reminder offers none, at time of event, 10 minutes, 30 minutes, 1 hour, and 1 day before. Method `popup`.
16. Assign renders the `MEMBERS` list as tappable colored avatar circles, multi-select, showing selection state clearly. Zero selected is valid and means untagged.
17. Calendar picker lists writable entries from `CALENDAR_MAP` by label, defaulting to the most-recently-used value held in component state.
18. Size every control for a hand reaching up to a wall. Date and time pickers especially — a compact stepper beats a scroll wheel at this distance.
19. On submit, disable the button, POST, and on success insert the returned event into local state immediately, keyed by its Google event id so the next poll dedupes rather than duplicating.
20. On failure, keep the panel open with all fields intact and show the server's message inline. Never discard typed input on error.
21. Render countdown events with a day-count badge on the chip, plus a single-line strip above the grid showing the soonest upcoming countdown event only. One line, not a section.
22. Close the panel and discard any in-progress draft after 5 minutes of no interaction, consistent with the other views' idle reset.
23. Update the README's Security section to note that the device token now gates a write path to Google Calendar, and that calendar targets are allowlisted.

## Acceptance criteria

1. An event created from the wall appears in Google Calendar on a phone within a minute, on the chosen calendar.
2. That event's title, times, all-day flag, recurrence, and reminder are all correct in Google's own UI.
3. **Extended properties round-trip on a calendar the household account accesses via sharing, not just on ones it owns.** Create a tagged event on Maryann's calendar, wait for a full poll cycle, and confirm the tags come back. Verify this early — it is the one genuinely uncertain mechanism in this phase.
4. A two-member event renders as two hard-edged bands. A three-member event renders three. Four or more renders the "everyone" treatment.
5. A single-member event renders solid, and an untagged event renders in its owning calendar's color exactly as it did before this phase.
6. Events created before this phase still render correctly with no migration.
7. Tags and countdown are invisible in Google Calendar's web and mobile UI.
8. A recurring event created on the wall repeats correctly on a phone, honoring the end condition.
9. Countdown cannot be enabled while Repeats is on.
10. A reminder set on the wall fires on a subscribed phone.
11. Submitting with an empty title, an end before its start, a calendar not in the allowlist, or an unknown member key returns 400 with a specific message and preserves form state.
12. A POST naming a valid Google calendar that is absent from `CALENDAR_MAP`, or present but `writable: false`, is rejected.
13. Creating an event produces exactly one chip, not two, after the following poll.
14. Times land correctly with respect to `HOUSEHOLD_TIMEZONE` — verify with an event near midnight, which is where timezone errors surface.
15. All form controls are operable standing at the wall without a stylus or precision aim.

---

# Phase 2 — Clean & Chores

## Context

Two sidebar destinations built from one Tada! integration, with deliberately different philosophies. **Clean** is Maryann's guided cleaning session; **Chores** is the kids' checklist. Read D4 and D5 of the spec before writing code — the asymmetry between them is the most important design decision in the project, and it reads as an inconsistency if you don't understand why it exists.

This is the phase that brings the core of Tada! onto the wall: the focus session that surfaces the highest-decay task one at a time. That mechanism is the *anti*-list — it is what prevents the paralysis a backlog would cause (D4). Building it as a list, a queue, or a scoreboard rebuilds the exact problem Tada! was written to solve. Guide, don't list.

Both surfaces write. Task completion is no longer kid-only: Maryann completes her own tasks in the session. This is the phase where Hearth stops being read-only for tasks (D11).

## Locked decisions

- **Clean has two parts: the session and done-today.**
  - *The session* surfaces **one task at a time** — the single highest-decay task Tada! returns, optionally scoped to a room. No queue, no backlog, no remaining count, no "N of M," no "up next" beyond the one task on screen. (D4)
  - *Done-today* accumulates completions as they land: no total, no denominator, no progress bar, no percentage. (D4)
- **Chores shows each kid's outstanding chores and lets them check them off.** The asymmetry with Clean is intentional — kids have a tracking problem, not a paralysis problem, and their Tada! surface is already a list. (D5)
- **Tada! computes decay and picks the task. Hearth never ranks and never computes decay.** Do not render dirtiness ratios, decay bands, decay scores, or priority numbers anywhere. Show the task, not its score.
- **Completion is a scoped device-token write, for the kids and Maryann.** Limited to `complete_task`, written with `source="hearth"` to `CompletionLog`. The token may act on behalf of any household member who uses the wall; the acting member is fixed by the surface — Maryann for the Clean session, the column's kid for Chores — not chosen by a separate control (§6.3). This is a broader grant than the original kid-only write, and is acceptable only because the wall is a trusted in-home device (§5.3).
- **No streaks, badges, or stars.** Tada! owns reward state; this screen neither renders nor summarizes it.
- **The write list is closed at task completion for this phase.** Supplies flag-low is Phase 4; any other write is a spec amendment (D11).

## Manual setup

1. In Tada!, confirm or add device-callable endpoints for: the next task by decay with an optional room filter, the room list, today's completions for an adult, today's outstanding-and-completed chores per kid, and `complete_task`.
2. Create a Tada! device token scoped to those reads plus `complete_task`. It must be able to complete as **any household member who uses the wall — the kids and Maryann, not kids only**. Confirm it cannot create or delete task definitions, change settings, or touch reward state.
3. Decide the **acting-member allowlist**: the set of member ids the wall may complete as (the kids and Maryann's `HEARTH_ADULT_ID`). Anything outside it is rejected. Source it from config or a Tada! household read — do not hardcode ids in a component.
4. Set in Railway: `TADA_API_URL`, `TADA_DEVICE_TOKEN`, and `HEARTH_ADULT_ID` (Maryann's Tada! user id).
5. Resolve open question Q5: do Clean and Chores surface undo on a just-completed row, or are wall mistakes corrected on a phone? Answer before checklist item 14.

## Checklist

1. **Sidebar and routing.** Replace the single Phase 0 "Tasks" placeholder destination and its `/tasks` route with **two** destinations — **Clean** (`/clean`) and **Chores** (`/chores`) — each icon-over-label on the existing rail. The sidebar is now six items: Calendar, Clean, Chores, Lists, Meals, and the still-placeholder sixth (renamed to Shopping in Phase 4). Remove the `/tasks` route.
2. Build a Tada! client module using the device token, mirroring the Phase 1 Google client's token handling and error behavior.
3. Build `GET /api/tasks/next?room=<id>` returning the single next task for the session — `{ id, name, room }` — from Tada!'s decay selection. Do not expose the decay score. Omitting `room` means whole-house.
4. Build `GET /api/tasks/rooms` returning the rooms available to scope a session.
5. Build `GET /api/tasks/done-today` returning today's completions for `HEARTH_ADULT_ID`: task name, room, completion time.
6. Build `GET /api/tasks/kids` returning today's outstanding and completed chores per kid.
7. Build `POST /api/tasks/complete` accepting a task id and an acting-member id. After the device check and before any other work, validate the member against the allowlist from manual setup step 3; reject anything else with 403. Then call Tada!'s `complete_task` with `source="hearth"`.
8. Build the **Clean** view (`/clean`). A room picker across the top — "whole house" by default, plus one entry per room. Below it, the current session task rendered **large and alone**, with a single big complete target. No queue, no count, no "up next."
9. On completing the session task: fire `POST /api/tasks/complete` with `HEARTH_ADULT_ID` as the acting member, settle the task into a brief done state, then cross-fade in the next task (re-fetch `GET /api/tasks/next` for the current room). No list reflow.
10. Give Clean a **rest state**: when `next` returns no task for the scope, show a calm "all caught up" message (name the room when one is picked), not an error and not a reproach. An empty session is success.
11. Build the Clean **done-today** section: completions in reverse-chronological order, each showing name and time. No count, no "0 of N," no denominator, no progress bar.
12. Build the **Chores** view (`/chores`): one column per kid, headed by name and an avatar circle in the kid's member color. Each chore is a row with an icon, the chore name, and a large circular tap target.
13. On tapping a chore: optimistically settle the row into a completed state, then `POST /api/tasks/complete` with that column's kid as the acting member. On failure, revert the row and show a brief inline message on that row only — never a global error.
14. Implement the Q5 undo decision. If undo is in scope, surface a brief undo affordance on the just-completed row in **both** Clean and Chores — an adult mis-tap mid-session is at least as likely as a kid's — calling Tada!'s undo endpoint. If not, record the decision and its reasoning in a component comment.
15. Size every tap target for a hand (or a child) reaching up to a wall — larger than a phone target, with generous spacing to prevent adjacent mis-taps.
16. Poll the reads every 60 seconds via the Phase 0 upstream hook and wire a stale indicator on each surface. Additionally, re-fetch the session task immediately on completion and on room change — the session must not wait up to 60 seconds to advance.
17. On 5 minutes of no interaction, reset each view's transient state: Clean returns to the whole-house scope; Chores resets its scroll. The app's global resting route remains Calendar (Phase 1).
18. Verify no decay score, dirtiness ratio, decay band, priority number, streak, badge, or star appears anywhere in the rendered output of either view.

## Acceptance criteria

1. The sidebar shows **Clean** and **Chores** as separate destinations; the single "Tasks" item is gone; `/clean` and `/chores` route correctly.
2. Clean shows exactly **one** task at a time. No queue, remaining count, denominator, "up next," or decay score is visible anywhere in the view.
3. Picking a room scopes the surfaced task to that room; selecting "whole house" clears the scope.
4. Completing the Clean task writes to Tada! attributed to Maryann with `source="hearth"`, the task settles, and the next task appears without waiting for a full poll cycle.
5. When nothing is due for the current scope, Clean shows a calm rest state — not an error, not a reproach.
6. Clean's done-today lists today's completions and displays no number that could read as a total or a fraction.
7. Chores shows one column per kid containing only that kid's chores; tapping completes the chore and attributes it to the correct kid with `source="hearth"`.
8. A completion request naming a member outside the allowlist returns 403; requests for the kids and for Maryann succeed.
9. A completion made on a phone appears on the wall — in Clean's done-today or the right Chores column — within 90 seconds.
10. With the network down, a tap reverts its row and shows an inline message; the rest of the screen is unaffected.
11. Adjacent tap targets cannot both be triggered by a single reasonable finger press.
12. No streak, badge, star, dirtiness ratio, decay band, decay score, or priority number appears anywhere in either view.
13. If undo is in scope, an accidental completion can be undone from the just-completed row in both Clean and Chores.

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

# Phase 4 — Meals & Shopping

## Context

Two Enchanted Spoon surfaces, plus a Tada! supplies shelf that rides inside Shopping — combined into one phase because Meals alone is too thin to stand on its own. **Meals** is a read-only glance at the week's plan, with a tap-to-open recipe card. **Shopping** is a full read-write client of Enchanted Spoon's list, and it is the substantial half of this phase because it writes.

This phase replaces the original "Recipes" view. Recipe detail no longer lives in a standalone browsable grid; it now appears only as a meal's card inside Meals (D6, amended). "Recipes" as a sidebar destination goes away.

## Locked decisions

- **Meals is read-only** (D6). It shows the current week's plan and lets you tap a meal to open its card — ingredients and recipe, the same card Enchanted Spoon renders in its Meal Planner. It does not assign, swap, or edit meals; plan editing stays on the phone. No history, no future weeks beyond next.
- **Shopping is read-write to Enchanted Spoon** (D6, §5.5): check/uncheck, add, remove, edit. Enchanted Spoon is the single source of truth and holds all list logic. Hearth keeps no local copy, treats Enchanted Spoon's response as truth on every write, and does not attempt its own merge — a simultaneous edit is last-write-wins as Enchanted Spoon resolves it.
- **The Supplies shelf in Shopping reads and writes Tada!, not Enchanted Spoon** (§4.6). The roster is a Tada! read; flagging a supply low is **one** Tada! write. Tada!'s backend adds the flagged item to the Enchanted Spoon list. **Hearth makes no Enchanted Spoon write for a flagged supply** — one gesture, one upstream.
- **If Enchanted Spoon's shopping-list sync refactor is still in flight, stop and defer this phase** (D6). Do not integrate against a moving surface.

## Manual setup

1. Confirm Enchanted Spoon's shopping-list sync refactor has landed (Q7). If not, stop here — defer the whole phase, Meals included.
2. Confirm Enchanted Spoon device-callable endpoints for: the current-week meal plan, a meal's card (ingredients, recipe), the shopping-list read, and shopping-list item mutations (check/uncheck, add, remove, edit).
3. Confirm Tada! device endpoints for the supplies roster (read) and flag-low (write), **and that flagging low already adds the item to the Enchanted Spoon list in Tada!'s backend** (Q8). If Hearth would have to write to Enchanted Spoon itself to place a flagged supply, stop and revisit — that changes the design and this phase's shape.
4. Create an Enchanted Spoon device token scoped to the meal plan and card reads plus the shopping-list read and item mutations — nothing else. Extend the existing Phase 2 Tada! token's scope to include the supplies roster read and flag-low write.
5. Set in Railway: `ENCHANTED_SPOON_API_URL`, `ENCHANTED_SPOON_DEVICE_TOKEN`. (`TADA_*` are already set from Phase 2.)

## Checklist

1. **Sidebar and routing.** Replace the placeholder "Recipes" destination and its `/recipes` route with **Shopping** (`/shopping`), and bring **Meals** (`/meals`) live in place of its placeholder. The sidebar is now the full six: Calendar, Clean, Chores, Lists, Meals, Shopping. Remove the `/recipes` route and do not build a standalone recipes grid.
2. Build an Enchanted Spoon client module matching the pattern of the Tada! and Google clients — token handling server-side, error behavior consistent with them.
3. Build `GET /api/meals` returning the current week's plan: day, meal slot, meal name, and a card id where a recipe is linked.
4. Build `GET /api/meals/[id]` returning that meal's card: name, ingredients, recipe/instructions — the data Enchanted Spoon's Meal Planner card uses.
5. Build the **Meals** view (`/meals`): seven day-columns for the current week, today's column visually distinct, a calm empty state for unplanned days (not an error), and a next-week toggle — nothing beyond that.
6. Tapping a meal opens its card over the grid — ingredients and recipe at wall-readable type size, dismissed by tapping outside. Read-only.
7. Build `GET /api/shopping` returning the current list with its sections/categories and each item's state.
8. Build the shopping write handlers, each verifying the device token first and attaching the Enchanted Spoon token server-side (§3.2): add an item, check/uncheck and edit an item, remove an item. Each returns Enchanted Spoon's resulting state; the client re-renders from that response.
9. Build the **Shopping** view (`/shopping`): the list grouped by Enchanted Spoon's existing sections, each item a row with a large check target and wall-sized add/edit/remove controls. Apply writes optimistically, then reconcile against the handler's response; on conflict, Enchanted Spoon wins — no local merge, no lost update beyond one reconcile.
10. Build `GET /api/supplies` returning the Tada! supplies roster and which items are currently flagged low / already on the list.
11. Build `POST /api/supplies/flag` — flag one supply low via a single Tada! call. **Do not write to Enchanted Spoon in this handler.** The flagged item reaches the shopping list through Tada!'s backend and appears on the next `GET /api/shopping`.
12. Build the **Supplies shelf** below the list in the Shopping view: the roster as tap-to-flag-when-low chips, kept visually secondary to the list. A supply already flagged or already on the list is shown as such and not offered again until it's bought.
13. On flagging: optimistically mark the chip flagged, `POST /api/supplies/flag`; on failure, revert and show an inline message. Expect the resulting shopping-list item to appear on a following poll, not instantly — it's a Tada! backend add and may lag one cycle.
14. Verify Meals issues no write to Enchanted Spoon, and that the Supplies shelf writes only to Tada! — never to Enchanted Spoon.
15. Polling: poll Meals every 5 minutes (plans change slowly). Poll the shopping list and supplies roster every 60 seconds and re-fetch immediately after any write — a shared kitchen list is edited often, and a multi-minute lag between the wall and a phone is the annoyance this view exists to remove. Wire stale indicators.
16. On 5 minutes of no interaction: close any open meal card, reset Meals to the current week, and reset the Shopping scroll position.

## Acceptance criteria

1. The sidebar shows **Shopping**, not Recipes; `/shopping` routes; the `/recipes` route and any standalone recipes grid are gone; Meals is live at `/meals`.
2. The Meals view matches Enchanted Spoon's current-week plan exactly; today's column is distinct; unplanned days render calmly.
3. Tapping a meal opens its card with ingredients and recipe, readable from six feet; the card offers no editing.
4. Changing the plan on a phone appears on the wall within about six minutes.
5. The Shopping list matches Enchanted Spoon, grouped by its own sections.
6. Checking, adding, editing, or removing an item on the wall writes to Enchanted Spoon and shows on a phone within a poll; the reverse also holds.
7. Two near-simultaneous edits resolve to Enchanted Spoon's state, with no duplicate or lost update on the wall beyond one reconcile.
8. Tapping a low supply flags it in Tada! and the item appears on the shopping list within a poll or two. Hearth issues exactly one write — to Tada! — and **no** Enchanted Spoon write for that action; verify in the handler/network logs.
9. An already-flagged supply is not offered again until it's bought or removed.
10. Meals writes nothing to Enchanted Spoon, and the Supplies shelf writes nothing to Enchanted Spoon (only Tada!). Verify by reviewing every route handler added in this phase.
11. With the network down, a shopping write reverts its row or control with an inline message; the rest of the screen is unaffected.
12. Neither the Enchanted Spoon token nor the Tada! token appears in any client bundle.

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