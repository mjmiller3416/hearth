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
import { PhotoFrame } from "@/components/photos/PhotoFrame";
import { SchoolDay } from "@/components/schedule/SchoolDay";
import { AddItemBar, ShoppingItems } from "@/components/shopping/ShoppingPanel";
import { KidChoreList } from "@/components/tasks/ChoreList";
import { CleanTask } from "@/components/tasks/CleanSession";
import { Button } from "@/components/ui/Button";
import { WeatherLine, WeatherTile } from "@/components/weather/Weather";
import { AsOf, SourceGate, Tile } from "@/components/ui/Tile";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import {
  useCleanSession,
  useKidsChores,
  useMealPlan,
  usePhotos,
  useSchoolWeek,
  useShoppingList,
  useWeather,
  type MealPlan,
} from "@/hooks/useHub";
import { useIdleReset } from "@/hooks/useIdleReset";
import { useClock, useNow } from "@/hooks/useNow";
import {
  addDays,
  dayPanelTitle,
  eventsForDay,
  isToday,
  monthGridRange,
  monthMatrix,
  monthTitle,
  parseBoundary,
  toDateParam,
  WEEKDAY_LABELS,
  zonedNow,
} from "@/lib/calendar/dates";
import type { CalendarEvent } from "@/lib/calendar/types";
import { planDay, tonightsMeal } from "@/lib/spoon/format";
import type { PlannedMeal } from "@/lib/spoon/types";
import { isoDate, mondayOf, toMinutes } from "@/lib/tandem/week";

// Home: the screen the wall rests on, and where every phone opens.
//
// It is laid out like a picture frame rather than a dashboard. On a wide
// screen the left third is the clock over a family photo that changes slowly,
// with tonight's dinner beneath it (with no photos yet, the clock sits on the
// sky and dinner is the big picture). The rest is a handful of tiles, each its own
// color: the calendar (with the month beside it), the kids' chores, school,
// the cleaning session, the weather and the shopping list. Everything is live and the
// everyday actions are right there: check off a chore, finish a cleaning task,
// open tonight's recipe, add to the list, add an event.
//
// Each tile is its own source with its own loading, not-connected and stale
// states, so one app being down never blanks the rest (spec §6.2).
//
// Who's looking shapes it. Nobody selected: the whole family's day, the wall's
// resting view. A kid: their school day, their chores, their events and their
// allowance. A parent: the family's events, the kids' progress, dinner and the
// list (and the cleaning session, for the adult who runs it).
//
// A phone shows the same things top to bottom in one scrolling column.

const UPCOMING_DAYS = 7;
const UPCOMING_LIMIT = 4;

export function HomeView() {
  const timeZone = useTimeZone();
  const { lens } = useHousehold();
  const clock = useNow(timeZone);
  const instant = useClock();
  // A placeholder keeps the hooks in order during SSR; nothing is fetched or
  // drawn from it.
  const now = clock ?? zonedNow(timeZone);
  const todayIso = isoDate(now);

  // The calendar read covers the month on show beside the agenda and the week
  // ahead, whichever reaches further.
  const month = monthGridRange(now);
  const ahead = addDays(now, UPCOMING_DAYS + 1);
  const calendar = useCalendarEvents(
    toDateParam(month.start),
    toDateParam(month.end.getTime() > ahead.getTime() ? month.end : ahead),
  );
  const school = useSchoolWeek(mondayOf(todayIso));
  const chores = useKidsChores();
  const clean = useCleanSession();
  const plan = useMealPlan();
  const list = useShoppingList();
  const weather = useWeather();
  const photos = usePhotos();

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

  // ── Calendar: today, then what's coming ────────────────────────────────────
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

  const agendaTile = (
    <Tile
      key="agenda"
      tone="glass"
      title={lens ? `${lens.name}'s calendar` : "Calendar"}
      icon={CalendarDays}
      href="/calendar"
      className="wide:min-w-0 wide:flex-[7]"
      bodyClassName="flex gap-6 wide:overflow-hidden"
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
        <div className="min-w-0 flex-1 wide:overflow-y-auto">
          <DayLabel>Today</DayLabel>
          {todayEvents.length === 0 ? (
            <p className="px-2 py-2 font-display text-lead text-fg-soft">Nothing on today.</p>
          ) : (
            <ul className="flex flex-col">
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

          {upcoming.map(({ date, event }, i) => {
            const newDay = i === 0 || upcoming[i - 1].date.getTime() !== date.getTime();
            return (
              <div key={event.id}>
                {newDay && (
                  <DayLabel className="mt-3">
                    {date.getTime() === addDays(now, 1).getTime() ? "Tomorrow" : dayPanelTitle(date)}
                  </DayLabel>
                )}
                <EventRow event={event} members={calendar.members} now={now} onOpen={sheets.openEvent} />
              </div>
            );
          })}
        </div>

        {/* The month beside the agenda, on a wide screen under the family view. */}
        {!isKid && clock && (
          <MiniMonth
            now={now}
            events={events}
            timeZone={timeZone}
            onDay={sheets.openDay}
            className="hidden w-[17rem] shrink-0 border-l border-line pl-6 wide:block"
          />
        )}
      </SourceGate>
    </Tile>
  );

  // ── School: today's blocks (hidden when there are none, e.g. a weekend) ────
  const schoolKids = (school.data?.kids ?? []).filter(
    (k) => !lens?.tandemChild || k.child === lens.tandemChild,
  );
  const schoolToday = (school.data?.activities ?? []).filter(
    (a) => a.day === todayIso && (!lens?.tandemChild || a.child === lens.tandemChild),
  );
  // When a kid is looking the whole day shows. Otherwise only what's still
  // ahead, and once the last block is over the tile steps aside for the evening.
  const schoolAhead = schoolToday.some((a) => toMinutes(a.end) > nowMinutes);
  const showSchool =
    school.isLoading ||
    school.failed ||
    !school.data?.configured ||
    (isKid ? schoolToday.length > 0 : schoolAhead);
  const schoolTile = showSchool ? (
    <Tile
      key="school"
      tone="sun"
      title="School today"
      icon={Backpack}
      watermark={Backpack}
      href="/school"
      className="wide:min-w-0 wide:flex-1"
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
    </Tile>
  ) : null;

  // ── Chores ─────────────────────────────────────────────────────────────────
  const columns =
    isKid && lens?.tadaId ? chores.columns.filter((c) => c.kid.id === lens.tadaId) : chores.columns;
  const choresTile = (
    <Tile
      key="chores"
      tone="grape"
      title={isKid ? "My chores" : "Chores"}
      icon={ListChecks}
      watermark={ListChecks}
      href="/chores"
      className={isKid ? "wide:min-w-0 wide:flex-1" : "wide:min-w-0 wide:flex-[5]"}
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
          <p className="py-2 text-body text-fg-soft">No chores set up.</p>
        ) : (
          <div
            className="grid gap-x-6 gap-y-5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 11.5rem), 1fr))" }}
          >
            {columns.map((col) => (
              <KidChoreList
                key={col.kid.id}
                column={col}
                onComplete={(chore) => chores.complete(col.kid.id, chore)}
                onUndo={(chore) => chores.undo(col.kid.id, chore)}
              />
            ))}
          </div>
        )}
      </SourceGate>
    </Tile>
  );

  // ── Cleaning: the one next task (never a list, spec D4) ────────────────────
  const showClean = lens === null || lens.cleans;
  const cleanTile = showClean ? (
    <Tile
      key="clean"
      tone="ocean"
      title="Cleaning"
      icon={Sparkles}
      watermark={Sparkles}
      href="/chores?view=clean"
      className="wide:min-w-0 wide:flex-1"
      bodyClassName="flex flex-col justify-center"
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
    </Tile>
  ) : null;

  // ── Shopping: a paper list, like the one on the fridge ─────────────────────
  const shoppingTile = !isKid ? (
    <Tile
      key="shopping"
      tone="paper"
      title="Shopping list"
      icon={ShoppingBasket}
      href="/kitchen?tab=shopping"
      className="wide:min-w-0 wide:flex-1"
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
        <ShoppingItems list={list} limit={6} />
      </SourceGate>
    </Tile>
  ) : null;

  // ── Allowance: a kid's own balance, only when that kid is the one looking ──
  // Keyed by the kid, so switching from one kid to another remounts the tile:
  // the previous kid's amount must never linger on screen while the next loads.
  const allowanceTile =
    isKid && lens ? (
      <AllowanceCard key={`allowance-${lens.key}`} member={lens} className="wide:min-w-0 wide:flex-[5]" />
    ) : null;

  // ── Weather: the hours ahead, in the school tile's place once school is
  // over (or on a day with none). The line under the clock is always there.
  const weatherTile =
    !isKid && !schoolTile ? (
      <WeatherTile key="weather" state={weather} className="wide:min-w-0 wide:flex-1" />
    ) : null;

  // Two rows of tiles on a wide screen; a phone stacks them in this order. A
  // kid's day leads with what a kid needs first: school, chores and their money.
  const rows: ReactNode[][] = isKid
    ? [
        [schoolTile, choresTile],
        [agendaTile, allowanceTile],
      ]
    : [
        [agendaTile, choresTile],
        [schoolTile, weatherTile, cleanTile, shoppingTile],
      ];

  const greeting = !clock ? "Hello" : lens ? `${lens.name}'s day` : greetingFor(now);

  // ── Family photos: the picture behind the clock ────────────────────────────
  const photoList = photos.data?.photos ?? [];
  const hasPhotos = photoList.length > 0;
  const refetchPhotos = photos.refetch;
  const removePhoto = (id: string) => {
    void fetch(`/api/photos/${id}`, { method: "DELETE" }).finally(() => void refetchPhotos());
  };

  // The greeting, the time, the date and the weather: on the sky, or laid over
  // the photo.
  const clockface = (
    <>
      <p className="font-display text-lead font-medium text-fg-soft wide:text-big">{greeting}</p>
      <BigClock instant={instant} timeZone={timeZone} />
      <p className="hidden font-display text-big font-light text-fg wide:block">
        {clock
          ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
          : " "}
      </p>
      <WeatherLine weather={weather.data} className="mt-2 wide:mt-3" />
    </>
  );

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 wide:h-full wide:flex-row wide:gap-6 wide:px-7 wide:pb-1 wide:pt-6">
      {/* The left side: the clock over a family photo (or over the sky when
          there are none yet), and tonight's dinner. */}
      <div className="relative flex flex-col gap-4 wide:min-h-0 wide:w-[31%] wide:shrink-0 wide:gap-5">
        {hasPhotos ? (
          <>
            <PhotoFrame
              photos={photoList}
              daySeed={todayIso}
              onRemove={removePhoto}
              className="min-h-[25rem] wide:min-h-0 wide:flex-1"
            >
              {clockface}
            </PhotoFrame>
            <HeaderCountdown className="wide:hidden" />
            <DinnerFeature plan={plan} now={now} showLater={false} onOpen={setOpenMeal} compact />
          </>
        ) : (
          <>
            <Orb hour={clock ? now.getHours() + now.getMinutes() / 60 : 12} />
            <div className="relative px-1 pt-1 wide:px-2 wide:pt-0">
              {clockface}
              <HeaderCountdown className="mt-3 wide:hidden" />
            </div>
            <DinnerFeature plan={plan} now={now} showLater={!isKid} onOpen={setOpenMeal} />
          </>
        )}
      </div>

      {/* The tiles. */}
      <div className="flex flex-col gap-4 wide:min-h-0 wide:min-w-0 wide:flex-1 wide:gap-5">
        {rows.map((row, i) => (
          <div
            key={i}
            className={`flex flex-col gap-4 wide:min-h-0 wide:flex-row wide:gap-5 ${
              i === 0 ? "wide:flex-[11]" : "wide:flex-[9]"
            }`}
          >
            {row}
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
    </div>
  );
}

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** A small heading inside the calendar tile: "Today", "Tomorrow", a date. */
function DayLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`px-2 pb-0.5 text-tiny font-bold uppercase tracking-[0.14em] text-fg-faint ${className}`}>
      {children}
    </p>
  );
}

/**
 * The sun, or the moon in the evening theme (the CSS swaps its look). It sits
 * high at midday and lower toward morning and night, so the corner of the
 * screen changes through the day.
 */
function Orb({ hour }: { hour: number }) {
  // 0 at noon, 1 at 6am / 6pm and beyond.
  const fromNoon = Math.min(Math.abs(hour - 12) / 6, 1);
  return (
    <span
      className="orb right-[5%] size-[3.25rem] wide:right-[2%] wide:size-[5.5rem]"
      style={{ top: `${1 + fromNoon * 1.25}rem` }}
      aria-hidden
    />
  );
}

/** The time, as large as the screen allows. The date sits under it. */
function BigClock({ instant, timeZone }: { instant: Date | null; timeZone?: string }) {
  const parts = instant
    ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone }).formatToParts(instant)
    : [];
  const period = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const time = parts
    .filter((p) => p.type !== "dayPeriod")
    .map((p) => p.value)
    .join("")
    .trim();
  return (
    <p className="flex items-baseline gap-2 font-display text-clock font-light tabular-nums text-fg wide:-ml-1 wide:gap-3">
      {/* A placeholder of the same height until the clock is known. */}
      {time || " "}
      {period && <span className="text-big font-normal text-fg-soft">{period}</span>}
    </p>
  );
}

/**
 * Tonight's dinner as the big picture on Home: the photo when Enchanted Spoon
 * has one, else the meal's own color and glyph. Recipe and Cooked sit on it.
 */
function DinnerFeature({
  plan,
  now,
  showLater,
  onOpen,
  compact = false,
}: {
  plan: MealPlan;
  now: Date;
  /** Name the next couple of dinners too (for whoever plans around them). */
  showLater: boolean;
  onOpen: (meal: PlannedMeal) => void;
  /** A short banner (under the family photo) instead of the big picture. */
  compact?: boolean;
}) {
  const tonight = tonightsMeal(plan.meals, now);
  const later = showLater
    ? plan.meals.filter((m) => m !== tonight && m.scheduledDate !== null).slice(0, 2)
    : [];
  const frame = compact
    ? "on-color tile relative min-h-[11rem] wide:h-[12.5rem] wide:min-h-0 wide:shrink-0"
    : "on-color tile relative min-h-[15rem] wide:min-h-0 wide:flex-1";

  // Loading, not connected, unreachable or nothing planned: a plain leaf tile.
  if (plan.state.failed || plan.state.isLoading || !plan.configured || !tonight) {
    return (
      <section className={`${frame} tile-leaf flex flex-col justify-end p-5 wide:p-6`}>
        <CookingPot className="watermark" strokeWidth={1.5} aria-hidden />
        <p className="mb-2 text-tiny font-bold uppercase tracking-[0.14em] text-fg-soft">Dinner</p>
        <SourceGate
          state={plan.state}
          configured={plan.configured}
          app="Enchanted Spoon"
          what="Tonight's dinner"
          rows={2}
          compact
        >
          <p className="font-display text-big font-medium leading-tight text-fg">Nothing planned for tonight</p>
          <p className="mt-1 text-body text-fg-soft">
            Plan dinners in Enchanted Spoon and tonight&rsquo;s shows here.
          </p>
        </SourceGate>
      </section>
    );
  }

  return (
    <section className={frame} aria-label="Dinner">
      <button
        type="button"
        onClick={() => onOpen(tonight)}
        aria-label={`Open ${tonight.name}`}
        className="absolute inset-0 block text-left"
      >
        <MealImage
          id={tonight.mealId}
          name={tonight.name}
          imageUrl={tonight.imageUrl}
          iconClassName={
            compact
              ? "size-[6.5rem] -translate-y-[20%] translate-x-[110%] opacity-80 wide:translate-x-[150%]"
              : "size-[7rem] -translate-y-[38%] translate-x-[85%] opacity-80 wide:size-[13rem] wide:-translate-y-[22%] wide:translate-x-0 wide:opacity-100"
          }
        />
        <span
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 via-45% to-transparent"
          aria-hidden
        />
      </button>

      <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/35 px-3.5 py-1.5 text-tiny font-bold uppercase leading-none tracking-[0.12em] text-white wide:left-5 wide:top-5">
        {planDay(tonight.scheduledDate, now).label === "Tonight"
          ? "Tonight's dinner"
          : `Dinner · ${planDay(tonight.scheduledDate, now).label}`}
      </span>

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col p-4 ${
          compact ? "gap-1.5 wide:p-5" : "gap-2.5 wide:p-6"
        }`}
      >
        <h2
          className={`font-display font-medium text-white ${
            compact ? "line-clamp-1 text-big leading-tight" : "text-balance text-huge leading-[1.05]"
          }`}
        >
          {tonight.name}
        </h2>
        {!compact && <MealMeta totalTime={tonight.totalTime} sideDishCount={tonight.sideDishCount} />}
        {later.length > 0 && (
          <p className="truncate text-small text-fg-soft">
            Then{" "}
            {later.map((m, i) => (
              <span key={m.entryId}>
                {i > 0 && " · "}
                <span className="font-semibold text-white">{planDay(m.scheduledDate, now).label}</span>{" "}
                {m.name}
              </span>
            ))}
          </p>
        )}
        <div className="pointer-events-auto mt-1 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => onOpen(tonight)}>
            <BookOpen className="size-4" strokeWidth={2.5} aria-hidden />
            Recipe
          </Button>
          <CookedButton name={tonight.name} onCook={() => plan.cook(tonight)} className="!min-h-11 !px-5" />
        </div>
        {plan.error && (
          <p className="text-small text-bad" role="status">
            {plan.error}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * This month at a glance beside the agenda: today ringed, a dot under any day
 * with something on it. Tapping a day opens it.
 */
function MiniMonth({
  now,
  events,
  timeZone,
  onDay,
  className = "",
}: {
  now: Date;
  events: CalendarEvent[];
  timeZone?: string;
  onDay: (date: Date) => void;
  className?: string;
}) {
  const days = monthMatrix(now);
  const month = now.getMonth();
  return (
    <div className={className}>
      <p className="mb-2 text-center font-display text-lead font-medium text-fg">{monthTitle(now)}</p>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="pb-1 text-tiny font-bold uppercase tracking-wide text-fg-faint">
            {label.slice(0, 2)}
          </span>
        ))}
        {days.map((date) => {
          const inMonth = date.getMonth() === month;
          const today = isToday(date, now);
          const count = eventsForDay(events, date, timeZone).length;
          return (
            <button
              key={date.getTime()}
              type="button"
              onClick={() => onDay(date)}
              aria-label={`${dayPanelTitle(date)}, ${count} ${count === 1 ? "event" : "events"}`}
              className="group flex h-[2.45rem] flex-col items-center justify-start"
            >
              <span
                className={`flex size-8 items-center justify-center rounded-full font-display text-body leading-none transition-colors group-active:bg-fill-2 ${
                  today
                    ? "bg-accent font-semibold text-on-accent"
                    : inMonth
                      ? "text-fg"
                      : "text-fg-faint opacity-60"
                }`}
              >
                {date.getDate()}
              </span>
              <span
                className={`mt-0.5 size-1 rounded-full ${count > 0 && inMonth ? "bg-spark" : "bg-transparent"}`}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
