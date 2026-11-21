import type { PlannedMeal, ShoppingItem } from "./types";

// Client-safe presentation helpers for Enchanted Spoon data, shared by Today
// and the Kitchen page.

// ── Meal plan ───────────────────────────────────────────────────────────────

export interface PlanDay {
  /** "Tonight", "Tomorrow", a weekday, or "Up next" for an unscheduled entry. */
  label: string;
  /** "Nov 20", or null for an unscheduled entry. */
  sub: string | null;
  /** Whole days from today (0 = today), or null when unscheduled. */
  offset: number | null;
}

/** "YYYY-MM-DD" for a Date's local fields. */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * How a plan entry's day reads relative to `today` (a household-zone "now").
 * Enchanted Spoon's planner is a queue, so an entry may have no date at all.
 */
export function planDay(iso: string | null, today: Date): PlanDay {
  const parts = iso ? iso.split("-").map(Number) : [];
  const [y, m, d] = parts;
  if (!y || !m || !d) return { label: "Up next", sub: null, offset: null };
  const date = new Date(y, m - 1, d);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const offset = Math.round((date.getTime() - base.getTime()) / 86_400_000);
  const sub = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (offset === 0) return { label: "Tonight", sub, offset };
  if (offset === 1) return { label: "Tomorrow", sub, offset };
  if (offset === -1) return { label: "Yesterday", sub, offset };
  return { label: date.toLocaleDateString(undefined, { weekday: "long" }), sub, offset };
}

/**
 * Tonight's dinner: the entry scheduled for today, else the first entry still
 * waiting in the queue with no date (what Enchanted Spoon would cook next).
 */
export function tonightsMeal(meals: PlannedMeal[], today: Date): PlannedMeal | null {
  const iso = isoDay(today);
  return (
    meals.find((m) => m.scheduledDate === iso) ??
    meals.find((m) => m.scheduledDate === null) ??
    null
  );
}

// ── Shopping list ───────────────────────────────────────────────────────────

/** Where uncategorized rows go, and the group that always sorts last. */
const OTHER = "other";

/** "oils-and-vinegars" → "Oils and vinegars"; Enchanted Spoon stores slugs. */
export function categoryLabel(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Other";
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** "1 lb", "6", or nothing for a bare quantity-1 item (the manual default). */
export function quantityText(item: ShoppingItem): string | null {
  const { quantity, unit } = item;
  if (unit) return quantity ? `${formatNumber(quantity)} ${unit}` : unit;
  if (quantity && quantity !== 1) return formatNumber(quantity);
  return null;
}

export interface CategoryGroup {
  slug: string;
  items: ShoppingItem[];
}

/** Rows grouped by category the way the app groups them: A→Z, "other" last. */
export function groupByCategory(items: ShoppingItem[]): CategoryGroup[] {
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const slug = (item.category ?? "").trim().toLowerCase() || OTHER;
    const list = groups.get(slug);
    if (list) list.push(item);
    else groups.set(slug, [item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === OTHER) return 1;
      if (b === OTHER) return -1;
      return a.localeCompare(b);
    })
    .map(([slug, list]) => ({
      slug,
      items: [...list].sort((x, y) => x.name.localeCompare(y.name)),
    }));
}
