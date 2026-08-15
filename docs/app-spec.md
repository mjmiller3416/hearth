# Hearth — Household Wall Display

**Status:** Draft spec, pre-build
**Date:** August 2026
**Working name:** Hearth (placeholder — rename freely, it appears nowhere user-facing except the PWA manifest)

---

## 1. What this is

A wall-mounted, always-on display that surfaces the household's shared information in one place: the family calendar, Tada!'s tasks and lists, and MealGenie's meal plan and recipes.

It is **not** a fourth app in the household suite. MealGenie and Tada! own real data and real logic. Hearth owns almost nothing. It is a view layer — a frontend that reads three APIs and renders them for a screen six to ten feet away.

This distinction is the single most important thing in this document. Every time a feature request implies Hearth should store, decide, or compute something, that is a signal the feature belongs in Tada! or MealGenie instead.

### 1.1 Why it exists

The household currently runs a Skylight Calendar in the living room. Of its seven features (Calendar, Lists, Tasks, Rewards, Meals, Recipes, Photos), exactly one is in use: the calendar. Everything else duplicates — worse — what Tada! and MealGenie already do correctly for this family.

Hearth replaces the parts that are wrong while keeping the part that works.

### 1.2 What it is not

- Not a task manager. Tada! is.
- Not a meal planner. MealGenie is.
- Not a calendar application. Google Calendar is.
- Not a phone app. The phone surfaces already exist and are better.
- Not a place where new household logic gets written.

---

## 2. Locked decisions

These are settled. A future build session should not relitigate them without an explicit spec amendment.

**D1 — Hearth has no database.**
No schema, no migrations, no ORM. Configuration lives in environment variables. If a phase appears to need persistence, stop and reconsider whether the state belongs in Tada! or MealGenie.

**D2 — Google Calendar is the system of record. Hearth may create events.**
*(Amended in Phase 1.5 — was "…for events. Hearth does not build a calendar. It reads one.")*
Hearth does not build a calendar, does not store events, and does not maintain its own copy of anything. Google holds the data; phones use the Google Calendar app; widgets and notifications come from Google for free. This is driven by a hard platform constraint: PWAs cannot provide home screen widgets on either iOS or Android. A custom calendar would mean no phone widget, or two native apps. Google Calendar already ships widgets, notifications, natural-language entry, voice assistants, and offline support on both platforms — at zero build cost.

What changed: Hearth is now a read-write client for **event creation only**. It may not edit or delete events. Editing a recurring event opens the this-instance / this-and-following / all-events question, plus conflict handling when two people edit at once, and none of that is what a wall display is for. Corrections happen on a phone.

**D3 — Event color comes from member tags, falling back to the owning calendar.**
*(Amended in Phase 1.5 — was "…determined by the owning calendar, not by attendee assignment," with no tagging feature.)*
The original decision — color determined solely by which calendar owns the event — was correct for a read-only display and is wrong now that events can be created here. Its load-bearing use case was Maryann creating Lincoln's appointment directly on Mitchell's calendar so it rendered green. That worked, but it conflates two separate ideas: where an event lives, and who it concerns.

The replacement separates them:

- **Where it lives** is the Google calendar the event is written to. Selected at creation.
- **Who it concerns** is a set of Hearth member tags stored on the event.

An event tagged with two members renders half-and-half (hard-edged bands, not a blend). Untagged events fall back to their owning calendar's color, which is exactly the Phase 1 behavior — so every event that already exists keeps rendering the way it does today, and there is no backfill.

Tags are stored in `extendedProperties.private` on the Google event. This is arbitrary key/value data that Google persists, returns on read, and never displays in its own UI. It behaves like an internal tag while requiring no database and no sync layer — which is why it does not violate D1.

**D4 — Maryann's task tab shows what is done, not what is left.**
This is the most consequential design decision in the project and the one most likely to be quietly reversed by a well-meaning future change.

Tada! exists because a list of everything that needs doing produces paralysis. Its core principle is *guide, don't list* — one task at a time, via focus session. A wall display is inherently a list. Putting Maryann's ranked task queue on the living room wall rebuilds the exact problem the app was written to solve, and makes it unavoidable.

So her tab mirrors the existing done-today view: accumulation only, no denominator, no queue, no "next up." The wall celebrates. The phone guides.

**D5 — The kids' tab shows what is left, and they can check it off there.**
The asymmetry is intentional and is not an inconsistency. The kids' surface inside Tada! is already a list — they don't have the paralysis problem, they have a tracking problem, and a chore list you can't check off is just nagging. The wall becomes their primary surface so they stop tracking on their phones.

This is the one write in the system. See §5.3.

**D6 — MealGenie integration is read-only.**
Meals shows the current week's plan. Recipes shows saved recipes. Neither writes. Adding a recipe to the meal plan from the wall is explicitly out of scope — the moment Hearth writes to MealGenie it needs real per-user auth, and it stops being a display.

**D7 — Test on spare hardware before touching the Skylight.**
Hearth is a URL. It runs in any browser. Build it, run it on a spare tablet or a leftover browser tab for two weeks, and find out whether a wall display is something this house uses or something that seemed good at 7am walking past the couch. Hardware comes last, in Phase 5, and only if the thing earns its place.

**D8 — If the Skylight is used, disable the launcher. Never wipe or flash it.**
There are no public firmware images for these devices and Skylight support declines to provide them. A failed flash is an unrecoverable brick. `pm disable-user com.skylight` is reversible with one command; a bad `dd` is not.

**D9 — Reminders are per-calendar, and that imprecision is accepted.** *(Added in Phase 1.5.)*
Google fires reminders to everyone subscribed to the owning calendar with notifications enabled, not to the tagged members. A reminder on Lincoln's appointment pings the whole household.

The alternative — using real Google attendees instead of extended properties — would notify each person individually and correctly, but generates invitation emails and RSVP prompts for every piece of family logistics, and requires email addresses for the kids. Too noisy for the value. Accepted as-is. If it becomes annoying in practice, switching the tag mechanism from extended properties to attendees is a contained change to the read and write paths, not a redesign.

**D10 — Countdown is a Hearth-only flag.** *(Added in Phase 1.5.)*
Stored as an extended property, rendered by Hearth, ignored by Google. Countdown and repeat are mutually exclusive: counting down to a recurring event means counting to the next occurrence, which is a different feature and not this one.

---

## 3. Architecture

### 3.1 Shape

```
                    ┌──────────────────────┐
                    │   Hearth frontend    │
                    │  Next.js on Railway  │
                    │   (no database)      │
                    └──────────┬───────────┘
                               │  reads
             ┌─────────────────┼─────────────────┐
             │                 │                 │
   ┌─────────▼──────┐ ┌────────▼────────┐ ┌──────▼───────┐
   │ Google Calendar│ │    Tada! API    │ │ MealGenie API│
   │      API       │ │                 │ │              │
   │  (4 calendars, │ │ tasks · lists   │ │ meal plan ·  │
   │  1 household   │ │ · completions↑  │ │   recipes    │
   │   OAuth token) │ │                 │ │              │
   └────────────────┘ └─────────────────┘ └──────────────┘
```

Consistent with the existing stack: Next.js frontend, Railway deploy, single-branch auto-deploy. No FastAPI backend of its own — Next.js route handlers are sufficient and keep secrets server-side.

### 3.2 Why route handlers, not client-side fetching

All three upstream APIs need credentials. Those credentials must never reach the browser, because the browser in question is a wall-mounted tablet in a living room that guests walk past. Every upstream call goes through a Next.js route handler that holds the token server-side and returns only the shaped data the view needs.

This also gives a natural place to implement the stale-data behavior in §6.2.

### 3.3 Deployment

One new Railway service in the existing project. Environment variables only — no volume, no database attachment.

---

## 4. Views

The sidebar is the whole navigation model. Five destinations, matching the mental model the household already has from the Skylight.

| View | Source | Phase | Writes? |
|---|---|---|---|
| Calendar | Google Calendar API | 1 | No |
| Tasks | Tada! | 2 | Yes (kids only) |
| Lists | Tada! | 3 | No |
| Meals | MealGenie | 4 | No |
| Recipes | MealGenie | 4 | No |

### 4.1 Calendar

Month view as the default (matches current habit — see the existing Skylight usage). Week view as a secondary toggle if it earns itself; do not build day view.

Each event renders with a color stripe or fill keyed to its owning calendar. Person chips across the top act as filters, same interaction the household already knows.

Today is visually distinct. Past days are dimmed, not hidden.

### 4.2 Tasks

Two tabs.

**Maryann** — done today. Completed tasks accumulate as they land, no total, no progress bar, no denominator. A denominator turns a reward into a scoreboard. Empty state is an invitation, not a reproach.

**Kids** — one column per kid, showing today's assigned chores with a tap target to mark complete. Tapping writes to Tada! and the row settles into a done state. No streak display, no badges, no stars — Tada! owns reward state and it is not this screen's job to render or duplicate it.

### 4.3 Lists

Tada!'s lists, read-only, showing item counts and contents. Respects Tada!'s `kind` field and section structure. Does not offer add/edit — that happens on a phone where typing works.

### 4.4 Meals

The current week's meal plan from MealGenie. Meal name and day. No recipe detail view, no ingredients, no nutrition. This is a "what's for dinner" glance, not a cooking surface.

### 4.5 Recipes

Saved recipes from MealGenie as a scannable grid. Tapping opens name, ingredients, and instructions in a readable panel. Read-only per D6.

---

## 5. Integration contracts

### 5.1 Google Calendar

**Setup:** Create a dedicated household Google account. Share all four family calendars into it with read access. Run the OAuth consent flow once; store the resulting refresh token in Railway.

One token, not four. One consent flow, not four.

**Reading:** `events.list` with `syncToken` for incremental polls. Poll every 60 seconds.

**Do not use secret iCal URLs.** Google's iCal feeds can lag by hours, which breaks the case that matters most — Maryann adds an appointment and expects to see it on the wall within a minute.

**Color mapping:** a static map in config from calendar ID to display color. Four entries. Not a database table.

### 5.2 Tada! — reads

Needs endpoints for:
- Today's completions for a given adult (done-today view)
- Today's assigned tasks for a given kid
- Lists with items

These may already exist for the app's own frontend. If they do, reuse them. If they need a device-scoped variant, that is a small additive change in Tada! at an existing seam — not a rewrite.

### 5.3 Tada! — the one write

Kid task completion. This is the only write in the system and deserves narrow scoping:

- A device token distinct from user auth, stored in Hearth's environment
- Scoped to `complete_task` only — no create, no delete, no settings
- Scoped to kid accounts only — the device can never complete a task as Maryann or Mitchell
- Completions written with `source="hearth"` so they are distinguishable in `CompletionLog`

The `source` field already exists on `CompletionLog`. This is additive at a seam that is already there — the same pattern used for the reward system.

**Undo interaction:** Phase 9 of Tada! adds undo for accidental completions, scoped to today, surfaced in the completion toast and in Done Today. A tap on the wall is *more* likely to be accidental than a tap on a phone. Hearth should either surface the same undo affordance on the kids' tab, or explicitly accept that wall mistakes get corrected on a phone. Decide this during Phase 2; do not leave it implicit.

### 5.4 MealGenie

Read-only. Current week's plan; saved recipes. If MealGenie's in-flight shopping-list sync refactor is still moving when Phase 4 starts, delay Phase 4 rather than integrating against a shifting surface.

---

## 6. Display constraints

A wall display is not a small phone. The constraints are genuinely different and should drive the design rather than being retrofitted.

### 6.1 Physical

- **Read distance:** six to ten feet. Body text that works at arm's length is illegible here. Set the minimum type size by walking across the room and looking, not by picking a number.
- **Touch only.** No hover states, no right-click, no keyboard. Every target sized for a hand reaching up to a wall, not a thumb on a phone.
- **Landscape, fixed.** Confirm the target device's actual resolution in Phase 0 and design to it. Do not build a responsive system for a screen that will never change size.
- **Always on.** Static elements in fixed positions for sixteen hours a day. Prefer light backgrounds over large flat dark fields, and avoid a permanently bright element in one fixed spot.
- **Ambient first.** Most interactions with this screen are a two-second glance from across the room, not a session. Optimize for the glance.

### 6.2 Failure behavior

A wall display showing a stack trace is worse than one showing yesterday's data. Every view degrades the same way:

1. Keep the last known good render.
2. Mark it quietly stale — a small timestamp, not a red banner.
3. Retry on the normal poll interval.
4. Never blank the screen, never show a raw error, never require a tap to recover.

If Hearth cannot reach Tada! for an hour, the wall should show the last hour-old data with a subtle "as of 8:14" and nothing more dramatic than that.

### 6.3 No login

Nobody logs into a wall. Authentication is a long-lived device token in the environment. There is no session, no timeout, no PIN prompt.

---

## 7. Design direction

Suggested, not locked — revise to taste before Phase 0.

**Concept: a household ledger, not a dashboard.** The failure mode for this kind of screen is looking like a startup analytics page: cards, pills, progress rings, accent gradients. This is a living room. It should read like something that belongs on a wall next to family photos.

- **Palette:** a warm neutral ground with the four member colors as the only saturated elements on screen. Member color is the primary information channel — everything else stays quiet so the colors carry meaning. Reserve saturation entirely for people.
- **Type:** one characterful face for dates, day names, and headings, set large; one clean face for everything else. The date should be the most confident thing on the calendar view.
- **Structure:** generous whitespace, hairline rules rather than card borders and shadows. At six feet, borders read as noise and space reads as organization.
- **Motion:** almost none. Content updates should cross-fade rather than slide or pop. Anything that moves in peripheral vision all day becomes an irritant by week two.
- **Signature:** the member color system itself — used consistently and exclusively across calendar events, task columns, and list ownership, so the whole display can be parsed by color before a single word is read.

---

## 8. Open questions

Resolve these before or during the phase noted.

| # | Question | Phase |
|---|---|---|
| Q1 | Target device resolution and physical size | 0 |
| Q2 | Do Tada!'s existing endpoints cover the three reads in §5.2, or do device-scoped variants need adding? | 0 |
| Q3 | Does Tada! have a token type suitable for §5.3's scoped device write, or does one need creating? | 0 |
| Q4 | Does MealGenie expose a readable meal-plan endpoint for the current week? | 3 |
| Q5 | Does the kids' tab surface undo, or are wall mistakes corrected on a phone? | 2 |
| Q6 | Does the Skylight unit reach Android developer options at all? (Ten minutes with a USB cable answers this and is worth doing early, independent of everything else.) | 5 |

---

## 9. Phase map

| Phase | Scope | New sidebar item |
|---|---|---|
| 0 | Shell, routing, device auth, Railway deploy | — |
| 1 | Calendar view + Google integration | Calendar |
| 2 | Tasks view — both tabs, kid completion write | Tasks |
| 3 | Lists view | Lists |
| 4 | Meals + Recipes | Meals, Recipes |
| 5 | Hardware deployment and kiosk configuration | — |

One new sidebar item per phase, with Phase 4 as the deliberate exception — Meals and Recipes are both thin MealGenie reads and splitting them would create a phase with almost nothing in it.

Phase 5 is conditional on the two-week trial from D7 going well. If the household doesn't use it, the correct outcome is to stop after Phase 4 and leave the Skylight alone.