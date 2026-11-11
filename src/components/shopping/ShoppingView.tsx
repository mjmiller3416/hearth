"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Check, Info, Loader2, Plus, ShoppingCart } from "lucide-react";
import { ViewFrame } from "@/components/layout/ViewFrame";
import { OnScreenKeyboard } from "@/components/common/OnScreenKeyboard";
import { useUpstream } from "@/hooks/useUpstream";
import { useIdleReset } from "@/hooks/useIdleReset";
import { useTouchWall } from "@/hooks/useTouchWall";
import {
  SHOPPING_NAME_MAX,
  type AddShoppingItemResult,
  type ShoppingItem,
  type ShoppingListPayload,
} from "@/lib/spoon/types";

// The Shopping view (Phase 4, spec §4.6, D6) — Enchanted Spoon's shopping list on
// the wall, with a quick way to add what you notice you're out of.
//
// Reads the household list (polled every 60s on the stale-data contract, so an
// item added on a phone lands here within a minute) and shows what's still
// needed, grouped by Enchanted Spoon's categories the way the app groups them.
// The one write is "add an item": type a name, tap Add. Enchanted Spoon decides
// the rest — the category (from the household's ingredient library), skipping an
// item that's already needed, and moving a checked-off match back to "need" —
// and the view just says which happened. Checking off, editing, and removing
// stay on the phone for now.
//
// Typing follows the calendar's rule: on the touch wall the field opens the
// in-app keyboard (no native input, so the OS keyboard never shrinks the
// canvas); on a PC it's a real input and Enter adds. The keyboard stays open
// after each add so several items go in one after another; Done closes it.

/** Where uncategorized rows go, and the group that always sorts last. */
const OTHER = "other";

/** "oils-and-vinegars" → "Oils and vinegars"; Enchanted Spoon stores slugs. */
function categoryLabel(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Other";
}

/** Trim a quantity to at most two decimals without trailing zeros. */
function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** "1 lb", "6", or nothing for a bare quantity-1 item (the manual default). */
function quantityText(item: ShoppingItem): string | null {
  const { quantity, unit } = item;
  if (unit) return quantity ? `${formatNumber(quantity)} ${unit}` : unit;
  if (quantity && quantity !== 1) return formatNumber(quantity);
  return null;
}

interface CategoryGroup {
  slug: string;
  items: ShoppingItem[];
}

/** Still-needed rows grouped by category: A→Z, "other" last; items A→Z. */
function groupNeeded(items: ShoppingItem[]): CategoryGroup[] {
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    if (item.have) continue;
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

/** The confirmation line under the field after an add. */
interface AddNotice {
  tone: "ok" | "info" | "error";
  text: string;
}

function noticeFor(result: AddShoppingItemResult): AddNotice {
  switch (result.status) {
    case "already_listed":
      return { tone: "info", text: `${result.name} is already on the list.` };
    case "reactivated":
      return { tone: "ok", text: `${result.name} is back on the list.` };
    default:
      return { tone: "ok", text: `Added ${result.name}.` };
  }
}

const HEADERS = { "content-type": "application/json" } as const;

/** No-op subscription: "am I on the client" never changes after hydration. */
const subscribeNever = () => () => {};

export function ShoppingView() {
  // False during SSR and hydration, true after: the view and its polling only
  // run client-side (same contract as the other views' `mounted` flag).
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  const fetcher = useCallback(async (): Promise<ShoppingListPayload> => {
    const res = await fetch("/api/shopping", { cache: "no-store" });
    if (!res.ok) throw new Error(`shopping ${res.status}`);
    return res.json();
  }, []);

  const { data, isStale, lastUpdated, refetch, isLoading } =
    useUpstream<ShoppingListPayload>(fetcher, { intervalMs: 60_000, enabled: mounted });

  // The name being typed, the in-app keyboard, and the add round-trip.
  const [draft, setDraft] = useState("");
  const [kbOpen, setKbOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<AddNotice | null>(null);
  // Lower-cased name of the last item added or re-added, highlighted in the list.
  const [highlight, setHighlight] = useState<string | null>(null);
  // Bumped on each successful add; remounts the keyboard so its one-shot shift
  // capitalizes the next item too.
  const [addCount, setAddCount] = useState(0);

  const submit = useCallback(async () => {
    const name = draft.trim();
    if (!name || adding) return;
    setAdding(true);
    setNotice(null);
    try {
      const res = await fetch("/api/shopping/items", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`add ${res.status}`);
      const result = (await res.json()) as AddShoppingItemResult;
      setDraft("");
      setAddCount((n) => n + 1);
      setNotice(noticeFor(result));
      setHighlight(result.name.toLowerCase());
      await refetch();
    } catch {
      // Never a global error (spec §6.2): keep the text so a retry is one tap.
      setNotice({ tone: "error", text: "Couldn't add that just now. Try again." });
    } finally {
      setAdding(false);
    }
  }, [draft, adding, refetch]);

  // Idle reset: close the keyboard and clear the half-typed name and the last
  // confirmation, so the wall rests on the plain list (checklist #17).
  useIdleReset(
    useCallback(() => {
      setKbOpen(false);
      setDraft("");
      setNotice(null);
      setHighlight(null);
    }, []),
    { enabled: mounted },
  );

  const groups = useMemo(() => groupNeeded(data?.items ?? []), [data]);

  if (!mounted) {
    return <ViewFrame title="Shopping">{null}</ViewFrame>;
  }

  const configured = data?.configured ?? false;

  return (
    <ViewFrame title="Shopping" isStale={isStale} lastUpdated={lastUpdated}>
      <div className="flex h-full flex-col gap-6">
        {isLoading ? (
          // Stay quiet until the first poll resolves — never flash "not
          // connected" while we simply haven't loaded yet.
          null
        ) : !configured ? (
          <NotConnected />
        ) : (
          <>
            <AddBar
              draft={draft}
              setDraft={setDraft}
              kbOpen={kbOpen}
              openKeyboard={() => setKbOpen(true)}
              adding={adding}
              onSubmit={submit}
              notice={kbOpen ? null : notice}
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {groups.length === 0 ? (
                <EmptyList />
              ) : (
                <div className="columns-3 gap-5 pb-2">
                  {groups.map((group) => (
                    <CategoryCard key={group.slug} group={group} highlight={highlight} />
                  ))}
                </div>
              )}
              {/* Room to scroll the last rows above the docked keyboard. */}
              {kbOpen && <div className="h-96" aria-hidden />}
            </div>
          </>
        )}
      </div>

      {kbOpen && configured && (
        <KeyboardDock
          resetKey={addCount}
          draft={draft}
          adding={adding}
          notice={notice}
          onInsert={(t) =>
            setDraft((d) => (d.length + t.length <= SHOPPING_NAME_MAX ? d + t : d))
          }
          onBackspace={() => setDraft((d) => d.slice(0, -1))}
          onSubmit={submit}
          onDone={() => setKbOpen(false)}
        />
      )}
    </ViewFrame>
  );
}

/**
 * The add field and button across the top of the list. On the wall the field is
 * a tappable display that opens the in-app keyboard; on a PC it's a real input.
 */
function AddBar({
  draft,
  setDraft,
  kbOpen,
  openKeyboard,
  adding,
  onSubmit,
  notice,
}: {
  draft: string;
  setDraft: (value: string) => void;
  kbOpen: boolean;
  openKeyboard: () => void;
  adding: boolean;
  onSubmit: () => void;
  notice: AddNotice | null;
}) {
  const isTouch = useTouchWall();
  const canAdd = draft.trim().length > 0 && !adding;

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-4 rounded-3xl bg-surface p-3 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
        <span className="pl-3 text-ink-soft" aria-hidden>
          <ShoppingCart className="size-8" strokeWidth={1.75} />
        </span>
        {isTouch ? (
          <button
            type="button"
            onClick={openKeyboard}
            aria-label="Item to add"
            className={`flex min-h-16 min-w-0 flex-1 items-center rounded-2xl px-4 text-left text-body transition-colors ${
              kbOpen ? "bg-ground-2 ring-2 ring-ink/15" : "bg-ground hover:bg-ground-2"
            }`}
          >
            {draft ? (
              <span className="truncate text-ink">{draft}</span>
            ) : (
              <span className="text-ink-faint">Add an item…</span>
            )}
            {kbOpen && (
              <span className="ml-0.5 inline-block h-8 w-0.5 shrink-0 animate-pulse bg-ink" aria-hidden />
            )}
          </button>
        ) : (
          <input
            type="text"
            value={draft}
            maxLength={SHOPPING_NAME_MAX}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Add an item…"
            aria-label="Item to add"
            className="min-h-16 min-w-0 flex-1 rounded-2xl bg-ground px-4 text-body text-ink outline-none transition-colors placeholder:text-ink-faint hover:bg-ground-2 focus:bg-ground-2 focus:ring-2 focus:ring-ink/15"
          />
        )}
        <AddButton canAdd={canAdd} adding={adding} onSubmit={onSubmit} />
      </div>
      {notice && <NoticeLine notice={notice} className="px-4 pt-3" />}
    </div>
  );
}

/** The primary "Add" action, with a spinner while the write is in flight. */
function AddButton({
  canAdd,
  adding,
  onSubmit,
}: {
  canAdd: boolean;
  adding: boolean;
  onSubmit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSubmit}
      disabled={!canAdd}
      className="flex min-h-16 shrink-0 items-center gap-2 rounded-2xl bg-accent px-8 text-title font-medium leading-none text-white transition-transform hover:bg-accent-strong active:scale-95 disabled:opacity-40 disabled:active:scale-100"
    >
      {adding ? (
        <Loader2 className="size-7 animate-spin" strokeWidth={2.25} aria-hidden />
      ) : (
        <Plus className="size-7" strokeWidth={2.5} aria-hidden />
      )}
      {adding ? "Adding…" : "Add"}
    </button>
  );
}

function NoticeLine({ notice, className = "" }: { notice: AddNotice; className?: string }) {
  const color =
    notice.tone === "ok"
      ? "text-teal-strong"
      : notice.tone === "error"
        ? "text-coral-strong"
        : "text-ink-soft";
  const Icon = notice.tone === "ok" ? Check : notice.tone === "info" ? Info : null;
  return (
    <p className={`flex items-center gap-2 text-label ${color} ${className}`} role="status">
      {Icon && <Icon className="size-6 shrink-0" strokeWidth={2.25} aria-hidden />}
      {notice.text}
    </p>
  );
}

/**
 * The in-app keyboard docked to the bottom of the wall, with a compose strip
 * above it (what's typed, the confirmation, and Add) so the hand never has to
 * travel back up to the top bar between items.
 */
function KeyboardDock({
  resetKey,
  draft,
  adding,
  notice,
  onInsert,
  onBackspace,
  onSubmit,
  onDone,
}: {
  resetKey: number;
  draft: string;
  adding: boolean;
  notice: AddNotice | null;
  onInsert: (text: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  onDone: () => void;
}) {
  const canAdd = draft.trim().length > 0 && !adding;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      <div className="flex items-center gap-4 border-t border-hairline bg-surface px-6 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body text-ink">
            {draft || <span className="text-ink-faint">Type an item…</span>}
          </p>
          {notice && <NoticeLine notice={notice} />}
        </div>
        <AddButton canAdd={canAdd} adding={adding} onSubmit={onSubmit} />
      </div>
      <OnScreenKeyboard
        key={resetKey}
        onInsert={onInsert}
        onBackspace={onBackspace}
        onDone={onDone}
      />
    </div>
  );
}

function CategoryCard({
  group,
  highlight,
}: {
  group: CategoryGroup;
  highlight: string | null;
}) {
  return (
    <section
      className="mb-5 break-inside-avoid rounded-3xl bg-surface px-6 py-5 shadow-[inset_0_0_0_1px_var(--color-hairline)]"
      aria-label={categoryLabel(group.slug)}
    >
      <h2 className="mb-2 font-display text-title text-ink">{categoryLabel(group.slug)}</h2>
      <ul className="divide-y divide-hairline">
        {group.items.map((item) => {
          const qty = quantityText(item);
          const fresh = highlight !== null && item.name.toLowerCase() === highlight;
          return (
            <li
              key={item.id}
              className={`-mx-3 flex items-baseline justify-between gap-4 rounded-xl px-3 py-3 transition-colors ${
                fresh ? "bg-accent-soft" : ""
              }`}
            >
              <span className="min-w-0 text-body text-ink">{item.name}</span>
              {qty && <span className="shrink-0 text-label text-ink-soft">{qty}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EmptyList() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <span className="flex size-20 items-center justify-center rounded-full bg-teal-soft text-teal-strong">
        <Check className="size-11" strokeWidth={2.5} aria-hidden />
      </span>
      <p className="font-display text-title text-ink-soft">The list is clear.</p>
      <p className="max-w-xl text-body text-ink-faint">
        Add what you notice you’re out of, and it shows up on the list in
        Enchanted Spoon.
      </p>
    </div>
  );
}

function NotConnected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-title text-ink-soft">Not connected to Enchanted Spoon yet.</p>
      <p className="max-w-xl text-body text-ink-faint">
        The shopping list appears here once Enchanted Spoon is set up.
      </p>
    </div>
  );
}
