"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { ViewFrame } from "@/components/layout/ViewFrame";
import { useUpstream } from "@/hooks/useUpstream";
import { useIdleReset } from "@/hooks/useIdleReset";
import type { MealPlanPayload, PlannedMeal } from "@/lib/spoon/types";
import { MealCardPanel, MealMeta } from "./MealCardPanel";
import { MealImage } from "./mealVisuals";

// The Meals view (Phase 4, spec §4.5, D6) — a glanceable "what's for dinner."
// The week's plan from Enchanted Spoon, each meal a tile showing its day and
// dish; tapping one opens its card (ingredients + recipe). Read-only but for one
// gesture: "Mark cooked" on a tile (or in the card) drops that meal off the wall.
// Everything else stays on the phone — assigning, swapping, editing, and undoing
// a mistaken completion (that last one lives in Enchanted Spoon, so there is no
// undo here on purpose).
//
// Polls every 60s on Hearth's stale-data contract (useUpstream): a plan changed
// on a phone lands on the wall within a minute, and a failed poll keeps the last
// good render rather than blanking (spec §6.2). Marking cooked is optimistic —
// the meal vanishes at once and the poll reconciles; a failed write lets it
// reappear with a quiet inline note, never a global error. Not connected → a
// calm state, never an error (like the Tada! surfaces).

/** A plan row's day chip: "Today"/"Tomorrow"/weekday, or "Queued" when the
 *  entry has no scheduled date (Enchanted Spoon's planner is a queue). */
function planDay(iso: string | null): { label: string; sub: string | null } {
  if (!iso) return { label: "Queued", sub: null };
  const parts = iso.split("-").map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d) return { label: "Queued", sub: null };
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  const monthDay = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (diffDays === 0) return { label: "Today", sub: monthDay };
  if (diffDays === 1) return { label: "Tomorrow", sub: monthDay };
  if (diffDays === -1) return { label: "Yesterday", sub: monthDay };
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  return { label: weekday, sub: monthDay };
}

function MealTile({
  meal,
  onOpen,
  onCook,
}: {
  meal: PlannedMeal;
  onOpen: () => void;
  onCook: () => void;
}) {
  const day = planDay(meal.scheduledDate);
  const isToday = day.label === "Today";
  return (
    // A relative wrapper so "Mark cooked" is a SIBLING of the open button, not
    // nested inside it (nesting buttons is invalid, and a tap on the corner must
    // complete the meal, not open its card).
    <div className="relative h-full">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${meal.name}`}
        className={[
          "flex h-full w-full flex-col overflow-hidden rounded-3xl bg-surface text-left",
          "shadow-[0_2px_14px_rgba(87,55,34,0.07)] transition-transform active:scale-[0.99]",
          // "Today" gets an accent ring so tonight's dinner draws the eye across
          // the room; every other tile a quiet hairline.
          isToday ? "ring-2 ring-accent/45" : "ring-1 ring-hairline/70",
        ].join(" ")}
      >
        {/* Picture surface: real photo when Enchanted Spoon has one, else a
            colored tone placeholder with a food glyph. */}
        <div className="relative h-48 w-full shrink-0">
          <MealImage
            id={meal.mealId}
            name={meal.name}
            imageUrl={meal.imageUrl}
            iconClassName="size-24"
          />
          <span
            className={[
              "absolute left-4 top-4 rounded-full px-4 py-1.5 text-label font-medium leading-none shadow-sm",
              isToday ? "bg-coral text-white" : "bg-surface/90 text-ink backdrop-blur-sm",
            ].join(" ")}
          >
            {day.sub ? `${day.label} · ${day.sub}` : day.label}
          </span>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col p-6">
          <h2 className="font-display text-title leading-tight text-ink">{meal.name}</h2>
          {meal.mainRecipeName && meal.mainRecipeName !== meal.name && (
            <p className="mt-1 line-clamp-1 text-body text-ink-soft">{meal.mainRecipeName}</p>
          )}
          <div className="mt-auto pt-5">
            <MealMeta totalTime={meal.totalTime} sideDishCount={meal.sideDishCount} />
          </div>
        </div>
      </button>

      {/* Mark cooked — the one write. Sits over the top-right of the photo; a
          check + word so it reads as an action, not a status badge. */}
      <button
        type="button"
        onClick={onCook}
        aria-label={`Mark ${meal.name} cooked`}
        className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full bg-surface/95 px-4 py-2.5 text-label font-medium leading-none text-teal-strong shadow-sm ring-1 ring-teal/25 backdrop-blur-sm transition-transform hover:bg-surface active:scale-95"
      >
        <Check className="size-5" strokeWidth={2.75} aria-hidden />
        Mark cooked
      </button>
    </div>
  );
}

const HEADERS = { "content-type": "application/json" } as const;

export function MealsView() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState<PlannedMeal | null>(null);
  // Entries optimistically dropped by a "Mark cooked" tap, before the write's
  // refetch confirms them. Kept only for that window — `handleCook` unhides each
  // one once fresh data reports it completed, from where the filter takes over.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);

  const fetcher = useCallback(async (): Promise<MealPlanPayload> => {
    const res = await fetch("/api/meals", { cache: "no-store" });
    if (!res.ok) throw new Error(`meals ${res.status}`);
    return res.json();
  }, []);

  const { data, isStale, lastUpdated, refetch, isLoading } = useUpstream<MealPlanPayload>(
    fetcher,
    { intervalMs: 60_000, enabled: mounted },
  );

  const unhide = useCallback((entryId: string) => {
    setHidden((prev) => {
      if (!prev.has(entryId)) return prev;
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });
  }, []);

  const handleCook = useCallback(
    async (meal: PlannedMeal) => {
      setError(null);
      setHidden((prev) => new Set(prev).add(meal.entryId)); // vanish at once
      try {
        const res = await fetch("/api/meals/complete", {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify({ entryId: meal.entryId }),
        });
        if (!res.ok) throw new Error(`complete ${res.status}`);
        // Pull fresh data (now reporting the entry completed), THEN stop hiding
        // it locally — from here the `!isCompleted` filter keeps it off the wall,
        // and if it's ever restored in Enchanted Spoon it can reappear.
        await refetch();
        unhide(meal.entryId);
      } catch {
        // Never a global error (spec §6.2): let the meal reappear, note it inline.
        unhide(meal.entryId);
        setError("Couldn't mark that cooked just now — it'll retry.");
      }
    },
    [refetch, unhide],
  );

  // Idle reset: close an open card so the wall returns to the plan (checklist #17).
  useIdleReset(
    useCallback(() => {
      setOpen(null);
      setError(null);
    }, []),
    { enabled: mounted },
  );

  if (!mounted) {
    return <ViewFrame title="Meals">{null}</ViewFrame>;
  }

  const configured = data?.configured ?? false;
  const meals = data?.meals ?? [];
  // A completed meal never shows on the wall — restore it from Enchanted Spoon.
  // `hidden` covers the optimistic window before the poll reports isCompleted.
  const visible = meals.filter((m) => !m.isCompleted && !hidden.has(m.entryId));

  return (
    <ViewFrame title="Meals" isStale={isStale} lastUpdated={lastUpdated}>
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          {isLoading ? (
            // Stay quiet until the first poll resolves — never flash "not
            // connected" while we simply haven't loaded yet.
            null
          ) : !configured ? (
            <NotConnected />
          ) : meals.length === 0 ? (
            <EmptyPlan />
          ) : visible.length === 0 ? (
            <AllCooked />
          ) : (
            <div className="h-full overflow-y-auto">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(26rem,1fr))] gap-5 pb-2 [grid-auto-rows:1fr]">
                {visible.map((meal) => (
                  <MealTile
                    key={meal.entryId}
                    meal={meal}
                    onOpen={() => setOpen(meal)}
                    onCook={() => handleCook(meal)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        {error && (
          <p className="shrink-0 pt-3 text-center text-label text-ink-faint" role="status">
            {error}
          </p>
        )}
      </div>

      {open && (
        <MealCardPanel
          mealId={open.mealId}
          mealName={open.name}
          onClose={() => setOpen(null)}
          onCooked={() => {
            const meal = open;
            setOpen(null);
            void handleCook(meal);
          }}
        />
      )}
    </ViewFrame>
  );
}

function EmptyPlan() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-title text-ink-soft">No meals planned yet.</p>
      <p className="max-w-xl text-body text-ink-faint">
        Meals you plan in Enchanted Spoon show up here.
      </p>
    </div>
  );
}

// Everything on the plan has been cooked — a calm "all done" rest state rather
// than the "nothing planned" copy, so the wall reads right after the last meal.
function AllCooked() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <span className="flex size-20 items-center justify-center rounded-full bg-teal-soft text-teal-strong">
        <Check className="size-11" strokeWidth={2.5} aria-hidden />
      </span>
      <p className="font-display text-title text-ink-soft">All cooked.</p>
      <p className="max-w-xl text-body text-ink-faint">
        Plan the next meals in Enchanted Spoon and they’ll appear here.
      </p>
    </div>
  );
}

function NotConnected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-title text-ink-soft">Not connected to Enchanted Spoon yet.</p>
      <p className="max-w-xl text-body text-ink-faint">
        The week’s meal plan appears here once Enchanted Spoon is set up.
      </p>
    </div>
  );
}
