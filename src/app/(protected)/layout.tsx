import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isAuthorizedDevice } from "@/lib/auth";
import { AppShell } from "@/components/app/AppShell";
import { HouseholdProvider } from "@/components/app/Household";
import { IdleHome, ThemeKeeper } from "@/components/app/ScreenKeepers";
import { TimeZoneProvider } from "@/components/common/TimeZone";
import { ColorProvider } from "@/components/common/ColorProvider";
import { CountdownProvider } from "@/components/common/Countdown";
import { resolveTimeZone } from "@/lib/calendar/recurrence";
import { getHousehold } from "@/lib/household";
import { getColorConfig } from "@/lib/settings/store";

// This is the PRIMARY authorization gate for every page route (Phase 0.1).
//
// It MUST stay a server component (no client directive anywhere in this
// module), so the check runs during RSC render, which means it also runs for
// the `.rsc` and segment-prefetch variants of these routes, the exact surfaces
// that bypass middleware matching (CVE-2026-44575 / -45109). If this ever
// became a client component the check would move to the browser and be
// worthless. Do not depend on middleware/proxy for it; see `src/lib/auth.ts`.

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await isAuthorizedDevice())) {
    redirect("/setup");
  }

  const timeZone = resolveTimeZone();
  const { overrides, textBySlug } = await getColorConfig();
  const { members } = getHousehold();

  // Inject any customized member colors as :root overrides (spec D12). Emitted
  // server-side so the first paint is already recolored on every device.
  const overrideCss = Object.entries(overrides)
    .map(([slug, hex]) => `--color-${slug}:${hex};`)
    .join("");

  return (
    <>
      {overrideCss && <style>{`:root{${overrideCss}}`}</style>}
      <TimeZoneProvider tz={timeZone}>
        <ColorProvider textBySlug={textBySlug}>
          <HouseholdProvider members={members}>
            <CountdownProvider>
              <ThemeKeeper />
              <IdleHome />
              <AppShell>{children}</AppShell>
            </CountdownProvider>
          </HouseholdProvider>
        </ColorProvider>
      </TimeZoneProvider>
    </>
  );
}
