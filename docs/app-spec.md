# Hearth — Household Wall Display

**Status:** Draft spec — amended (client rework, August 2026)
**Date:** August 2026
**Working name:** Hearth (placeholder — rename freely, it appears nowhere user-facing except the PWA manifest)
**Names:** the meal planner is **Enchanted Spoon** (earlier drafts called it "MealGenie" — same app).

---

## 1. What this is

A wall-mounted, always-on surface for the household's shared information in one place: the family calendar, Tada!'s cleaning and lists, and Enchanted Spoon's meal plan and shopping list.

It is **not** a fourth app in the household suite. Tada! and Enchanted Spoon own real data and real logic. Hearth owns none of it. It is a **client** — a second frontend, co-equal with the phone, that reads and writes three APIs and renders them for a screen six to ten feet away and a hand reaching up to it.

This is a change from the original framing. Hearth began as a read-only *display*; it is now an interactive *client* the family can run Tada! and Enchanted Spoon from without picking up a phone. What did **not** change is the ownership boundary: Hearth stores nothing (D1) and decides nothing. Decay ranking, "what to clean next," room logic, reward state, meal plans, shopping-list math — all of it is computed upstream. Hearth triggers and renders; it never computes or decides.

That boundary is the single most important thing in this document. Every time a feature request implies Hearth should **store, decide, or compute** something, that is a signal the logic belongs in Tada! or Enchanted Spoon and only its *result* belongs here. "Interactive" widened what Hearth can *trigger*; it did not widen what Hearth may *own*.

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

These are settled. A future build session should not relitigate them without an explicit spec amendment.

**D1 — Hearth has no database.**
No schema, no migrations, no ORM. Configuration lives in environment variables. If a phase appears to need persistence, stop and reconsider whether the state belongs in Tada! or Enchanted Spoon. This holds even though Hearth is now interactive: writes go straight to the upstream that owns the data, and Hearth keeps no local copy to reconcile. A client that can *trigger* an upstream write is not the same as a store — see D11.

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

**D4 — Maryann's surface guides one task at a time; it never shows the backlog.**
*(Amended in the client rework — was "…shows what is done, not what is left," from when the wall was display-only. The amendment sharpens this decision; it does not loosen it.)*
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
*(Amended in the client rework — was "MealGenie integration is read-only"; the "Recipes" view is replaced by "Shopping List.")*

- **Meals** shows the current week's plan and lets you tap a meal to open its card — ingredients and recipe — the same Meal Planner view Enchanted Spoon already renders. Read-only. Editing the plan (assigning or swapping meals) stays on the phone; the wall reads the plan and reads recipe detail, nothing more.
- **Shopping List** is a full read-write client of Enchanted Spoon's list: check items off, add, remove, edit — live-synced. Enchanted Spoon remains the single source of truth and holds all list logic; every change writes straight to its backend. This is a deliberate exception to the old read-only rule, and it is safe precisely because Enchanted Spoon was built to receive these writes — Hearth still stores and computes nothing.

What remains out of scope: writing to the **meal plan** itself. Assigning recipes to days needs per-user planning judgment that belongs on the phone. Reading the plan and its cards does not.

**D7 — Test on spare hardware before touching the Skylight.**
Hearth is a URL. It runs in any browser. Build it, run it on a spare tablet or a leftover browser tab for two weeks, and find out whether a wall display is something this house uses or something that seemed good at 7am walking past the couch. Hardware comes last, in Phase 5, and only if the thing earns its place.

**D8 — If the Skylight is used, disable the launcher. Never wipe or flash it.**
There are no public firmware images for these devices and Skylight support declines to provide them. A failed flash is an unrecoverable brick. `pm disable-user com.skylight` is reversible with one command; a bad `dd` is not.

**D9 — Reminders are per-calendar, and that imprecision is accepted.** *(Added in Phase 1.5.)*
Google fires reminders to everyone subscribed to the owning calendar with notifications enabled, not to the tagged members. A reminder on Lincoln's appointment pings the whole household.

The alternative — using real Google attendees instead of extended properties — would notify each person individually and correctly, but generates invitation emails and RSVP prompts for every piece of family logistics, and requires email addresses for the kids. Too noisy for the value. Accepted as-is. If it becomes annoying in practice, switching the tag mechanism from extended properties to attendees is a contained change to the read and write paths, not a redesign.

**D10 — Countdown is a Hearth-only flag.** *(Added in Phase 1.5.)*
Stored as an extended property, rendered by Hearth, ignored by Google. Countdown and repeat are mutually exclusive: counting down to a recurring event means counting to the next occurrence, which is a different feature and not this one.

**D11 — Hearth is a client, not a display. It writes.** *(Added in the client rework.)*
The wall is now a full interactive surface for Tada! and Enchanted Spoon, co-equal with the phone — the family can run cleaning sessions, check off chores, flag low supplies, and manage the shopping list without picking up a device. Every write goes straight to the owning upstream (§5.3, §5.5); Hearth keeps no local state and reconciles nothing. This does not weaken D1: the difference between a display and a client is whether it can *trigger* upstream actions, not whether it *holds* data. Hearth triggers; it still holds nothing.

The write actions are, deliberately, a short and closed list: **task completion** and **supply flag-low** (both Tada!), **shopping-list items** (Enchanted Spoon), and **event creation** (Google Calendar, D2). Note that flagging a supply low is a *single* Tada! write — its effect on the Enchanted Spoon shopping list is Tada!'s own backend fan-out, not a second write Hearth makes or coordinates (§5.3, §5.5). Any write beyond this list is a spec amendment, not a small addition — the list grew from two to three exactly once, on purpose, and this note is the record of it.

---

## 3. Architecture

### 3.1 Shape

```
                    ┌──────────────────────┐
                    │   Hearth frontend    │
                    │  Next.js on Railway  │
                    │   (no database)      │
                    └──────────┬───────────┘
                               │  reads + writes
             ┌─────────────────┼──────────────────┐
             │                 │                  │
   ┌─────────▼──────┐ ┌────────▼────────┐ ┌───────▼────────┐
   │ Google Calendar│ │    Tada! API    │ │ Enchanted Spoon│
   │      API       │ │                 │ │      API       │
   │  (4 calendars, │ │ clean session · │ │  meal plan ·   │
   │  1 household   │ │ rooms · lists · │ │  cards (read) ·│
   │   OAuth token, │ │ completions ·   │ │  shopping ↕    │
   │   create ↑)    │ │ supplies ↕      │ │                │
   └────────────────┘ └─────────────────┘ └────────────────┘
```

Consistent with the existing stack: Next.js frontend, Railway deploy, single-branch auto-deploy. No FastAPI backend of its own — Next.js route handlers are sufficient and keep secrets server-side.

### 3.2 Why route handlers, not client-side fetching

All three upstream APIs need credentials. Those credentials must never reach the browser, because the browser in question is a wall-mounted tablet in a living room that guests walk past. Every upstream call goes through a Next.js route handler that holds the token server-side and returns only the shaped data the view needs. This applies to writes as well as reads: task completions and shopping-list mutations post to Hearth route handlers, which attach the device token server-side and forward to the upstream — the browser never sees a token or calls Tada!/Enchanted Spoon directly.

This also gives a natural place to implement the stale-data behavior in §6.2.

### 3.3 Deployment

One new Railway service in the existing project. Environment variables only — no volume, no database attachment.

---

## 4. Views

The sidebar is the whole navigation model. Six destinations — the Skylight's familiar set, split so each person's surface stands on its own (Maryann's **Clean**, the kids' **Chores**) and with **Recipes** replaced by the **Shopping** list the household actually uses.

| View | Source | Phase | Writes? |
|---|---|---|---|
| Calendar | Google Calendar API | 1 | Create only (D2) |
| Clean | Tada! | 2 | Yes (task completion) |
| Chores | Tada! | 2 | Yes (task completion) |
| Lists | Tada! | 3 | No |
| Meals | Enchanted Spoon | 4 | No |
| Shopping | Enchanted Spoon · Tada! | 4 | Yes (list items → Enchanted Spoon; supply flags → Tada!) |

### 4.1 Calendar

Month view as the default (matches current habit — see the existing Skylight usage). Week view as a secondary toggle if it earns itself; do not build day view.

Each event renders with a color stripe or fill keyed to its owning calendar. Person chips across the top act as filters, same interaction the household already knows.

Today is visually distinct. Past days are dimmed, not hidden.

### 4.2 Clean

Maryann's surface, and the reason she wants to run Tada! from the wall (D4). One view, two parts.

**The session** — the guide, brought over faithfully.

- A **room picker** across the top: "whole house" by default, or tap a room to scope the session to where she's standing.
- **One task at a time** — the single task Tada! surfaces as decaying fastest for that scope. Large, alone, uncluttered. Tada! chooses it; Hearth does not rank.
- A **large complete target**. Completing writes to Tada! (§5.3); the task settles done and the next fades in — cross-fade, no list reflow.
- **No visible queue, no remaining count, no "3 of 12," no "up next"** beyond the one task on screen (D4). One task, then the next.
- **Rest state, not reproach** — when nothing has decayed enough (or the picked room is clean), say so plainly: "All caught up in the kitchen." An empty session is success.

**Done today** — the celebration, unchanged from the original Maryann tab. Completed tasks accumulate as they land: no total, no progress bar, no denominator. Tasks finished in the session land here; so do completions made from her phone, live (§5.3 sync).

### 4.3 Chores

The kids' surface — the original Kids tab, promoted to its own destination.

One column per kid, showing today's assigned chores with a tap target to mark complete. Tapping writes to Tada! (§5.3) and the row settles into a done state. No streak display, no badges, no stars — Tada! owns reward state and it is not this screen's job to render or duplicate it. The wall becomes the kids' primary surface (D5) so they stop tracking on their phones.

### 4.4 Lists

Tada!'s lists, read-only, showing item counts and contents. Respects Tada!'s `kind` field and section structure. Does not offer add/edit — that happens on a phone where typing works. (Distinct from **Shopping** in §4.6, which is Enchanted Spoon's list and *is* editable.)

### 4.5 Meals

The current week's meal plan from Enchanted Spoon: meal name and day, a glanceable "what's for dinner." Tapping a meal opens its **card** — ingredients and recipe — the same card Enchanted Spoon renders in its Meal Planner. Read-only (D6): the wall reads the plan and reads the card, but does not assign, swap, or edit meals (that stays on the phone). Recipe detail lives here now, on demand, rather than in a standalone browsable grid.

### 4.6 Shopping

Enchanted Spoon's shopping list, live and interactive — the same list the phone shows, on the wall (D6). Check items off as you pull them from the pantry; add what you notice you're out of; remove and edit. Every change writes straight to Enchanted Spoon (§5.5), which is the single source of truth; there is no separate Hearth copy. Group items by Enchanted Spoon's existing section/category structure rather than inventing one. This is the kitchen's natural surface for it — hands full, phone on the counter.

**Supplies shelf.** Below the list sits the household's supplies roster from Tada! — the recurring things you keep stocked (cleaning products, paper goods). Tap one you're low on and Tada! flags it, which adds it to the Enchanted Spoon list above. This is the one place two upstreams meet in a single view: the list is Enchanted Spoon, the supplies are Tada!. Each tap is **one** Tada! write (§5.3); the cross-app add is Tada!'s backend, so Hearth never writes to Enchanted Spoon to place a flagged supply. A supply that's already flagged reads as such and isn't offered again until it's bought. Keep the shelf visually secondary to the list — it's a quick-add, not the main event.

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
- **Next task by decay** — the single highest-decay task for the Clean session, optionally filtered to a room. This is Tada!'s existing focus-session selection, exposed to a device client; Hearth does not rank anything itself.
- **Room list** — the rooms available to scope a session.
- **Today's completions for a given adult** — the Clean done-today view.
- **Today's assigned tasks for a given kid** — the Chores view.
- **Lists with items** — the Lists view.
- **Supplies roster** — the household's stocked supplies and which are flagged low, for the Supplies shelf in the Shopping view (§4.6). A Tada! read that surfaces in Phase 4, not Phase 2.

The decay math and room model already exist inside Tada! for its own focus session; the session-selection and room endpoints are the only genuinely new surface, and they expose existing logic rather than adding any. The rest may already exist for the app's own frontend — reuse them. Where a device-scoped variant is needed, that is a small additive change at an existing seam, not a rewrite. (See Q2.)

### 5.3 Tada! — writes

Task completion is the shared write primitive for both Tada! surfaces: kids checking off chores (Chores), and Maryann completing tasks in her session (Clean). It stays narrowly scoped:

- A **device token** distinct from user auth, stored in Hearth's environment.
- Scoped to **`complete_task`** (and its undo, if in scope) plus the session / room / completion / list **reads** in §5.2 — no create, no delete of task definitions, no settings, no reward-state changes.
- Each completion carries the **acting member**, chosen by tapping a person chip on the wall (Maryann for her session; the specific kid for a chore). This is attribution by selection, not authentication — see §6.3.
- Completions written with **`source="hearth"`** so they are distinguishable in `CompletionLog`. The `source` field already exists — this is additive at a seam that is already there, the same pattern used for the reward system.

"Sync" between Tada! and Hearth is not a sync layer: Hearth reads live and writes straight through, so a completion made on the wall and one made on a phone are the same write to the same store, and both surfaces reflect it on the next poll. There is no local copy to reconcile (D1).

**Supply flag-low (Phase 4).** A second, narrowly-scoped Tada! write, surfaced in the Shopping view's Supplies shelf (§4.6): mark a supply low, and Tada! adds it to the Enchanted Spoon shopping list. Hearth calls **one** Tada! endpoint; the cross-app add is Tada!'s own backend, and Hearth makes no Enchanted Spoon write for it. Scope the device token to this too — the supplies roster read (§5.2) and the flag-low write — with no create or delete of supply *definitions* (that's phone/admin work). It lands with Phase 4 because that is when the Shopping view exists to host it, even though the endpoint is Tada!'s. (See Q8.)

**What changed from the original spec:** the write is no longer kid-only. Maryann's session requires completing tasks *as herself*, so the device token now acts on behalf of any household member, not just the kids. That is a broader grant, and it is acceptable because the wall is a trusted device inside the home — the same trust model the Skylight already had. It would **not** be acceptable on a public or portable device, and that boundary should be stated wherever the token is provisioned. (See Q3.)

**Undo interaction:** Phase 9 of Tada! adds undo for accidental completions, scoped to today, surfaced in the completion toast and in Done Today. A tap on the wall is *more* likely to be accidental than a tap on a phone — and now that adults complete tasks here too, a mis-tap mid-session is at least as likely as a kid's. Hearth should either surface the same undo affordance on the completed row (Clean and Chores both), or explicitly accept that wall mistakes get corrected on a phone. Decide this during Phase 2; do not leave it implicit. (See Q5.)

*Resolved (Phase 2, Q5): **undo on the just-completed row in both views.** Clean's completed task settles into a brief done state with an Undo; each Chores row offers a brief Undo after it's checked. Both call `POST /api/tasks/undo`, scoped by the same acting-member allowlist as completion. A wall tap is the more mis-tap-prone gesture, so correcting it should not require picking up a phone.*

### 5.4 Enchanted Spoon — Meals (read-only)

Current week's meal plan, plus each meal's **card** (ingredients, recipe) on tap — the data Enchanted Spoon already returns for its Meal Planner. Read-only. Editing the plan stays on the phone (D6). If Enchanted Spoon's in-flight shopping-list sync refactor is still moving when Phase 4 starts, it affects §5.5 below — but Meals and Shopping ship together, so delay the whole phase rather than integrating against a shifting surface.

### 5.5 Enchanted Spoon — Shopping List (read-write)

Hearth's Enchanted Spoon write surface. Reads the current list with its sections/categories; writes item check/uncheck, add, remove, and edit. Enchanted Spoon is the single source of truth and holds all list logic; Hearth sends intent and renders what comes back, keeping no local copy (D1).

- A **device token** for Enchanted Spoon, scoped to the shopping list's read and item-mutation endpoints only — not the meal plan, not recipe data, not settings.
- Writes go through Hearth's route handlers server-side (§3.2), never from the browser.
- Because the list is shared and live, treat Enchanted Spoon's response as truth on every write. If the phone and the wall touch the same item, it is last-write-wins as Enchanted Spoon resolves it; Hearth does not attempt its own merge.

This write path is straightforward given Enchanted Spoon's backend, which already owns the list logic — Hearth is adding a second client to an interface built to receive one, not new server behavior. (See Q7.)

The **Supplies shelf** rendered in this view (§4.6) is *not* an Enchanted Spoon write path: those flags go to Tada! (§5.3), and Tada!'s backend places the item on this list. From Enchanted Spoon's side, a supply-flagged item is just another list item arriving through its normal interface — indistinguishable from one added directly. Hearth writes to exactly one upstream per gesture, never two.

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

### 6.3 No login, but a "who's acting" selector

Nobody logs into a wall. Authentication is a long-lived device token in the environment — no session, no timeout, no PIN prompt. What the wall does need, now that it writes as different people, is a lightweight **member selector**: the person chips already used to filter the calendar double as "who is acting" for a completion. Maryann taps her chip and runs her session; a kid taps theirs to check off a chore.

This is attribution, not authentication. The household trusts whoever is standing at the wall; the device token carries the real authority (§5.3), and the chip only says which member to attribute the write to. Shopping-list writes need no selector — the list is shared and unowned.

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
| Q2 | Do Tada!'s endpoints cover the five reads in §5.2 — including next-task-by-decay and the room list for the Clean session — or do device-scoped variants need adding? | 0 |
| Q3 | Does Tada! have a device token that can complete a task as *any* household member (§5.3), not just kids, or does one need creating? What scopes it to `complete_task` and the §5.2 reads only? | 0 |
| Q4 | Does Enchanted Spoon expose, at a device-callable seam, the current-week meal plan **and** each meal's card (ingredients, recipe)? | 4 |
| Q5 | Do the Clean and Chores views surface undo on a just-completed row, or are wall mistakes corrected on a phone? (Matters for adults now too — §5.3.) | 2 |
| Q6 | Does the Skylight unit reach Android developer options at all? (Ten minutes with a USB cable answers this and is worth doing early, independent of everything else.) | 5 |
| Q7 | Does Enchanted Spoon expose shopping-list read + item mutation (check, add, remove, edit) to a scoped device token, and is its shopping-list sync refactor settled enough to build against (§5.5, D6)? | 4 |
| Q8 | Does Tada! expose the supplies roster (read) and flag-low (write) to the device token, and does flagging low already add to the Enchanted Spoon list in Tada!'s backend — so Hearth makes no Enchanted Spoon write for it (§4.6, §5.3)? | 4 |

---

## 9. Phase map

| Phase | Scope | New sidebar item |
|---|---|---|
| 0 | Shell, routing, device auth, Railway deploy | — |
| 1 | Calendar view + Google integration | Calendar |
| 2 | Clean (session + room picker + done-today) and Chores (kids) — Tada! reads + completion writes | Clean, Chores |
| 3 | Lists view | Lists |
| 4 | Meals (plan + cards) and Shopping (read-write list + Tada! supplies shelf) | Meals, Shopping |
| 5 | Hardware deployment and kiosk configuration | — |

Phases 2 and 4 each add two sidebar items. Phase 2's **Clean** and **Chores** are the same Tada! integration and the same completion write seen from two angles — Maryann's guided session and the kids' checklist — so they share a client module and build together; Clean is the larger piece (session selection, room scoping, done-today) and carries the phase. Phase 4's **Meals** and **Shopping** are both Enchanted Spoon and share its client; Meals is a thin read while Shopping is the heavier read-write surface, and splitting them would strand Meals in a near-empty phase. Shopping also hosts the Tada! **supplies shelf** (§4.6) — a second small Tada! write folded into this phase because that is where it surfaces, so Phase 4 touches the Tada! client too. Phase 4 is now the more substantial of the two because Shopping writes — if Enchanted Spoon's shopping-list refactor is mid-flight, defer the whole phase (D6, §5.5, Q7).

Phase 5 is conditional on the two-week trial from D7 going well. If the household doesn't use it, the correct outcome is to stop after Phase 4 and leave the Skylight alone.