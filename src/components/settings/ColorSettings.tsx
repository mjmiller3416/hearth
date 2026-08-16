"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { SWATCHES } from "@/lib/settings/swatches";

// The color picker on the Settings page (Phase 2 #3). One row per customizable
// color (each family member, plus Family); tapping a swatch recolors that person
// everywhere. The choice is saved to the shared settings store and applied
// app-wide by refreshing the server tree, so the wall and every other device
// pick it up.

export interface ColorEntry {
  slug: string;
  label: string;
  activeSwatchId: string | null;
}

export function ColorSettings({ entries }: { entries: ColorEntry[] }) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(entries.map((e) => [e.slug, e.activeSwatchId])),
  );
  const [error, setError] = useState<string | null>(null);

  async function choose(slug: string, swatchId: string) {
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
    <div className="flex flex-col gap-8">
      {entries.map((entry) => {
        const active = selection[entry.slug];
        return (
          <div key={entry.slug} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span
                className="size-8 rounded-full"
                style={{
                  backgroundColor:
                    SWATCHES.find((s) => s.id === active)?.hex ?? "var(--color-neutral)",
                }}
                aria-hidden
              />
              <span className="text-title text-ink">{entry.label}</span>
            </div>
            <div className="flex flex-wrap gap-3" role="group" aria-label={`${entry.label} color`}>
              {SWATCHES.map((sw) => {
                const on = active === sw.id;
                return (
                  <button
                    key={sw.id}
                    type="button"
                    aria-label={sw.name}
                    aria-pressed={on}
                    onClick={() => choose(entry.slug, sw.id)}
                    className={`flex size-12 items-center justify-center rounded-full transition-transform active:scale-95 ${
                      on ? "ring-4 ring-ink ring-offset-2 ring-offset-surface" : ""
                    }`}
                    style={{ backgroundColor: sw.hex }}
                  >
                    {on && (
                      <Check
                        className={`size-6 ${sw.text === "dark" ? "text-ink" : "text-white"}`}
                        strokeWidth={3}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-body text-[var(--color-maryann)]">
          {error}
        </p>
      )}
    </div>
  );
}
