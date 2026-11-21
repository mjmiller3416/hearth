"use client";

import { ON_LIGHT } from "@/components/ui/Avatar";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Sheet, SheetBody, SheetHeader } from "@/components/ui/Sheet";
import { SWATCHES } from "@/lib/settings/swatches";

// The family colors (spec D12): one row per person plus Family, each showing
// its current color. Tapping a row opens the palette; picking a color recolors
// that person everywhere, on every device.
//
// The choice is saved to Hearth's shared settings file and applied by
// refreshing the server tree. The optimistic selection rolls back only if the
// save truly fails.

export interface ColorEntry {
  slug: string;
  label: string;
  activeSwatchId: string | null;
}

const hexFor = (swatchId: string | null): string =>
  SWATCHES.find((s) => s.id === swatchId)?.hex ?? "var(--color-neutral)";

export function ColorSettings({ entries }: { entries: ColorEntry[] }) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(entries.map((e) => [e.slug, e.activeSwatchId])),
  );
  const [error, setError] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const editing = editingSlug ? entries.find((e) => e.slug === editingSlug) ?? null : null;

  async function choose(slug: string, swatchId: string) {
    setEditingSlug(null);
    if (selection[slug] === swatchId) return;
    const prev = selection[slug];
    setSelection((s) => ({ ...s, [slug]: swatchId })); // optimistic
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, swatchId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // Re-run the server tree so the :root color overrides update everywhere.
      router.refresh();
    } catch {
      setSelection((s) => ({ ...s, [slug]: prev })); // roll back
      setError("Couldn't save that color. Try again.");
    }
  }

  return (
    <>
      <ul className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 12rem), 1fr))" }}>
        {entries.map((entry) => (
          <li key={entry.slug}>
            <button
              type="button"
              onClick={() => setEditingSlug(entry.slug)}
              aria-label={`Change ${entry.label}'s color`}
              aria-haspopup="dialog"
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-fill px-4 text-left active:bg-fill-2"
            >
              <span
                className="size-8 shrink-0 rounded-full"
                style={{ backgroundColor: hexFor(selection[entry.slug]) }}
                aria-hidden
              />
              <span className="flex-1 text-body text-fg">{entry.label}</span>
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-3 text-small text-bad">
          {error}
        </p>
      )}

      {editing && (
        <Sheet label={`${editing.label}'s color`} onClose={() => setEditingSlug(null)} size="sm">
          <SheetHeader title={`${editing.label}'s color`} onClose={() => setEditingSlug(null)} />
          <SheetBody>
            <div className="grid grid-cols-4 justify-items-center gap-4" role="group" aria-label="Colors">
              {SWATCHES.map((sw) => {
                const on = selection[editing.slug] === sw.id;
                return (
                  <button
                    key={sw.id}
                    type="button"
                    aria-label={sw.name}
                    aria-pressed={on}
                    onClick={() => void choose(editing.slug, sw.id)}
                    className={`flex size-14 items-center justify-center rounded-full transition-transform active:scale-95 ${
                      on ? "ring-[3px] ring-accent ring-offset-2 ring-offset-paper" : ""
                    }`}
                    style={{ backgroundColor: sw.hex, color: sw.text === "dark" ? ON_LIGHT : "#ffffff" }}
                  >
                    {on && <Check className="size-7" strokeWidth={3} aria-hidden />}
                  </button>
                );
              })}
            </div>
          </SheetBody>
        </Sheet>
      )}
    </>
  );
}
