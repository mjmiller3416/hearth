import { ViewFrame } from "@/components/layout/ViewFrame";
import { getMembers } from "@/lib/calendar/config";
import { colorVar } from "@/lib/calendar/palette";
import { requireAuthorizedPage } from "@/lib/auth";

// Phase 0 settings is intentionally thin. It shows the member color system —
// the display's signature and primary information channel — so the palette can
// be sanity-checked on the real hardware, plus a note on how the device is
// authorized. Real settings, if any, arrive with the views that need them.
export default async function SettingsPage() {
  await requireAuthorizedPage();
  const members = getMembers();
  return (
    <ViewFrame title="Settings">
      <div className="flex h-full flex-col gap-10">
        <section>
          <h2 className="mb-4 text-title text-ink">Family colors</h2>
          <ul className="flex flex-wrap gap-4">
            {members.map((member) => (
              <li
                key={member.key}
                className="flex items-center gap-4 rounded-2xl border border-hairline bg-surface px-6 py-4"
              >
                <span
                  className="size-10 rounded-full"
                  style={{ backgroundColor: `var(${colorVar(member.color)})` }}
                  aria-hidden
                />
                <span className="text-body text-ink">{member.name}</span>
              </li>
            ))}
          </ul>
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
