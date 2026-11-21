import type { ColorEntry } from "@/components/settings/ColorSettings";
import { SettingsView } from "@/components/settings/SettingsView";
import { requireAuthorizedPage } from "@/lib/auth";
import { getMembers } from "@/lib/calendar/config";
import { EVERYONE_COLOR } from "@/lib/calendar/palette";
import { getColorConfig } from "@/lib/settings/store";
import { DEFAULT_COLORS, SWATCHES } from "@/lib/settings/swatches";

// Settings: how this screen behaves, the family's colors, the kids' allowance
// (parents), what Hearth is connected to, and how a new screen is paired. The
// auth guard MUST stay the first statement (Phase 0.1).
export default async function SettingsPage() {
  await requireAuthorizedPage();
  const members = getMembers();
  const { selection } = await getColorConfig();

  // The swatch whose hex equals a slug's default, so a color with no override
  // still shows its current swatch selected in the picker.
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

  return <SettingsView entries={entries} />;
}
