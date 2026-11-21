"use client";

import { useState, type ReactNode } from "react";
import {
  Backpack,
  BookOpen,
  CalendarDays,
  CookingPot,
  ListChecks,
  Plus,
  ShoppingBasket,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { useHousehold } from "@/components/app/Household";
import { AllowanceCard } from "@/components/allowance/AllowanceCard";
import { EventRow } from "@/components/calendar/EventChip";
import { eventsForLens } from "@/components/calendar/CalendarView";
import { useEventSheets } from "@/components/calendar/EventSheets";
import { useTimeZone } from "@/components/common/TimeZone";
import { HeaderCountdown } from "@/components/layout/HeaderCountdown";
import { MealCardPanel, MealMeta } from "@/components/meals/MealCardPanel";
import { CookedButton } from "@/components/meals/MealTile";
import { MealImage } from "@/components/meals/mealVisuals";
import { SchoolDay } from "@/components/schedule/SchoolDay";
import { AddItemBar, ShoppingItems } from "@/components/shopping/ShoppingPanel";
import { KidChoreList } from "@/components/tasks/ChoreList";
import { CleanTask } from "@/components/tasks/CleanSession";
import { Button } from "@/components/ui/Button";
import { AsOf, Card, EmptyState, SourceGate } from "@/components/ui/Card";
import { Page } from "@/components/ui/Page";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import {
  useCleanSession,
  useKidsChores,
  useMealPlan,
  useSchoolWeek,
  useShoppingList,
} from "@/hooks/useHub";
import { useIdleReset } from "@/hooks/useIdleReset";
import { useClock, useNow } from "@/hooks/useNow";
import {
  addDays,
  dayPanelTitle,
  eventsForDay,
  parseBoundary,
  toDateParam,
  zonedNow,
} from "@/lib/calendar/dates";
import type { CalendarEvent } from "@/lib/calendar/types";
import { planDay, tonightsMeal } from "@/lib/spoon/format";
import type { PlannedMeal } from "@/lib/spoon/types";
import { isoDate, mondayOf, toMinutes } from "@/lib/tandem/week";

// Today: the hub's home. Everything that matters today from every connected
// app on one screen, with the everyday actions right there: check off a chore,
// finish a cleaning task, see (and open) tonight's dinner, add to the shopping
// list, add an event. Nobody has to remember which app owns what.
//
// Each card is its own source with its own loading, not-connected and stale
// states, so one app being down never blanks the rest (spec §6.2).
//
// The lens shapes it. Nobody selected: the whole family's day, the wall's
// resting view. A kid: their school day, their chores, their events, their
// allowance. A parent: the family's events, the kids' progress, dinner and the
// list (and the cleaning session, for the adult who runs it).
//
// Wide: three columns that fill the frame. Phone: one column, most timely first.

const UPCOMING_DAYS = 7;
const UPCOMING_LIMIT = 5;

export function TodayView() {
  const timeZone = useTimeZone();
  const { lens } = useHousehold();
  const clock = useNow(timeZone);
  const instant = useClock();
  // A placeholder keeps the hooks in order during SSR; nothing is fetched or
  // drawn from it.
  const now = clock ?? zonedNow(timeZone);
  const todayIso = isoDate(now);

  const calendar = useCalendarEvents(toDateParam(now), toDateParam(addDays(now, UPCOMING_DAYS + 1)));
  const school = useSchoolWeek(mondayOf(todayIso));
  const chores = useKidsChores();
  const clean = useCleanSession();
  const plan = useMealPlan();
  const list = useShoppingList();

  const events = eventsForLens(calendar.events, lens?.key ?? null);
  const sheets = useEventSheets({ calendar, events, now: clock });
  const [openMeal, setOpenMeal] = useState<PlannedMeal | null>(null);

  const closeSheets = sheets.close;
  const resetClean = clean.reset;
  const clearNotice = list.clearNotice;
  useIdleReset(() => {
    closeSheets();
    setOpenMeal(null);
    resetClean();
    clearNotice();
  });

  const isKid = lens?.role === "kid";
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // ── Agenda: today, then what's coming ──────────────────────────────────────
  const todayEvents = eventsForDay(events, now, timeZone);
  const upcoming: { date: Date; event: CalendarEvent }[] = [];
  for (let i = 1; i <= UPCOMING_DAYS && upcoming.length < UPCOMING_LIMIT; i++) {
    const date = addDays(now, i);
    for (const event of eventsForDay(events, date, timeZone)) {
      // A multi-day event already showing today isn't "coming up".
      if (todayEvents.some((e) => e.id === event.id)) continue;
      if (upcoming.some((u) => u.event.id === event.id)) continue;
      if (upcoming.length < UPCOMING_LIMIT) upcoming.push({ date, event });
    }
  }
  const isOver = (e: CalendarEvent) =>
    instant !== null && !e.allDay && parseBoundary(e.end).getTime() <= instant.getTime();

  const agenda = (
    <Card
      key="agenda"
      title={lens ? `${lens.name}'s calendar` : "On the calendar"}
      icon={CalendarDays}
      href="/calendar"
      className="wide:min-h-0 wide:flex-1"
      bodyClassName="flex flex-col wide:overflow-y-auto"
      stamp={<AsOf isStale={calendar.state.isStale} lastUpdated={calendar.state.lastUpdated} />}
      action={
        calendar.canAdd ? (
          <Button size="sm" variant="primary" onClick={() => sheets.openAdd(now)}>
            <Plus className="size-4" strokeWidth={3} aria-hidden />
            Event
          </Button>
        ) : undefined
      }
    >
      <SourceGate
        state={calendar.state}
        configured={calendar.configured}
        app="Google Calendar"
        what="Today's events"
        compact
      >
        {todayEvents.length === 0 ? (
          <p className="py-3 text-body text-ink-faint">Nothing on the calendar today.</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {todayEvents.map((ev) => (
              <li key={ev.id}>
                <EventRow
                  event={ev}
                  members={calendar.members}
                  now={now}
                  onOpen={sheets.openEvent}
                  dim={isOver(ev)}
                />
              </li>
            ))}
          </ul>
        )}

        {upcoming.length > 0 && (
          <div className="mt-3 border-t border-hairline pt-3">
            <h3 className="mb-1 text-stamp font-semibold uppercase tracking-[0.1em] text-ink-faint">
              Coming up
            </h3>
            <ul className="-mx-2 flex flex-col">
              {upcoming.map(({ date, event }, i) => {
                const newDay = i === 0 || upcoming[i - 1].date.getTime() !== date.getTime();
                return (
                  <li key={event.id}>
                    {newDay && (
                      <p className="px-2 pt-2 text-label font-semibold text-ink-soft">
                        {i === 0 && date.getTime() === addDays(now, 1).getTime()
                          ? "Tomorrow"
                          : dayPanelTitle(date)}
                      </p>
                    )}
                    <EventRow event={event} members={calendar.members} now={now} onOpen={sheets.openEvent} />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </SourceGate>
    </Card>
  );

  // ── School: today's blocks (hidden when there are none, e.g. a weekend) ────
  const schoolKids = (school.data?.kids ?? []).filter(
    (k) => !lens?.tandemChild || k.child === lens.tandemChild,
  );
  const schoolToday = (school.data?.activities ?? []).filter(
    (a) => a.day === todayIso && (!lens?.tandemChild || a.child === lens.tandemChild),
  );
  // Under a kid's lens the whole day shows. Otherwise only what's still ahead,
  // and once the last block is over the card steps aside for the evening.
  const schoolAhead = schoolToday.some((a) => toMinutes(a.end) > nowMinutes);
  const showSchool =
    school.isLoading ||
    school.failed ||
    !school.data?.configured ||
    (isKid ? schoolToday.length > 0 : schoolAhead);
  const schoolCard = showSchool ? (
    <Card
      key="school"
      title="School today"
      icon={Backpack}
      href="/school"
      className={isKid ? "wide:min-h-0 wide:flex-1" : "wide:max-h-[55%] wide:shrink-0"}
      bodyClassName="wide:overflow-y-auto"
      stamp={<AsOf isStale={school.isStale} lastUpdated={school.lastUpdated} />}
    >
      <SourceGate
        state={school}
        configured={school.data?.configured ?? false}
        app="Tandem"
        what="The kids' school day"
        compact
      >
        <SchoolDay
          kids={schoolKids}
          activities={schoolToday}
          nowMinutes={nowMinutes}
          limit={isKid ? undefined : 2}
        />
      </SourceGate>
    </Card>
  ) : null;

  // ── Chores ─────────────────────────────────────────────────────────────────
  const columns =
    isKid && lens?.tadaId ? chores.columns.filter((c) => c.kid.id === lens.tadaId) : chores.columns;
  const choresCard = (
    <Card
      key="chores"
      title={isKid ? "My chores" : "Chores"}
      icon={ListChecks}
      href="/chores"
      className="wide:min-h-0 wide:flex-1"
      bodyClassName="wide:overflow-y-auto"
      stamp={<AsOf isStale={chores.state.isStale} lastUpdated={chores.state.lastUpdated} />}
    >
      <SourceGate
        state={chores.state}
        configured={chores.configured}
        app="Tada!"
        what="The kids' chores"
        compact
      >
        {columns.length === 0 ? (
          <p className="py-3 text-body text-ink-faint">No chores set up.</p>
        ) : (
          <div
            className="grid gap-x-6 gap-y-5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))" }}
          >
            {columns.map((col) => (
              <KidChoreList
                key={col.kid.id}
                column={col}
                showHeader={columns.length > 1 || !isKid}
                onComplete={(chore) => chores.complete(col.kid.id, chore)}
                onUndo={(chore) => chores.undo(col.kid.id, chore)}
              />
            ))}
          </div>
        )}
      </SourceGate>
    </Card>
  );

  // ── Cleaning: the one next task (never a list, spec D4) ────────────────────
  const showClean = lens === null || lens.cleans;
  const cleanCard = showClean ? (
    <Card
      key="clean"
      title={clean.adult ? `${clean.adult.name}'s cleaning` : "Cleaning"}
      icon={Sparkles}
      href="/chores?view=clean"
      className="wide:shrink-0"
      stamp={<AsOf isStale={clean.state.isStale} lastUpdated={clean.state.lastUpdated} />}
    >
      <SourceGate
        state={clean.state}
        configured={clean.configured}
        app="Tada!"
        what="The cleaning session"
        rows={2}
        compact
      >
        <CleanTask session={clean} compact />
      </SourceGate>
    </Card>
  ) : null;

  // ── Dinner ─────────────────────────────────────────────────────────────────
  const tonight = tonightsMeal(plan.meals, now);
  // The next couple of dinners, for whoever plans around them (not a kid's day).
  const later = isKid
    ? []
    : plan.meals.filter((m) => m !== tonight && m.scheduledDate !== null).slice(0, 2);
  const dinnerCard = (
    <Card
      key="dinner"
      title="Dinner"
      icon={UtensilsCrossed}
      href="/kitchen"
      className="wide:shrink-0"
      stamp={<AsOf isStale={plan.state.isStale} lastUpdated={plan.state.lastUpdated} />}
    >
      <SourceGate
        state={plan.state}
        configured={plan.configured}
        app="Enchanted Spoon"
        what="Tonight's dinner"
        rows={2}
        compact
      >
        {tonight ? (
          <div className="flex items-stretch gap-4">
            <button
              type="button"
              onClick={() => setOpenMeal(tonight)}
              aria-label={`Open ${tonight.name}`}
              className="size-[5.5rem] shrink-0 overflow-hidden rounded-2xl ring-1 ring-hairline active:scale-[0.98]"
            >
              <MealImage id={tonight.mealId} name={tonight.name} imageUrl={tonight.imageUrl} iconClassName="size-10" />
            </button>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
              <div>
                <p className="text-stamp font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  {planDay(tonight.scheduledDate, now).label}
                </p>
                <h3 className="font-display text-title leading-tight text-ink">{tonight.name}</h3>
                <div className="mt-1">
                  <MealMeta totalTime={tonight.totalTime} sideDishCount={tonight.sideDishCount} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setOpenMeal(tonight)}>
                  <BookOpen className="size-4" strokeWidth={2.25} aria-hidden />
                  Recipe
                </Button>
                <CookedButton name={tonight.name} onCook={() => plan.cook(tonight)} className="!min-h-9 !shadow-none" />
              </div>
            </div>
          </div>
        ) : (
          <EmptyState icon={CookingPot} title="Nothing planned for tonight" compact>
            Plan dinners in Enchanted Spoon and tonight&rsquo;s shows here.
          </EmptyState>
        )}
        {later.length > 0 && (
          <ul className="mt-3 flex flex-col border-t border-hairline pt-2">
            {later.map((m) => (
              <li key={m.entryId}>
                <button
                  type="button"
                  onClick={() => setOpenMeal(m)}
                  className="flex w-full items-baseline gap-3 rounded-xl py-1.5 text-left active:bg-surface-2"
                >
                  <span className="w-[5.5em] shrink-0 text-label text-ink-soft">
                    {planDay(m.scheduledDate, now).label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body text-ink">{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {plan.error && (
          <p className="pt-2 text-label text-bad" role="status">
            {plan.error}
          </p>
        )}
      </SourceGate>
    </Card>
  );

  // ── Shopping ───────────────────────────────────────────────────────────────
  const shoppingCard = !isKid ? (
    <Card
      key="shopping"
      title="Shopping list"
      icon={ShoppingBasket}
      href="/kitchen?tab=shopping"
      className="wide:min-h-0 wide:flex-1"
      bodyClassName="flex flex-col gap-3 wide:overflow-y-auto"
      stamp={<AsOf isStale={list.state.isStale} lastUpdated={list.state.lastUpdated} />}
    >
      <SourceGate
        state={list.state}
        configured={list.configured}
        app="Enchanted Spoon"
        what="The shopping list"
        rows={2}
        compact
      >
        <AddItemBar list={list} />
        <ShoppingItems list={list} limit={10} />
      </SourceGate>
    </Card>
  ) : null;

  // ── Allowance: a kid's own balance, only under their own lens ──────────────
  // Keyed by the kid, so switching from one kid to another remounts the card:
  // the previous kid's amount must never linger on screen while the next loads.
  const allowanceCard =
    isKid && lens ? <AllowanceCard key={`allowance-${lens.key}`} member={lens} /> : null;

  // Three columns on a wide screen, each a kind of question: when (calendar and
  // school), what's to do (chores and cleaning), what's to eat (dinner and the
  // list). A phone shows the same cards top to bottom in that order. A kid's
  // day leads with what a kid needs first: school, chores and their money.
  const columnsWide: ReactNode[][] = isKid
    ? schoolCard
      ? [[schoolCard], [choresCard, allowanceCard], [agenda, dinnerCard]]
      : [[choresCard, allowanceCard], [agenda], [dinnerCard]]
    : [[agenda, schoolCard], [choresCard, cleanCard], [dinnerCard, shoppingCard]];

  return (
    <Page
      title={!clock ? "Today" : lens ? `${lens.name}'s day` : greeting(now)}
      controls={<HeaderCountdown className="wide:hidden" />}
    >
      <div className="flex flex-col gap-4 wide:h-full wide:flex-row wide:gap-5">
        {columnsWide.map((cards, i) => (
          <div
            key={i}
            className={`flex min-w-0 flex-col gap-4 wide:min-h-0 wide:gap-5 ${
              i === 1 ? "wide:flex-[5]" : "wide:flex-[4]"
            }`}
          >
            {cards}
          </div>
        ))}
      </div>

      {sheets.element}
      {openMeal && (
        <MealCardPanel
          mealId={openMeal.mealId}
          mealName={openMeal.name}
          onClose={() => setOpenMeal(null)}
          onCooked={() => {
            const meal = openMeal;
            setOpenMeal(null);
            plan.cook(meal);
          }}
        />
      )}
    </Page>
  );
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
