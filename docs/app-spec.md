# Hearth — Household Wall Display

**Status:** Living spec — reconciled with the codebase (per-member calendar rework + Settings, August 2026)
**Date:** August 2026
**Working name:** Hearth (placeholder — rename freely, it appears nowhere user-facing except the PWA manifest)
**Names:** the meal planner is **Enchanted Spoon** (earlier drafts called it "MealGenie" — same app).

**Build status at a glance.** Phase 0 (shell, device auth, deploy) and Phase 1 (Calendar) are built. Phase 1.5 grew the calendar into a full read-write client — **create, edit, and delete** — on a **per-member-calendar** model, and added the **Settings** surface with customizable member colors. Phase 2 (Clean & Chores) is built and verified **against a mock**; the live Tada! integration is blocked on device-scoped endpoints Tada! does not yet expose (§5.2–5.3, `docs/tada-integration-requirements.md`). Phases 3 (Lists) and 4 (Meals + Shopping) are unbuilt placeholders. Where this document once said "create only" and "no database," the sections below record what the code actually does and why the boundary still holds.

---

## 1. What this is

A wall-mounted, always-on surface for the household's shared information in one place: the family calendar, Tada!'s cleaning and lists, and Enchanted Spoon's meal plan and shopping list.

It is **not** a fourth app in the household suite. Tada! and Enchanted Spoon own real data and real logic. Hearth owns none of it. It is a **client** — a second frontend, co-equal with the phone, that reads and writes three APIs and renders them for a screen six to ten feet away and a hand reaching up to it.

This is a change from the original framing. Hearth began as a read-only *display*; it is now an interactive *client* the family can run Tada! and Enchanted Spoon from without picking up a phone. What did **not** change is the ownership boundary: Hearth holds no household data (D1) and decides nothing. Decay ranking, "what to clean next," room logic, reward state, meal plans, shopping-list math — all of it is computed upstream. Hearth triggers and renders; it never computes or decides.

That boundary is the single most important thing in this document. Every time a feature request implies Hearth should **store household data, decide, or compute** something, that is a signal the logic belongs in Tada! or Enchanted Spoon and only its *result* belongs here. "Interactive" widened what Hearth can *trigger*; it did not widen what Hearth may *own*. (The one narrow thing Hearth does now persist for itself — a shared display preference, the family colors — holds no household data and no logic; see D1 and D12.)

### 1.1 Why it exists

The household currently runs a Skylight Calendar in the living room. Of its seven features (Calendar, Lists, Tasks, Rewards, Meals, Recipes, Photos), exactly one is in use: the calendar. Everything else duplicates — worse — what Tada! and Enchanted Spoon already do correctly for this family.

Hearth replaces the parts that are wrong and, where the household wants it, brings the parts that work — Tada!'s cleaning guidance, Enchanted Spoon's shopping list — onto the wall itself rather than only mirroring them. The wall keeps the calendar that already works and becomes a place you can *act*, not only look.

### 1.2 What it is not

- Not the task engine — Tada! is. Hearth is one of its windows.
- Not the meal planner — Enchanted Spoon is. Hearth is one of its windows.
- Not a calendar application. Google Calendar is.
- Not a replacement for the phone apps, and not their inferior twin either — the same clients, on the wall, for when your hands are full and your phone isn't.
- Not a place where new household logic gets written.

---

## 2. Locked decisions

These are settled. A future build session should not relitigate them without an explicit spec amendment. Several carry an **amendment history** — the record of how a decision moved as the wall went from display to client, and (in D2/D3) as the calendar's storage model was reworked. Read the amendments; they are the reasoning, not footnotes.

**D1 — Hearth has no database. Its only persisted state is one shared preference file.**
*(Amended in the client rework — was "no database … configuration lives in environment variables," full stop.)*
No schema, no migrations, no ORM, no household data at rest. Configuration lives in environment variables. The **one** exception is a single small JSON file holding the customizable family colors (D12): a shared *display preference*, not household data and not logic — it decides nothing and nobody's calendar, task, or list depends on it. It lives at `HEARTH_DATA_DIR` (a Railway volume, so it survives redeploys and every device reads the same colors) and degrades to in-process memory when no volume is set. If a phase appears to need persistence for anything *else*, stop and reconsider whether the state belongs in Tada! or Enchanted Spoon. A client that can *trigger* an upstream write is not a store — see D11.

**D2 — Google Calendar is the system of record. Hearth may create, edit, and delete events.**
*(Amended twice. Phase 1.5 first: "…does not build a calendar. It reads one." → "Hearth may create events." Client/per-member rework second: create-only → **create, edit, and delete**, with recurring events the one carve-out.)*
Hearth does not build a calendar and maintains no copy of anything. Google holds the data; phones use the Google Calendar app; widgets and notifications come from Google for free. This is driven by a hard platform constraint: PWAs cannot provide home-screen widgets on iOS or Android, so a custom calendar would mean no phone widget or two native apps. Google already ships widgets, notifications, natural-language entry, voice assistants, and offline support on both platforms — at zero build cost.

What changed, and why the create-only line was loosened: the original amendment forbade edit and delete because editing a *recurring* event opens the this-instance / this-and-following / all-events question, plus multi-editor conflicts, and none of that is what a wall is for. The resolution keeps that carve-out and nothing more:

- **Non-recurring events can be created, edited, and deleted from the wall** — including events made on a phone (they are allowlisted against the calendars Hearth reads and re-checked server-side; a synthetic wall id is never accepted).
- **Recurring events are read-only on the wall.** Attempting to edit or delete one returns "Edit repeating events on your phone." The series question stays where it belongs.
- **Conflicts are last-write-wins** as Google resolves them. Hearth attempts no merge and holds no copy to reconcile.

**D3 — Assignment decides both an event's color and where it lives (per-member calendars; fan-out on write, de-dup on read).**
*(Amended twice, and this is the larger of the two calendar reworks. Phase 1: "color determined by the owning calendar." Phase 1.5: "color from member tags on a chosen calendar, stored in `extendedProperties.private`; two members render half-and-half." Per-member rework: the "which calendar" picker is **gone** — assignment now determines the calendars too.)*

The load-bearing idea survives untouched: **member color is the primary information channel, and a shared event reads as color bands.** What changed is the storage model beneath it.

- **Each member owns their own Google calendar.** There is no calendar picker. "Where an event lives" is *derived from* "who it concerns."
- A **whole-family event** ("Family" — the default assignment, everyone) is **one** event on the shared family calendar, and renders in the family/"everyone" color.
- An event assigned to a **subset** of members fans out into **one copy per assignee's own calendar**, all linked by a shared `hearthGroupId`. The wall reads every member calendar plus the family calendar and **de-dups the copies back into one banded chip** (hard-edged bands, not a blend — up to three; four or more collapse to the single "everyone" treatment). Because each copy lives on its assignee's own calendar, it inherits that person's real Google color natively on their phone — the wall and the phone agree without Hearth forcing a per-event color.
- **Editing an assignment re-reconciles the fan-out:** copies that should stay are patched, missing ones are created, and only then are the ones that should no longer exist deleted (the event is never deleted into nothing). Deleting removes every copy by its `hearthGroupId`.
- **Untagged events fall back to their owning calendar's color** — a member's own event reads in their color, an untagged event on the family calendar reads "everyone." This is exactly the Phase 1 behavior, so every pre-existing and phone-made event keeps rendering the way it does today, with no backfill.

Hearth's own metadata — `hearthGroupId`, `hearthMembers`, `hearthCountdown`, `hearthOwner` — rides in `extendedProperties.private`: arbitrary key/value data Google persists, returns on read, and never shows in its own UI. It behaves like an internal tag while requiring no database and no sync layer, which is why the fan-out does not violate D1.

Member colors are no longer hard-locked to a person. Defaults are set in `globals.css` / the `MEMBERS` config, and every member color (plus the family color) is **customizable at runtime in Settings** (D12).

**D4 — Maryann's surface guides one task at a time; it never shows the backlog.**
*(Amended in the client rework — was "shows what is done, not what is left," from when the wall was display-only. The amendment sharpens this decision; it does not loosen it.)*
This is the most consequential design decision in the project and the one most likely to be quietly reversed by a well-meaning future change.

Tada! exists because a list of everything that needs doing produces paralysis. Its core principle is *guide, don't list* — one task at a time, surfaced by decay, via focus session. The original decision protected that principle by keeping Maryann's tab to done-today only, reasoning that "a wall is a list, so any undone task on the wall rebuilds the paralysis."

That reasoning was half right. The enemy is the **list**, not the **presence of an undone task**. The focus session is the *anti*-list: it shows one thing — the task decaying fastest, optionally scoped to the room she is standing in — and nothing else. Bringing *that* to the wall is bringing the cure, not the disease. It is the single feature that made Tada! worth building, and running it from the wall is exactly what "use Tada! solely from Hearth" means.

So Maryann's surface — the **Clean** view (§4.2) — has two parts:

- **The session.** The next task by decay, one at a time, with a room picker. Complete it, the next fades in. This is a write (§5.3). Tada! chooses the task; Hearth only renders and completes.
- **Done today.** The celebration, unchanged: completed tasks accumulate as they land — no denominator, no progress bar, no percentage.

What stays permanently forbidden, and is the real content of this decision: **no ranked backlog, no full to-do list, no denominator, no "N remaining," no "up next" beyond the one current task.** If a change to the Clean view makes the *quantity* of undone work visible, that change is wrong no matter how much empty space it fills. The wall guides and celebrates. It never tallies what's left.

**D5 — The Chores view shows what is left, and the kids can check it off there.**
*(Amended in the client rework — the kids' view is now its own sidebar item, "Chores," and completion is no longer the *only* write. See D11.)*
The asymmetry with Maryann's surface is intentional and is not an inconsistency. The kids' surface inside Tada! is already a list — they don't have the paralysis problem, they have a tracking problem, and a chore list you can't check off is just nagging. The wall becomes their primary surface so they stop tracking on their phones.

Kid completion is one of Hearth's write paths, and the original one. It now shares its mechanism with Maryann's session completions (§5.3) rather than standing alone.

**D6 — Enchanted Spoon: Meals is read-only; Shopping List is read-write.**
*(Amended in the client rework — was "MealGenie integration is read-only"; the "Recipes" view is replaced by "Shopping List." Note: the running app still shows a placeholder labeled "Recipes" — the rename lands when Phase 4 builds the view; see §4.)*

- **Meals** shows the current week's plan and lets you tap a meal to open its card — ingredients and recipe — the same Meal Planner view Enchanted Spoon already renders. Read-only. Editing the plan (assigning or swapping meals) stays on the phone; the wall reads the plan and reads recipe detail, nothing more.
- **Shopping List** is a full read-write client of Enchanted Spoon's list: check items off, add, remove, edit — live-synced. Enchanted Spoon remains the single source of truth and holds all list logic; every change writes straight to its backend. This is a deliberate exception to the old read-only rule, and it is safe precisely because Enchanted Spoon was built to receive these writes — Hearth still stores and computes nothing.

What remains out of scope: writing to the **meal plan** itself. Assigning recipes to days needs per-user planning judgment that belongs on the phone. Reading the plan and its cards does not.

**D7 — Test on spare hardware before touching the Skylight.**
Hearth is a URL. It runs in any browser. Build it, run it on a spare tablet or a leftover browser tab for two weeks, and find out whether a wall display is something this house uses or something that seemed good at 7am walking past the couch. Hardware comes last, in Phase 5, and only if the thing earns its place.

**D8 — If the Skylight is used, disable the launcher. Never wipe or flash it.**
There are no public firmware images for these devices and Skylight support declines to provide them. A failed flash is an unrecoverable brick. `pm disable-user com.skylight` is reversible with one command; a bad `dd` is not.

**D9 — Reminders are per-calendar, and that imprecision is accepted — but the per-member fan-out narrows its blast radius.** *(Added in Phase 1.5; amended in the per-member rework.)*
Google fires reminders to everyone subscribed to the owning calendar with notifications enabled, not to a set of tags. Under the earlier single-calendar model this meant a reminder on Lincoln's appointment pinged the whole household. Under the per-member fan-out (D3), an assigned event's copy lives on **each assignee's own calendar**, so its reminder lands with that person — closer to correct for free. A **whole-family** event on the shared family calendar still notifies everyone subscribed, and that residue is accepted.

The alternative — real Google attendees instead of extended properties — would notify each person individually and correctly, but generates invitation emails and RSVP prompts for every piece of family logistics and needs email addresses for the kids. Too noisy for the value. Accepted as-is; switching the mechanism later is a contained change to the read and write paths, not a redesign.

**D10 — Countdown is a Hearth-only flag.** *(Added in Phase 1.5.)*
Stored as `hearthCountdown` in `extendedProperties.private`, rendered by Hearth (the countdown strip on the calendar), ignored by Google. Countdown and repeat are mutually exclusive — counting down to a recurring event means counting to the next occurrence, a different feature — and the create/edit path rejects a request that sets both.

**D11 — Hearth is a client, not a display. It writes.** *(Added in the client rework; write list extended by the calendar rework.)*
The wall is a full interactive surface for the calendar, Tada!, and Enchanted Spoon, co-equal with the phone — the family can manage events, run cleaning sessions, check off chores, flag low supplies, and manage the shopping list without picking up a device. Every write goes straight to the owning upstream; Hearth keeps no local state and reconciles nothing (the color file in D1/D12 is a display preference, not a write to household data). This does not weaken D1: the difference between a display and a client is whether it can *trigger* upstream actions, not whether it *holds* household data.

The write actions are a deliberately short, closed list:

- **Event create, edit, and delete** (Google Calendar, D2 — non-recurring only).
- **Task completion and its undo** (Tada!, D4/D5).
- **Supply flag-low** (Tada! — a *single* Tada! write; its effect on the Enchanted Spoon shopping list is Tada!'s own backend fan-out, not a second write Hearth makes, §4.6/§5.3).
- **Shopping-list items** — check, add, remove, edit (Enchanted Spoon, D6).
- **Color settings** — the shared display preference (D12), the only write that lands in Hearth's own file rather than an upstream.

Any write beyond this list is a spec amendment, not a small addition. This note is the record of every time it has grown.

**D12 — Family colors are customizable, and that preference is Hearth's one piece of persisted state.** *(Added in Phase 2.)*
Member color is load-bearing (D3, §7), so the household can tune it. The Settings view (§4.7) lets anyone recolor each member — and the shared "Family" color — from a fixed set of swatches. The choice is written to the single shared file in D1 (`HEARTH_DATA_DIR`) and injected as CSS custom-property overrides at first paint on every device, so the wall and a phone/laptop always agree and there is no recolor flash. This is the deliberate, bounded exception to "no persistence": it holds a preference, not household data, and nothing computes on it. Swatch set, the write path, and the fallback-when-no-volume behavior are all fixed; widening this file to hold anything else is a spec amendment.

---

## 3. Architecture

### 3.1 Shape

```
                    ┌──────────────────────┐
                    │   Hearth frontend    │
                    │  Next.js on Railway  │
                    │  (no DB; one shared  │
                    │   colors file only)  │
                    └──────────┬───────────┘
                               │  reads + writes
             ┌─────────────────┼──────────────────┐
             │                 │                  │
   ┌─────────▼──────┐ ┌────────▼────────┐ ┌───────▼────────┐
   │ Google Calendar│ │    Tada! API    │ │ Enchanted Spoon│
   │      API       │ │  (mock-first —  │ │      API       │
   │ per-member cals│ │  endpoints not  │ │  meal plan ·   │
   │  + shared fam; │ │  yet live) ·    │ │  cards (read) ·│
   │  1 household   │ │ clean session · │ │  shopping ↕    │
   │  OAuth token;  │ │ rooms · lists · │ │                │
   │ create/edit/   │ │ completions ·   │ │                │
   │ delete ↕       │ │ supplies ↕      │ │                │
   └────────────────┘ └─────────────────┘ └────────────────┘
```

Consistent with the existing stack: Next.js (16, App Router) frontend, Railway deploy from a Dockerfile, single-branch auto-deploy. No FastAPI backend of its own — Next.js route handlers are sufficient and keep secrets server-side.

### 3.2 Why route handlers, not client-side fetching

All three upstream APIs need credentials that must never reach the browser, because the browser in question is a wall-mounted tablet in a living room that guests walk past. Every upstream call goes through a Next.js route handler that holds the token server-side and returns only the shaped data the view needs. This applies to writes as well: event create/edit/delete, task completions, and shopping-list mutations post to Hearth route handlers, which attach the credential server-side and forward to the upstream — the browser never sees a token or calls Google/Tada!/Enchanted Spoon directly.

Authorization is enforced in the route and page logic, **not** in middleware. There is deliberately no `middleware.ts`/`proxy.ts`: App Router middleware can be bypassed by crafted `.rsc` and segment-prefetch URLs that resolve to the same route without matching the middleware rule (CVE-2026-44575 / -45109). The `app/(protected)/layout.tsx` server component gates every page (its check runs during RSC render, covering the `.rsc` variants); every route handler calls `requireDevice()` as its first statement, before parsing a body. This also gives a natural place to implement the stale-data behavior in §6.2.

### 3.3 Deployment

One Railway service in the existing project. Environment variables carry all configuration and secrets. The single new piece of infrastructure is an **optional persistent volume** mounted at `HEARTH_DATA_DIR`, which holds only the shared colors file (D1/D12); with no volume, colors fall back to in-process memory and simply reset on redeploy. No database, no ORM, no schema.

---

## 4. Views

The sidebar is the whole navigation model. It carries **six content destinations** — the Skylight's familiar set, split so each person's surface stands on its own (Maryann's **Clean**, the kids' **Chores**) and with **Recipes** slated to become the **Shopping** list the household actually uses (D6) — plus a **Settings** affordance anchored at the bottom of the rail (§4.7).

Two notes on where the code sits today:

- The sixth content view still renders a placeholder labeled **"Recipes."** It is renamed to **Shopping** when Phase 4 builds it; until then the sidebar shows "Recipes," and this table lists the destination by its Phase-4 name.
- **Clean** and **Chores** are built but run against a mock — see the status column and §5.2–5.3.

| View | Source | Phase | Writes? | Built? |
|---|---|---|---|---|
| Calendar | Google Calendar API | 1 · 1.5 | Create, edit, delete — non-recurring (D2) | ✅ |
| Clean | Tada! | 2 | Yes (task completion + undo) | ✅ mock-only |
| Chores | Tada! | 2 | Yes (task completion + undo) | ✅ mock-only |
| Lists | Tada! | 3 | No | ⬜ placeholder |
| Meals | Enchanted Spoon | 4 | No | ⬜ placeholder |
| Shopping *(shown as "Recipes")* | Enchanted Spoon · Tada! | 4 | Yes (list items → Enchanted Spoon; supply flags → Tada!) | ⬜ placeholder |
| Settings | Hearth (colors file) | 2 | Yes (color preference, D12) | ✅ |

The whole chrome and every view are authored on a fixed **1920×1080** canvas and scaled to fit the viewport by a `<Stage>` wrapper — one drawn resolution, fitted, never reflowed (§6.1).

### 4.1 Calendar

Month view as the default (matches current habit — see the existing Skylight usage). Week view is a secondary toggle; there is no day view.

Each event renders with color bands keyed to the members it concerns (D3): one member fills the chip solid, two or three render as hard-edged bands, four or more collapse to the single "everyone" treatment; an untagged event falls back to its owning calendar's member color, and an untagged event on the family calendar reads "everyone." Person chips across the top act as filters — the same interaction the household already knows — and double as the "who's acting" selector elsewhere (§6.3). Today is visually distinct; past days are dimmed, not hidden. A countdown strip surfaces any event flagged countdown (D10).

**Creating and editing.** Tapping an empty day (or the floating **+**) opens the **Add / Edit Event** panel — a centered pop-up over the grid, its sections ordered to match the Skylight the household already knows: Title, All-day, Start, End, Repeats, Countdown, Reminder, **Assign**. There is **no calendar picker**: Assign (defaulting to a "Family" chip = everyone) decides where copies are written (D3). Text entry uses an in-app on-screen keyboard so the OS keyboard never appears and the canvas never shrinks. Tapping an existing event opens the same panel pre-filled for **edit or delete** — including events made on a phone — except recurring events, which the panel refuses with "Edit repeating events on your phone" (D2). On submit the write goes straight to Google and the event lands on the wall immediately (optimistic, reconciled on the next poll); on failure the panel stays open with fields intact and the server's message inline.

### 4.2 Clean

Maryann's surface, and the reason she wants to run Tada! from the wall (D4). One view, two parts.

**The session** — the guide, brought over faithfully.

- A **room picker** across the top: "whole house" by default, or tap a room to scope the session to where she's standing.
- **One task at a time** — the single task Tada! surfaces as decaying fastest for that scope. Large, alone, uncluttered. Tada! chooses it; Hearth does not rank.
- A **large complete target**. Completing writes to Tada! (§5.3); the task settles done and the next fades in — cross-fade, no list reflow. The just-completed task offers a brief **Undo** (§5.3, Q5).
- **No visible queue, no remaining count, no "3 of 12," no "up next"** beyond the one task on screen (D4). One task, then the next.
- **Rest state, not reproach** — when nothing has decayed enough (or the picked room is clean), say so plainly: "All caught up in the kitchen." An empty session is success.

**Done today** — the celebration, unchanged from the original Maryann tab. Completed tasks accumulate as they land: no total, no progress bar, no denominator. Tasks finished in the session land here; so do completions made from her phone, live (§5.3 sync).

### 4.3 Chores

The kids' surface — the original Kids tab, promoted to its own destination.

One column per kid, in their member color, showing today's assigned chores with a large tap target to mark complete. Tapping writes to Tada! (§5.3) and the row settles into a done state, with a brief **Undo** (Q5). No streak display, no badges, no stars — Tada! owns reward state and it is not this screen's job to render or duplicate it. The wall becomes the kids' primary surface (D5) so they stop tracking on their phones.

### 4.4 Lists

Tada!'s lists, read-only, showing item counts and contents. Respects Tada!'s `kind` field and section structure. Does not offer add/edit — that happens on a phone where typing works. (Distinct from **Shopping** in §4.6, which is Enchanted Spoon's list and *is* editable.)

### 4.5 Meals

The current week's meal plan from Enchanted Spoon: meal name and day, a glanceable "what's for dinner." Tapping a meal opens its **card** — ingredients and recipe — the same card Enchanted Spoon renders in its Meal Planner. Read-only (D6): the wall reads the plan and reads the card, but does not assign, swap, or edit meals (that stays on the phone). Recipe detail lives here now, on demand, rather than in a standalone browsable grid.

### 4.6 Shopping

Enchanted Spoon's shopping list, live and interactive — the same list the phone shows, on the wall (D6). Check items off as you pull them from the pantry; add what you notice you're out of; remove and edit. Every change writes straight to Enchanted Spoon (§5.5), which is the single source of truth; there is no separate Hearth copy. Group items by Enchanted Spoon's existing section/category structure rather than inventing one. This is the kitchen's natural surface for it — hands full, phone on the counter.

**Supplies shelf.** Below the list sits the household's supplies roster from Tada! — the recurring things you keep stocked (cleaning products, paper goods). Tap one you're low on and Tada! flags it, which adds it to the Enchanted Spoon list above. This is the one place two upstreams meet in a single view: the list is Enchanted Spoon, the supplies are Tada!. Each tap is **one** Tada! write (§5.3); the cross-app add is Tada!'s backend, so Hearth never writes to Enchanted Spoon to place a flagged supply. A supply that's already flagged reads as such and isn't offered again until it's bought. Keep the shelf visually secondary to the list — it's a quick-add, not the main event.

### 4.7 Settings

The one place the wall configures itself. Its primary control is the **family color palette** (D12): each person's color, and the shared "Family" color, chosen from a fixed set of swatches. The choice is stored server-side in Hearth's shared file and shared across every device, so the wall and a phone/laptop agree, with no recolor flash on load. Below it, a short **This device** note explains that the screen is authorized once with the device token and stays signed in — no login, no timeout — and how to re-pair a screen (open its URL with `?token=…`). Settings sits at the bottom of the sidebar rail, apart from the six content destinations.

---

## 5. Integration contracts

### 5.1 Google Calendar

**Setup:** Create a dedicated household Google account. Share **each member's own calendar** and the **shared family calendar** into it with **write** access ("Make changes to events" — the write scope covers reading). Run the OAuth consent flow once with `https://www.googleapis.com/auth/calendar.events` and store the resulting refresh token in Railway. One token, one consent flow — for all calendars.

Configuration is two environment variables (there is **no** `CALENDAR_MAP` — that was the earlier single-calendar model): `MEMBERS`, a JSON array of `{ key, name, color, calendarId }` (the canonical, ordered, taggable people, each with their own write-target calendar), and `FAMILY_CALENDAR_ID`, the shared calendar for whole-family events and phone-made events added there directly. `HOUSEHOLD_TIMEZONE` supplies the IANA zone Google requires on event creation.

**Reading:** `events.list` with `singleEvents=true` (recurring events arrive pre-expanded) and a `syncToken` for incremental polls, held in process memory over a rolling window (last month → three months out); out-of-window navigation does a direct fetch. Poll every 60 seconds. A `410 Gone` discards the token and re-syncs. The wall reads every member calendar plus the family calendar and de-dups fan-out copies into one banded chip each (D3). One unreadable calendar (a bad share) is skipped, not fatal — the rest still render (§6.2).

**Do not use secret iCal URLs.** Google's iCal feeds can lag by hours, which breaks the case that matters most — Maryann adds an appointment and expects to see it on the wall within a minute.

**Writing:** create/edit/delete flow through a single `reconcile` step that brings an event to exactly the calendars it should live on (patch kept copies, create missing ones, then delete removed ones — never into nothing). A whole-family assignment writes one event to `FAMILY_CALENDAR_ID`; a subset fans out one copy per assignee's calendar under a shared `hearthGroupId`. The write handler allowlists targets from member config (a client can't name a calendar) and, for editing/deleting a phone-made event, re-checks its `{calendarId, eventId}` against the read set. Recurring events are refused server-side (D2).

**Color mapping:** each member's color is a palette slug on the `MEMBERS` entry, resolved to a CSS token, and customizable in Settings (D12). A member's fan-out copy inherits their own Google calendar color natively; Hearth does not force a per-event `colorId`.

**Local UI without Google:** `HEARTH_CALENDAR_MOCK=1` serves deterministic synthetic events (grid, filters, day panel, week view, and the full create/edit/delete reconcile, all offline). Ignored in production builds even if set, so it can never reach the wall.

### 5.2 Tada! — reads

> **Not yet live.** The Clean and Chores views are built and verified against a mock (`HEARTH_TASKS_MOCK=1`). The current Tada! backend does **not** expose the device-scoped endpoints below — it authenticates by session cookie (PIN login) with no inbound device token, its completion `source` is a closed enum that rejects `"hearth"`, and it has no acting-member override, single-next-by-room read, or per-kid chores aggregate. The exact contract Hearth's client already calls — and the specific backend gaps — are in **`docs/tada-integration-requirements.md`**. Until Tada! ships them, `/clean` and `/chores` degrade to a calm "not connected" state; wiring the real backend is then env-only (§5.3, "Once it's live"). This answers Q2 and Q3: the endpoints must be added upstream.

Needs endpoints for:
- **Next task by decay** — the single highest-decay task for the Clean session, optionally filtered to a room. Tada!'s existing focus-session selection, exposed to a device client and returning **only id/name/room, never the decay score** (D4). Hearth does not rank.
- **Room list** — the rooms available to scope a session.
- **Today's completions for a given adult** — the Clean done-today view.
- **Today's assigned + completed chores per kid** — the Chores view.
- **Lists with items** — the Lists view (Phase 3).
- **Supplies roster** — the household's stocked supplies and which are flagged low, for the Supplies shelf in the Shopping view (§4.6). A Tada! read that surfaces in Phase 4, not Phase 2.

The decay math and room model already exist inside Tada! for its own focus session; these endpoints expose existing logic rather than adding any. Where a device-scoped variant is needed, that is a small additive change at an existing seam — detailed gap-by-gap in the requirements doc.

### 5.3 Tada! — writes

Task completion is the shared write primitive for both Tada! surfaces: kids checking off chores (Chores) and Maryann completing tasks in her session (Clean). It stays narrowly scoped:

- A **device token** distinct from user auth, stored in Hearth's environment (`TADA_DEVICE_TOKEN`), sent as a Bearer header and never reaching the browser. There are **three distinct tokens** — Hearth's wall-login `HEARTH_DEVICE_TOKEN`, the shared `TADA_DEVICE_TOKEN`, and Tada!'s inbound check — and they must not be conflated (see the token model in `docs/tada-integration-requirements.md`).
- Scoped to **`complete_task`** and its **undo**, plus the §5.2 reads — no create/delete of task definitions, no settings, no reward-state changes.
- Each completion carries the **acting member**, chosen by tapping a person chip on the wall (Maryann for her session; the specific kid for a chore). Hearth validates the acting member against an allowlist (`TADA_MEMBERS`) and rejects anything else `403` *before* writing. This is attribution by selection, not authentication — see §6.3.
- Completions written with **`source="hearth"`** so they are distinguishable in `CompletionLog`.

"Sync" between Tada! and Hearth is not a sync layer: Hearth reads live and writes straight through, so a completion made on the wall and one made on a phone are the same write to the same store, and both surfaces reflect it on the next poll. There is no local copy to reconcile (D1).

**Supply flag-low (Phase 4).** A second, narrowly-scoped Tada! write, surfaced in the Shopping view's Supplies shelf (§4.6): mark a supply low, and Tada! adds it to the Enchanted Spoon shopping list. Hearth calls **one** Tada! endpoint; the cross-app add is Tada!'s own backend, and Hearth makes no Enchanted Spoon write for it. Scope the device token to this too — the supplies roster read (§5.2) and the flag-low write — with no create/delete of supply *definitions*. (See Q8.)

**What changed from the original spec:** the write is no longer kid-only. Maryann's session requires completing tasks *as herself*, so the device token acts on behalf of any household member who uses the wall, not just the kids. That is a broader grant, and it is acceptable because the wall is a trusted device inside the home — the same trust model the Skylight already had. It would **not** be acceptable on a public or portable device, and that boundary is stated wherever the token is provisioned. (See Q3.)

*Resolved (Phase 2, Q5): **undo on the just-completed row in both views.** Clean's completed task settles into a brief done state with an Undo; each Chores row offers a brief Undo after it's checked. Both call `POST /api/tasks/undo`, scoped by the same acting-member allowlist as completion. A wall tap is the more mis-tap-prone gesture, so correcting it should not require picking up a phone.*

### 5.4 Enchanted Spoon — Meals (read-only)

Current week's meal plan, plus each meal's **card** (ingredients, recipe) on tap — the data Enchanted Spoon already returns for its Meal Planner. Read-only. Editing the plan stays on the phone (D6). If Enchanted Spoon's in-flight shopping-list sync refactor is still moving when Phase 4 starts, it affects §5.5 below — but Meals and Shopping ship together, so delay the whole phase rather than integrating against a shifting surface.

### 5.5 Enchanted Spoon — Shopping List (read-write)

Hearth's Enchanted Spoon write surface. Reads the current list with its sections/categories; writes item check/uncheck, add, remove, and edit. Enchanted Spoon is the single source of truth and holds all list logic; Hearth sends intent and renders what comes back, keeping no local copy (D1).

- A **device token** for Enchanted Spoon, scoped to the shopping list's read and item-mutation endpoints only — not the meal plan write, not settings.
- Writes go through Hearth's route handlers server-side (§3.2), never from the browser.
- Because the list is shared and live, treat Enchanted Spoon's response as truth on every write. If the phone and the wall touch the same item, it is last-write-wins as Enchanted Spoon resolves it; Hearth does not attempt its own merge.

This write path is straightforward given Enchanted Spoon's backend, which already owns the list logic — Hearth is adding a second client to an interface built to receive one, not new server behavior. (See Q7.)

The **Supplies shelf** rendered in this view (§4.6) is *not* an Enchanted Spoon write path: those flags go to Tada! (§5.3), and Tada!'s backend places the item on this list. From Enchanted Spoon's side, a supply-flagged item is just another list item arriving through its normal interface. Hearth writes to exactly one upstream per gesture, never two.

---

## 6. Display constraints

A wall display is not a small phone. The constraints are genuinely different and should drive the design rather than being retrofitted.

### 6.1 Physical

- **Read distance:** six to ten feet. Body text that works at arm's length is illegible here. Set the minimum type size by walking across the room and looking, not by picking a number. The scale lives in `globals.css` under `@theme` — tune those tokens against the hardware, don't scatter sizes through components.
- **Touch only.** No hover states, no right-click, no physical keyboard; text entry uses the in-app on-screen keyboard. Every target sized for a hand reaching up to a wall, not a thumb on a phone.
- **Landscape, fixed.** Built for 1920×1080 and drawn on that fixed canvas, scaled to fit whatever viewport it runs in (never reflowed). Confirm the target device's actual resolution in Phase 0.
- **Always on.** Static elements in fixed positions for sixteen hours a day. Prefer light backgrounds over large flat dark fields, and avoid a permanently bright element in one fixed spot.
- **Ambient first.** Most interactions are a two-second glance from across the room, not a session. Optimize for the glance.

### 6.2 Failure behavior

A wall display showing a stack trace is worse than one showing yesterday's data. Every view degrades the same way:

1. Keep the last known good render.
2. Mark it quietly stale — a small timestamp, not a red banner.
3. Retry on the normal poll interval.
4. Never blank the screen, never show a raw error, never require a tap to recover.

If Hearth cannot reach an upstream for an hour, the wall shows the last good data with a subtle "as of 8:14" and nothing more dramatic than that. An unconfigured or not-yet-live integration (e.g. Tada! today) degrades the same calm way, not with an error.

### 6.3 No login, but a "who's acting" selector

Nobody logs into a wall. Authentication is a long-lived device token in the environment, set once by opening `/setup?token=…`, which stores an httpOnly cookie — no session, no timeout, no PIN prompt. What the wall does need, now that it writes as different people, is a lightweight **member selector**: the person chips already used to filter the calendar double as "who is acting" for a completion. Maryann taps her chip and runs her session; a kid taps theirs to check off a chore.

This is attribution, not authentication. The household trusts whoever is standing at the wall; the device token carries the real authority (§5.3), and the chip only says which member to attribute the write to. Shopping-list writes need no selector — the list is shared and unowned. Neither do calendar writes or color changes.

---

## 7. Design direction

Suggested, not locked — revise to taste.

**Concept: a household ledger, not a dashboard.** The failure mode for this kind of screen is looking like a startup analytics page: cards, pills, progress rings, accent gradients. This is a living room. It should read like something that belongs on a wall next to family photos.

- **Palette:** a warm neutral ground with the member colors as the only saturated elements on screen. Member color is the primary information channel — everything else stays quiet so the colors carry meaning. Reserve saturation entirely for people. The colors are customizable in Settings (D12) but the discipline is not: nothing else on screen competes with them for saturation.
- **Type:** one characterful face for dates, day names, and headings, set large; one clean face for everything else. The date should be the most confident thing on the calendar view.
- **Structure:** generous whitespace, hairline rules rather than card borders and shadows. At six feet, borders read as noise and space reads as organization.
- **Motion:** almost none. Content updates should cross-fade rather than slide or pop. Anything that moves in peripheral vision all day becomes an irritant by week two.
- **Signature:** the member color system itself — used consistently and exclusively across calendar events, task columns, and list ownership, so the whole display can be parsed by color before a single word is read.

---

## 8. Open questions

Resolve these before or during the phase noted.

| # | Question | Phase | Status |
|---|---|---|---|
| Q1 | Target device resolution and physical size | 0 | Built to 1920×1080 landscape (drawn on a fixed canvas, scaled to fit); confirm against real hardware in Phase 5. |
| Q2 | Do Tada!'s endpoints cover the §5.2 reads (next-task-by-decay, room list, per-kid chores, …) or do device-scoped variants need adding? | 0 | **Answered: they must be added upstream.** The gaps and exact contract are in `docs/tada-integration-requirements.md`; Hearth runs mock-first until then. |
| Q3 | Does Tada! have a device token that can complete a task as *any* household member (§5.3), scoped to `complete_task` + the §5.2 reads? | 0 | **Answered: not yet — Tada! must add an inbound device token, an acting-member override, and `"hearth"` to the `source` enum** (`docs/tada-integration-requirements.md`). |
| Q4 | Does Enchanted Spoon expose, at a device-callable seam, the current-week meal plan **and** each meal's card (ingredients, recipe)? | 4 | Open. |
| Q5 | Do the Clean and Chores views surface undo on a just-completed row, or are wall mistakes corrected on a phone? | 2 | **Resolved: undo on the just-completed row in both views** (§5.3). |
| Q6 | Does the Skylight unit reach Android developer options at all? (Ten minutes with a USB cable answers this.) | 5 | Open. |
| Q7 | Does Enchanted Spoon expose shopping-list read + item mutation to a scoped device token, and is its shopping-list sync refactor settled enough to build against (§5.5, D6)? | 4 | Open. |
| Q8 | Does Tada! expose the supplies roster (read) and flag-low (write) to the device token, and does flagging low already add to the Enchanted Spoon list in Tada!'s backend? | 4 | Open. |

---

## 9. Phase map

| Phase | Scope | New sidebar item | Status |
|---|---|---|---|
| 0 | Shell, routing, device auth, Railway deploy | — | ✅ Done |
| 1 | Calendar view + Google integration (read) | Calendar | ✅ Done |
| 1.5 | Calendar write: **create, edit, delete** (non-recurring) on the **per-member-calendar** fan-out model; member tags, countdown; **Settings** + customizable colors | (Settings) | ✅ Done |
| 2 | Clean (session + room picker + done-today) and Chores (kids) — Tada! reads + completion/undo writes | Clean, Chores | ✅ Built, **mock-only** (live blocked on Tada! endpoints — §5.2, `docs/tada-integration-requirements.md`) |
| 3 | Lists view | Lists | ⬜ Placeholder |
| 4 | Meals (plan + cards) and Shopping (read-write list + Tada! supplies shelf); rename "Recipes" → "Shopping" | Meals, Shopping | ⬜ Placeholder |
| 5 | Hardware deployment and kiosk configuration | — | ⬜ Not started |

Phase 1.5 grew beyond the original "create only": it reworked the calendar onto per-member calendars (assignment decides where an event lives and its color, D3), added **edit and delete** for non-recurring events including phone-made ones (D2), and introduced the **Settings** surface with customizable, persisted family colors (D12) — Hearth's one piece of at-rest state.

Phases 2 and 4 each add two content destinations. Phase 2's **Clean** and **Chores** are the same Tada! integration and the same completion write seen from two angles — Maryann's guided session and the kids' checklist — so they share a client module and build together; Clean is the larger piece and carries the phase. They are complete and verified against a mock, and go live with no Hearth code change once Tada! ships the device-scoped endpoints. Phase 4's **Meals** and **Shopping** are both Enchanted Spoon and share its client; Meals is a thin read while Shopping is the heavier read-write surface, and splitting them would strand Meals in a near-empty phase. Shopping also hosts the Tada! **supplies shelf** (§4.6). If Enchanted Spoon's shopping-list refactor is mid-flight, defer the whole phase (D6, §5.5, Q7).

Phase 5 is conditional on the two-week trial from D7 going well. If the household doesn't use it, the correct outcome is to stop after Phase 4 and leave the Skylight alone.
