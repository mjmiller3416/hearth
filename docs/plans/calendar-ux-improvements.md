# Calendar UX Improvements — Implementation Plan

_Created 2026-08-16. Scope: 12 tweaks to the core calendar, plus an app-wide polish pass.
All work is on the calendar view and its panels, the settings page, and a small amount of
shared shell (viewport, timezone, a new settings store)._

## Status: IMPLEMENTED (2026-08-16)

All 12 items are done and verified in the browser against the mock. Notes/deviations:
- **#7 keyboard:** no native input focuses at all (the Title is a tappable display driving a
  custom in-app keyboard), so the OS keyboard never appears — the `interactive-widget` viewport
  route was not needed.
- **#3 colors:** the shared store persists to a JSON file (`HEARTH_DATA_DIR` on a Railway volume;
  falls back to a local `.hearth-data/` dir). We do NOT hold an in-memory cache — Next serves route
  handlers and RSC from separate module graphs in dev, so a cached write was invisible to the
  render; reading the small file fresh each load is correct and cheap. **Operator action: attach a
  Railway volume and set `HEARTH_DATA_DIR` for durability across redeploys.**
- **#4 timezone:** forced in code via a `TimeZoneProvider` + zoned date helpers, threaded through the
  header clock, "today" logic, event chip/detail times, day-bucketing, AND the edit form's Start/End
  seeding (a bug found and fixed during verification — editing on a wrong-zone device would have
  saved the wrong time). Verified by emulating `Asia/Tokyo` via CDP: the wall still shows New York
  time. **Still worth confirming the device's UTC epoch (`adb shell date`) is correct — the fix
  assumes NTP is right.**
- Verified with `tsc --noEmit` (clean), `npm run check:auth` (pass), a clean server/client import
  boundary, and end-to-end Playwright drives of every surface. A full `next build` was not run to
  avoid disrupting the running dev server; run it before deploy.

---

## Locked decisions (from planning Q&A)

| # | Decision | Choice |
|---|----------|--------|
| 3 | Tag/event color persistence | **Shared across devices** — new server-side settings store + `/api/settings`. |
| 7 | Keyboard | **Custom in-app on-screen keyboard** rendered inside the canvas; suppress the OS keyboard. |
| 4 | Wrong time on device | **Force the display timezone in code** (render in `HOUSEHOLD_TIMEZONE`, not the device zone). |
| 1 | Header rows | **Filters join the title row.** Row 1 = month title + member/Family filters + nav. Row 2 = countdown. |

## Architecture facts that shape this work

- **Fixed-canvas scaling.** The whole app is authored on a 1920×1080 canvas and uniformly
  transform-scaled to fit by `src/components/layout/Stage.tsx`. This is *why* the OS keyboard
  shrinks everything (#7): the keyboard shrinks the viewport → Stage's `ResizeObserver` fires →
  the canvas rescales smaller. It also means every fixed `position: fixed` panel already resolves
  against the scaled canvas.
- **No database.** Color, member, and calendar config live in env vars (`MEMBERS`,
  `FAMILY_CALENDAR_ID`, `HOUSEHOLD_TIMEZONE`) and CSS custom properties (`--color-<slug>` in
  `globals.css`). Shared color persistence (#3) therefore needs new infrastructure (below).
- **Color is a runtime CSS-variable indirection.** Server bakes palette *slugs* onto
  `event.colors` (e.g. `["mitchell"]`); chips render `var(--color-mitchell)`. Overriding those CSS
  variables at runtime recolors the entire app consistently — this is the lever for #3.
- **Time is device-local today.** `HeaderBar` uses `new Date()` + `toLocaleTimeString(undefined,…)`;
  `dates.ts` derives "today"/day-buckets from `now`'s local getters. Correct on the laptop, wrong on
  the Skylight → the device's timezone is the suspect.
- **`now` is already threaded** from `CalendarView` into the grid, week view, day panel, and chips —
  so making "now" timezone-aware fixes day math everywhere in one place (#4).

---

## Workstream A — Header & filters (#1, #2)

**Goal.** Two rows above the grid instead of three; add a **Family** filter chip; restyle active
filter chips as a *light tint* of the member color (per the Skylight reference).

**Files:** `src/components/calendar/CalendarView.tsx`, `MemberChips.tsx`, `CountdownStrip.tsx`,
`src/lib/calendar/event.ts` (new `concernsFamily` predicate), `src/lib/calendar/palette.ts` (tint helper).

**Approach:**
1. **Rows → two (chosen layout "Filters join title row").** Move `<MemberChips>` out of the body and
   into the `ViewFrame` header area so Row 1 reads `August 2026  [filters]  ‹ Today › [M|W]`. Keep the
   `CountdownStrip` as Row 2 (full-width, only when a countdown exists). Concretely: pass the chips into
   `ViewFrame` (either via a new `filters` slot or by composing them into the existing `actions` region),
   and drop the chips row from the body flex stack. Verify it fits at 1920 wide with 5 members + Family +
   nav; if tight, chips scroll horizontally rather than wrap (kiosk: nothing wraps unpredictably).
2. **Family chip (#2).** Prepend a "Family" chip to `MemberChips`. Filter semantic: an event "concerns
   family" when its resolved treatment is the everyone/shared one — `event.colors.includes(EVERYONE_COLOR)`
   (covers family-calendar untagged events and 4+/all-member events). Add `concernsFamily(event)` to
   `event.ts` next to `memberConcerns`. `CalendarView`'s `filter` state becomes either a member key or the
   sentinel `"__family__"`; `toggleFilter`/`filtered` handle the sentinel.
3. **Tinted active chips.** Replace the solid-fill active state with a light tint of the member color +
   full-strength color for text/dot/ring. Implement the tint with `color-mix(in srgb, var(--color-slug) 18%, var(--color-surface))`
   for the background and the full color for the label — no new palette hex needed, and it automatically
   tracks any #3 recolor. (Confirm `color-mix` renders in the Skylight WebView during verification; if not,
   fall back to a translucent overlay `rgb(... / 0.16)` via a small helper.) Inactive chips keep the quiet
   outline + dot.

---

## Workstream B — Customizable tag colors (#3)  ·  _new infrastructure_

**Goal.** From Settings, each member's color is pickable from a fixed swatch palette; the choice is
shared across all devices and recolors the whole app.

**New files:**
- `src/lib/settings/store.ts` — read/write a small JSON blob `{ colorsByMemberKey: Record<string,string> }`.
- `src/lib/settings/swatches.ts` — the predetermined palette (client-safe array of ~16 hex swatches, named).
- `src/app/api/settings/route.ts` — `GET` (device-auth) returns overrides; `PUT` validates + persists.
- `src/components/settings/ColorPicker.tsx` — swatch grid picker (client).
- `src/components/common/ColorOverrides.tsx` — applies overrides at runtime.

**Files touched:** `src/app/(protected)/settings/page.tsx`, `src/app/(protected)/layout.tsx` (inject
overrides server-side for no-flash), `.env.example` (document the persistence dir/service).

**Persistence approach (shared, no traditional DB):**
- **Primary:** a JSON file on a **Railway persistent volume** — the lightest "shared + survives redeploy"
  option that keeps the file-based-config ethos. Path from a new env `HEARTH_DATA_DIR` (e.g. `/data`);
  `store.ts` reads/writes `${HEARTH_DATA_DIR}/settings.json`, with an in-memory + `.env.local`-dir fallback
  for local dev so the mock works with zero config. Operator step: attach a volume in Railway (documented in
  `.env.example` and the plan's manual-setup notes).
- _Alternatives if a volume is undesirable: Railway Redis/Postgres plugin. Heavier for ~5 values; only pursue
  if the user prefers a managed service. Flagged, not chosen._

**Apply path (no flash, shared):**
- The protected **server** layout reads the store at request time and emits an inline
  `<style>:root{ --color-mitchell:#…; … }</style>` so the very first paint is already recolored on every
  device. `ColorOverrides` (client) re-applies after a save without a reload (`document.documentElement.style.setProperty`).
- Overrides key on each member's **color slug** (`member.color`), so a single override recolors chips,
  member chips, avatars, and countdown dots uniformly.

**Settings UI:** per member, show the current swatch + name; tap → `ColorPicker` (swatch grid) → `PUT`
`/api/settings` → refetch/apply. Validate server-side that values are within the known swatch set.

**Note to surface to the user:** member colors currently *mirror each person's own Google Calendar color*
(so the wall matches their phone). Overriding here intentionally decouples that for the wall's display.
Google copies are unaffected (Hearth doesn't set per-event colorId). Documented in the settings copy.

---

## Workstream C — Time correctness (#4)

**Goal.** The wall shows the correct household local time/date regardless of the device's timezone setting.

**Files:** `src/components/layout/HeaderBar.tsx`, `src/lib/calendar/dates.ts` (+ a small `zonedNow` helper),
`src/components/calendar/CalendarView.tsx` (produce a zoned `now`), a client-exposed timezone value.

**Approach:**
1. **Expose `HOUSEHOLD_TIMEZONE` to the client.** It's currently server-only. Surface it via a
   `NEXT_PUBLIC_HOUSEHOLD_TIMEZONE` (or serialize it from the server layout into a small provider). Keep the
   server-side `resolveTimeZone()` as the source of truth.
2. **HeaderBar** formats day/date/time with `{ timeZone: TZ }` in `toLocaleDateString/TimeString`. This fixes
   the reported symptom directly (display immune to a wrong device zone).
3. **Zone-correct "now" for day math.** Add `zonedNow(tz)` that returns a `Date` whose *local getters* equal
   the wall-clock components in `tz` (format `new Date()` into `tz` parts, reconstruct). Thread it as the
   `now` passed through `CalendarView` so "today", past-day dimming, and countdown day-counts are correct in
   the household zone. Assumes the device's UTC epoch is right (NTP) — the chosen fix's stated precondition.
4. **Verification (device):** confirm the device epoch via `adb shell date` / Fully Kiosk before/after. `adb`
   is not on PATH in this environment — during implementation I'll either locate `platform-tools` or ask you
   to run `! adb shell date` so we confirm epoch-vs-timezone is the actual failure. (If the *epoch* is wrong,
   that's a device/NTP fix, not code — we'll catch it here.)

---

## Workstream D — Add / Edit panel (#5, #6, #9, keyboard #7)

**Goal.** Tap-off closes; no Add button while viewing an event; a cleaner, well-separated layout with a
non-wrapping time control; and a custom in-app keyboard.

**Files:** `src/components/calendar/AddEventPanel.tsx` (major), `src/lib/calendar/form.ts` (unchanged logic),
new `src/components/common/OnScreenKeyboard.tsx`, `src/app/layout.tsx` (viewport, only if needed).

**#5 — Tap-off closes.** Make the dim scrim clickable → `onClose`; stop propagation on the panel. Remove the
"deliberately not tap-to-close" guard comment. (Optional, will confirm at build: a light "Discard changes?"
confirm only when the draft is dirty — leaning toward a plain close to match the explicit ask.)

**#6 — No Add button when viewing an event.** The Add affordance must not appear in the event **detail** view
(introduced in Workstream E). The edit form reached from detail shows Save/Delete only. Audit the day panel /
detail header so a single-event context never renders "Add".

**#9 — De-clutter + fix time wrapping.** Rework the panel spacing and the time control:
- Give each field clear vertical separation (section dividers / larger gaps / grouped cards), matching the
  Skylight reference screenshots (`IMG_0304`/`IMG_0305`): Title, All-day, Starts, Ends, Repeats, Countdown,
  Reminder, Assign as clearly delineated rows.
- **Time stepper no longer wraps at 4 digits.** Today `TimeStepper` uses a fixed `w-28` label beside two
  stepper pairs; a wide "12:30 PM" pushes to a new line. Fix by giving the label a stable min-width with
  `tabular-nums` and preventing wrap (`flex-nowrap`, `shrink-0`), or restructuring to label-above / steppers-
  below so width never forces a reflow. Verify at all label widths (1:00 AM → 12:45 PM).

**#7 — Custom on-screen keyboard.** New `OnScreenKeyboard` rendered *inside* the panel (so it scales with the
canvas and shows no OS chrome):
- Text inputs (Title, and Description if/when added) become `readOnly` / `inputMode="none"` and
  `onFocus`/tap open the in-app keyboard; the OS keyboard never appears, so the canvas never shrinks.
- Keyboard manages the focused field, insertion, backspace, shift/caps, space, `123?` numeric/symbol layer,
  and a Done key. Themed with existing tokens (ground/surface/ink), touch-sized keys (spec §6.1).
- Because the OS keyboard is suppressed, no viewport change is needed; the `interactive-widget` route is not
  taken. (Kept in back pocket only if a stray OS keyboard ever appears.)

---

## Workstream E — Day interaction: list → detail (#10, #11)

**Goal.** Tapping a day never creates an event; it opens a **list** of that day's events; tapping an event
**expands its details**; each event has an **edit** control; a day with exactly one event opens straight to
that event's detail.

**Files:** `src/components/calendar/DayCell.tsx`, `WeekView.tsx`, `MonthGrid.tsx`, `DayPanel.tsx` (reworked
into list + detail), new `src/components/calendar/EventDetail.tsx`, `CalendarView.tsx` (wire state).

**#10 — Remove add-on-tap.** Delete the full-cell background "add" `<button>` in `DayCell` and the equivalent
in `WeekView`; collapse each cell to a single tap target that opens the day. This also removes the layered
`pointer-events` juggling (see #8). The floating **+** FAB remains the add entry point (optionally, the day
list keeps a small "Add to this day" that pre-fills the date).

**#11 — List → detail flow.** `DayPanel` becomes:
- **List view:** the day's events as rows (reuse `EventChip variant="list"`), each row tappable to open detail,
  each with an explicit **edit** icon (pencil) as a distinct target.
- **Detail view (`EventDetail`):** full event info — title, date, time range, assignees (colored avatars),
  countdown/repeat state, description — plus an **Edit** button (→ existing `AddEventPanel` edit mode) and a
  Back control to the list. **No Add button here (#6).**
- **Single-event shortcut:** when a day has exactly one event, `onOpenDay` opens directly to that event's
  `EventDetail` (skip the one-row list). Provide Back that returns to… the grid (since there was no list).
- State: extend `CalendarView` with an "open day + optional selected event" model, or let `DayPanel` own an
  internal `selected` event with the single-event shortcut computed on open.

---

## Workstream F — Touch reliability (#8)

**Goal.** Eliminate the "had to tap twice" behavior.

**Suspected causes & fixes:**
1. **Layered tap zones** (`DayCell`/`WeekView`: an absolute add-button behind a `pointer-events-none` content
   layer with the events re-enabling pointer events). Removing add-on-tap (#10) collapses this to one clean
   target — the highest-value fix.
2. **JS double-tap suppressor** in `KioskGuards.tsx` `onTouchEnd` (preventDefault within 300ms of the previous
   touchend). CSS `touch-action: manipulation` already disables double-tap-zoom, making the JS handler largely
   redundant and a plausible cause of swallowed quick/second taps. Plan: remove or tighten it (only cancel a
   genuine same-target double tap), then verify zoom is still suppressed by the CSS alone.
3. **Verify on device** after 1–2: quick repeated taps on chips, day cells, filter chips, FAB, and keyboard
   keys. Use `adb` (or Fully Kiosk) if we need pointer diagnostics. Confirm the Stage transform isn't
   mid-reflowing on tap (the ResizeObserver settle timers fire only at mount, so this should be quiet).

---

## Workstream G — Liven up the UI (#12) · app-wide polish

**Goal.** A fun, engaging, legible household app: better icon usage, a touch of color, cleaner separation —
applied throughout, not bolted on.

**Direction (calm base, saturation still reserved for people per spec §7 — color as *accent*, not decoration):**
- **Icons that earn their place** (lucide, already a dependency): titles/actions gain a leading icon where it
  aids scanning — e.g. New/Edit event headers, Assign (users), Reminder (bell), Repeats (repeat), Countdown
  (timer), All-day (sun/calendar), day-panel header (calendar-days), settings sections. Icons *augment* labels
  for a mixed adults-and-kids audience; avoid icon-only where meaning isn't obvious.
- **Separation:** consistent section dividers/cards and spacing rhythm in the Add/Edit panel, Day panel/detail,
  and Settings; align paddings to the type scale.
- **A touch of color:** member-colored accents in detail/list (assignee avatars, left color rail on event rows),
  gentle tints (the #1 chip treatment, #3 swatches) — kept within the warm-neutral system so the grid still
  reads at six feet.
- **Consistency pass:** rounded radii, button styles, and touch sizes unified across panels.

This workstream is folded into B/D/E as each surface is touched, plus a final sweep of the Settings page and
Sidebar.

---

## Suggested implementation order

1. **F prerequisites + E (#10, #11, #8)** — the day interaction rework removes the layered tap zones, so do it
   early; it unblocks the touch fix and reshapes where "Add" appears (#6).
2. **D (#5, #9, #6, then #7 keyboard)** — panel restructure first, keyboard last (largest new component).
3. **A (#1, #2)** — header/filter layout + Family chip + tint.
4. **C (#4)** — timezone (small, isolated; needs a device check).
5. **B (#3)** — new settings store + API + picker (most infrastructure; independent of the rest).
6. **G (#12)** — final polish sweep over everything touched, plus Settings/Sidebar.

_B and C are independent and can be reordered; A/D/E/F are the interlocked calendar core._

## Verification plan

- **Local (mock):** `HEARTH_CALENDAR_MOCK=1` covers bands, family events, countdowns, filters, fan-out —
  exercise every panel and the new keyboard against it. Drive flows with the app running (per the `verify`/`run`
  skills) before committing each workstream.
- **Device (Skylight):** the items that *only* reproduce on hardware — #4 (time), #7 (keyboard/no-shrink),
  #8 (touch), and the #1 `color-mix` render check. Needs `adb` (not currently on PATH) or Fully Kiosk; I'll
  request `! adb …` commands from you where device state is needed.

## Open items / operator actions

- **#3 persistence:** attach a Railway **volume** and set `HEARTH_DATA_DIR` (or opt into Redis/Postgres). I'll
  wire the code to the volume path and document the exact Railway steps.
- **#4:** confirm whether the device's epoch (not just its timezone) is correct via `adb shell date`.
- **#3 note:** confirm you're OK decoupling wall colors from each person's Google color (that's inherent to
  making them customizable).

## Out of scope (unless you say otherwise)

- Editing repeat/reminder from the wall (still phone-only, unchanged).
- Adding a Description field to events (mentioned in the reference screenshot; the current form has none — I can
  add it under #9/#12 if you want, but it's not in the 12 items).
- Any change to the Google fan-out / write model.
