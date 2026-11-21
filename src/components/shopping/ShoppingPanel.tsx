"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, Info, Loader2, Plus, ShoppingBasket } from "lucide-react";
import { OnScreenKeyboard } from "@/components/common/OnScreenKeyboard";
import { EmptyState } from "@/components/ui/Tile";
import { useTouchWall } from "@/hooks/useTouchWall";
import type { AddNotice, ShoppingList } from "@/hooks/useHub";
import { categoryLabel, groupByCategory, quantityText } from "@/lib/spoon/format";
import { SHOPPING_NAME_MAX } from "@/lib/spoon/types";

// The shopping list's two pieces (spec §4.6, D6): a quick way to add what you
// notice you're out of, and the list itself, grouped the way Enchanted Spoon
// groups it. Enchanted Spoon owns the list: it picks the category, skips an
// item that's already needed and revives one that was checked off; these
// components just say which happened. Checking off stays in Enchanted Spoon.
//
// Typing: a phone or laptop gets a real input (Enter adds). The wall gets the
// in-app keyboard docked to the bottom, staying open so several items go in
// one after another.

function NoticeLine({ notice }: { notice: AddNotice }) {
  const color =
    notice.tone === "ok" ? "text-good" : notice.tone === "error" ? "text-bad" : "text-fg-soft";
  const Icon = notice.tone === "ok" ? Check : notice.tone === "info" ? Info : null;
  return (
    <p className={`flex items-center gap-1.5 text-small ${color}`} role="status">
      {Icon && <Icon className="size-4 shrink-0" strokeWidth={2.5} aria-hidden />}
      {notice.text}
    </p>
  );
}

function AddButton({
  canAdd,
  adding,
  onClick,
}: {
  canAdd: boolean;
  adding: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canAdd}
      className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-full bg-accent px-5 text-small font-semibold leading-none text-on-accent transition-transform active:scale-95 disabled:opacity-40"
    >
      {adding ? (
        <Loader2 className="size-5 animate-spin" strokeWidth={2.25} aria-hidden />
      ) : (
        <Plus className="size-5" strokeWidth={2.75} aria-hidden />
      )}
      Add
    </button>
  );
}

/** The add field. Owns the text being typed; the list hook owns the write. */
export function AddItemBar({ list }: { list: ShoppingList }) {
  const isWall = useTouchWall();
  const [draft, setDraft] = useState("");
  const [kbOpen, setKbOpen] = useState(false);
  // Bumped on each add so the wall keyboard remounts and capitalizes the next item.
  const [addCount, setAddCount] = useState(0);
  const canAdd = draft.trim().length > 0 && !list.adding;

  const submit = async () => {
    if (!canAdd) return;
    if (await list.add(draft)) {
      setDraft("");
      setAddCount((n) => n + 1);
    }
  };

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-2 rounded-full bg-fill p-1.5 pl-5">
        {isWall ? (
          <button
            type="button"
            onClick={() => setKbOpen(true)}
            aria-label="Item to add"
            className="flex min-h-12 min-w-0 flex-1 items-center text-left text-body"
          >
            {draft ? (
              <span className="truncate text-fg">{draft}</span>
            ) : (
              <span className="text-fg-faint">Add to the list…</span>
            )}
            {kbOpen && <span className="ml-0.5 h-6 w-0.5 shrink-0 animate-pulse bg-accent" aria-hidden />}
          </button>
        ) : (
          <input
            type="text"
            value={draft}
            maxLength={SHOPPING_NAME_MAX}
            enterKeyHint="done"
            autoCapitalize="sentences"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Add to the list…"
            aria-label="Item to add"
            className="min-h-12 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-faint"
          />
        )}
        <AddButton canAdd={canAdd} adding={list.adding} onClick={() => void submit()} />
      </div>
      {list.notice && !kbOpen && (
        <div className="px-4 pt-2">
          <NoticeLine notice={list.notice} />
        </div>
      )}

      {/* The wall's keyboard, docked to the bottom with a compose strip above
          it so the hand never travels back up between items. It is portaled
          to <body>: a tile is its own stacking context (and a glass one is a
          containing block for fixed children), so from inside the tile it
          would sit under the bottom bar. */}
      {isWall && kbOpen && createPortal(
        <div className="paper fixed inset-x-0 bottom-0 z-40 animate-rise rounded-t-[2rem] shadow-float">
          <div className="flex items-center gap-4 px-6 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-body text-fg">
                {draft || <span className="text-fg-faint">Type an item…</span>}
              </p>
              {list.notice && <NoticeLine notice={list.notice} />}
            </div>
            <AddButton canAdd={canAdd} adding={list.adding} onClick={() => void submit()} />
          </div>
          <OnScreenKeyboard
            key={addCount}
            onInsert={(t) =>
              setDraft((d) => (d.length + t.length <= SHOPPING_NAME_MAX ? d + t : d))
            }
            onBackspace={() => setDraft((d) => d.slice(0, -1))}
            onDone={() => setKbOpen(false)}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}

/** The needed items, grouped by category. `limit` shows only the first few. */
export function ShoppingItems({
  list,
  limit,
}: {
  list: ShoppingList;
  limit?: number;
}) {
  if (list.needed.length === 0) {
    return (
      <EmptyState icon={ShoppingBasket} title="The list is clear" compact={limit !== undefined}>
        Add what you notice you&rsquo;re out of and it lands on the list in Enchanted Spoon.
      </EmptyState>
    );
  }

  // The short form (Home) is a plain ruled list, A to Z, the way a paper list
  // on the fridge reads; the full list groups by aisle.
  if (limit !== undefined) {
    const shown = [...list.needed]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
    const more = list.needed.length - shown.length;
    return (
      <ul className="divide-y divide-line">
        {shown.map((item) => (
          <li
            key={item.id}
            className={`-mx-2 truncate rounded-lg px-2 py-2 font-display text-lead leading-tight text-fg transition-colors ${
              list.fresh === item.name.toLowerCase() ? "bg-good-soft" : ""
            }`}
          >
            {item.name}
          </li>
        ))}
        {more > 0 && <li className="py-2 text-small font-semibold text-fg-soft">+{more} more</li>}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groupByCategory(list.needed).map((group) => (
        <section key={group.slug} aria-label={categoryLabel(group.slug)}>
          <h3 className="mb-1 text-tiny font-bold uppercase tracking-[0.12em] text-accent">
            {categoryLabel(group.slug)}
          </h3>
          <ul className="divide-y divide-line">
            {group.items.map((item) => {
              const qty = quantityText(item);
              const fresh = list.fresh === item.name.toLowerCase();
              return (
                <li
                  key={item.id}
                  className={`-mx-2 flex items-baseline justify-between gap-4 rounded-xl px-2 py-2.5 transition-colors ${
                    fresh ? "bg-good-soft" : ""
                  }`}
                >
                  <span className="min-w-0 text-body font-medium text-fg">{item.name}</span>
                  {qty && <span className="shrink-0 text-small text-fg-soft">{qty}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
