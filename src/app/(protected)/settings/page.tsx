import { Palette } from "lucide-react";
import { ViewFrame } from "@/components/layout/ViewFrame";
import { getMembers } from "@/lib/calendar/config";
import { EVERYONE_COLOR } from "@/lib/calendar/palette";
import { getColorConfig } from "@/lib/settings/store";
import { SWATCHES, DEFAULT_COLORS } from "@/lib/settings/swatches";
import { ColorSettings, type ColorEntry } from "@/components/settings/ColorSettings";
import { requireAuthorizedPage } from "@/lib/auth";

// Settings. The primary control is the family color palette (Phase 2 #3) — each
// person's color, and the shared Family color, chosen from a fixed set of
// swatches. The choice is stored server-side and shared across every device, so
// the wall and a phone/laptop agree. A note on device authorization follows.
export default async function SettingsPage() {
  await requireAuthorizedPage();
  const members = getMembers();
  const { selection } = await getColorConfig();

  // The swatch whose hex equals a slug's globals.css default — so a color with
  // no override still shows its current swatch selected in the picker.
  const defaultSwatchId = (slug: string): string | null => {
    const hex = DEFAULT_COLORS[slug]?.toLowerCase();
    return SWATCHES.find((s) => s.hex.toLowerCase() === hex)?.id ?? null;
  };

  const entry = (slug: string, label: string): ColorEntry => ({
    slug,
    label,
    activeSwatchId: selection[slug] ?? defaultSwatchId(slug),
  });

  const entries: ColorEntry[] = [
    ...members.map((m) => entry(m.color, m.name)),
    entry(EVERYONE_COLOR, "Family"),
  ];

  return (
    <ViewFrame title="Settings">
      <div className="flex h-full flex-col gap-10 overflow-y-auto pb-4">
        <section>
          <h2 className="mb-2 flex items-center gap-3 text-title text-ink">
            <Palette className="size-8 text-ink-soft" strokeWidth={2} aria-hidden />
            Family colors
          </h2>
          <p className="mb-6 max-w-3xl text-body text-ink-soft">
            Each person&rsquo;s color is used everywhere they appear. Pick from the
            palette — it updates the wall and every device.
          </p>
          <ColorSettings entries={entries} />
        </section>

        <section className="max-w-3xl">
          <h2 className="mb-3 text-title text-ink">This device</h2>
          <p className="text-body text-ink-soft">
            The screen is authorized once with the device token and stays signed
            in. There is no login and no timeout. To re-pair a screen, open its
            URL with <code className="rounded bg-ground-2 px-2 py-0.5">?token=…</code> appended.
          </p>
        </section>
      </div>
    </ViewFrame>
  );
}
