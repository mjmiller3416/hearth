"use client";

import { MonitorSmartphone, Palette, PiggyBank, PlugZap, Smartphone } from "lucide-react";
import { AllowanceSettings } from "@/components/allowance/AllowanceSettings";
import { Card } from "@/components/ui/Card";
import { Page } from "@/components/ui/Page";
import { ColorSettings, type ColorEntry } from "./ColorSettings";
import { Connections, ScreenSettings } from "./ScreenSettings";

// Settings, laid out: how this screen behaves, the family's colors, the kids'
// allowance (parents), what Hearth is connected to, and how a new screen is
// paired. The page (a server component) resolves the colors and hands them in.

export function SettingsView({ entries }: { entries: ColorEntry[] }) {
  return (
    <Page title="Settings">
      <div className="grid gap-4 pb-2 wide:h-full wide:auto-rows-max wide:grid-cols-2 wide:content-start wide:gap-5 wide:overflow-y-auto wide:pr-1">
        <Card title="This screen" icon={MonitorSmartphone}>
          <ScreenSettings />
        </Card>

        <Card title="Family colors" icon={Palette}>
          <p className="mb-3 text-label text-ink-faint">
            Each person&rsquo;s color is used everywhere they appear, on every screen.
          </p>
          <ColorSettings entries={entries} />
        </Card>

        <Card title="Allowance" icon={PiggyBank}>
          <AllowanceSettings />
        </Card>

        <Card title="Connected apps" icon={PlugZap}>
          <Connections />
        </Card>

        <Card title="Add another screen" icon={Smartphone} className="wide:col-span-2">
          <p className="text-body text-ink-soft">
            A phone, tablet or laptop is paired once by opening Hearth&rsquo;s address with{" "}
            <code className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.9em] ring-1 ring-inset ring-hairline">
              /setup?token=…
            </code>{" "}
            on the end (Mitchell has the token). It then stays signed in: there is no
            login and no timeout. On a phone, add it to the home screen to open it like
            an app.
          </p>
        </Card>
      </div>
    </Page>
  );
}
