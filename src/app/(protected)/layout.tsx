import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isAuthorizedDevice } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { HeaderBar } from "@/components/layout/HeaderBar";
import { Stage } from "@/components/layout/Stage";
import { TimeZoneProvider } from "@/components/common/TimeZone";
import { ColorProvider } from "@/components/common/ColorProvider";
import { resolveTimeZone } from "@/lib/calendar/recurrence";
import { getColorConfig } from "@/lib/settings/store";

// This is the PRIMARY authorization gate for every page route (Phase 0.1).
//
// It MUST stay a server component (no client directive anywhere in this
// module), so the check runs during RSC render — which means it also runs for
// the `.rsc` and segment-prefetch variants of these routes, the exact surfaces
// that bypass middleware matching (CVE-2026-44575 / -45109). If this ever
// became a client component the check would move to the browser and be
// worthless. Do not depend on middleware/proxy for it; see `src/lib/auth.ts`.
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await isAuthorizedDevice())) {
    redirect("/setup");
  }

  // The persistent app chrome: a fixed sidebar rail on the left, the day/date/
  // time header across the top, and the active view filling the rest. Nothing
  // scrolls at this level — views scroll within their own panels (kiosk).
  //
  // The whole chrome is authored on a fixed 1920×1080 canvas and scaled to fit
  // the viewport by <Stage> — one drawn resolution, fitted, never reflowed
  // (spec §6.1). The inner box is exactly the canvas size (h-full/w-full inside
  // Stage's 1920×1080 box), so every fixed dimension below is drawn as designed.
  const timeZone = resolveTimeZone();
  const { overrides, textBySlug } = await getColorConfig();

  // Inject any customized member colors as :root overrides (Phase 2 #3). Emitted
  // server-side so the first paint is already recolored on every device — no
  // flash — and shared because the source is the persisted settings store.
  const overrideCss = Object.entries(overrides)
    .map(([slug, hex]) => `--color-${slug}:${hex};`)
    .join("");

  return (
    <Stage>
      {overrideCss && <style>{`:root{${overrideCss}}`}</style>}
      <TimeZoneProvider tz={timeZone}>
        <ColorProvider textBySlug={textBySlug}>
          <div className="flex h-full w-full overflow-hidden bg-ground text-ink">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <HeaderBar />
              <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
            </div>
          </div>
        </ColorProvider>
      </TimeZoneProvider>
    </Stage>
  );
}
