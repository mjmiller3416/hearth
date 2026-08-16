"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { SWATCHES } from "@/lib/settings/swatches";

// The color picker on the Settings page (Phase 2 #3, reworked #5). Instead of a
// wall of every swatch for every person, it now lists the family "tags" — one row
// per person plus Family, each showing its current color. Tapping a tag opens a
// small popup with the palette laid out in a grid; picking a color recolors that
// person everywhere and closes the popup.
//
// The choice is saved to the shared settings store and applied app-wide by
// refreshing the server tree, so the wall and every other device pick it up. The
// optimistic selection only rolls back if the save truly fails (the store now
// self-heals to a writable dir, so the old "reverts immediately" bug is gone).

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

  const editing = editingSlug
    ? entries.find((e) => e.slug === editingSlug) ?? null
    : null;

  // Escape closes the popup.
  useEffect(() => {
    if (!editingSlug) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditingSlug(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingSlug]);

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
      <div className="flex flex-col gap-3">
        {entries.map((entry) => {
          const active = selection[entry.slug];
          return (
            <button
              key={entry.slug}
              type="button"
              onClick={() => setEditingSlug(entry.slug)}
              aria-label={`Change ${entry.label} color`}
              aria-haspopup="dialog"
              className="flex items-center gap-4 rounded-2xl bg-surface px-5 py-4 text-left transition-colors hover:bg-ground-2"
            >
              <span
                className="size-10 shrink-0 rounded-full ring-1 ring-black/5"
                style={{ backgroundColor: hexFor(active) }}
                aria-hidden
              />
              <span className="flex-1 text-title text-ink">{entry.label}</span>
              <span className="text-label text-ink-faint">Change</span>
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-body text-[var(--color-maryann)]">
          {error}
        </p>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink/25 p-10"
          onClick={() => setEditingSlug(null)}
          role="presentation"
        >
          <div
            className="w-[34rem] max-w-full rounded-3xl bg-surface p-8 shadow-[0_20px_60px_-20px_rgba(43,38,32,0.45)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${editing.label} color`}
          >
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  className="size-8 rounded-full ring-1 ring-black/5"
                  style={{ backgroundColor: hexFor(selection[editing.slug]) }}
                  aria-hidden
                />
                <h3 className="font-display text-display text-ink">{editing.label}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSlug(null)}
                aria-label="Close"
                className="flex size-12 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ground-2"
              >
                <X className="size-8" strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div
              className="grid grid-cols-6 justify-items-center gap-4"
              role="group"
              aria-label={`${editing.label} color`}
            >
              {SWATCHES.map((sw) => {
                const on = selection[editing.slug] === sw.id;
                return (
                  <button
                    key={sw.id}
                    type="button"
                    aria-label={sw.name}
                    aria-pressed={on}
                    onClick={() => choose(editing.slug, sw.id)}
                    className={`flex size-14 items-center justify-center rounded-full transition-transform active:scale-95 ${
                      on ? "ring-4 ring-ink ring-offset-2 ring-offset-surface" : ""
                    }`}
                    style={{ backgroundColor: sw.hex }}
                  >
                    {on && (
                      <Check
                        className={`size-7 ${sw.text === "dark" ? "text-ink" : "text-white"}`}
                        strokeWidth={3}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
