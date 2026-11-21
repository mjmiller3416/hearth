"use client";

import { CloudSun, Images, MonitorSmartphone, Palette, PiggyBank, PlugZap, Smartphone } from "lucide-react";
import { AllowanceSettings } from "@/components/allowance/AllowanceSettings";
import { Tile } from "@/components/ui/Tile";
import { Page } from "@/components/ui/Page";
import { PhotoSettings } from "@/components/photos/PhotoSettings";
import { WeatherSettings } from "@/components/weather/WeatherSettings";
import { ColorSettings, type ColorEntry } from "./ColorSettings";
import { Connections, ScreenSettings } from "./ScreenSettings";

// Settings, laid out: how this screen behaves, the family's colors, the kids'
// allowance (parents), what Hearth is connected to, and how a new screen is
// paired. The page (a server component) resolves the colors and hands them in.

export function SettingsView({ entries }: { entries: ColorEntry[] }) {
  return (
    <Page title="Settings">
      <div className="grid gap-4 pb-2 wide:h-full wide:auto-rows-max wide:grid-cols-2 wide:content-start wide:gap-5 wide:overflow-y-auto wide:pr-1">
        <Tile tone="paper" title="This screen" icon={MonitorSmartphone}>
          <ScreenSettings />
        </Tile>

        <Tile tone="paper" title="Family colors" icon={Palette}>
          <p className="mb-3 text-small text-fg-faint">
            Each person&rsquo;s color is used everywhere they appear, on every screen.
          </p>
          <ColorSettings entries={entries} />
        </Tile>

        <Tile tone="paper" title="Weather" icon={CloudSun}>
          <WeatherSettings />
        </Tile>

        <Tile tone="paper" title="Photos" icon={Images}>
          <PhotoSettings />
        </Tile>

        <Tile tone="paper" title="Allowance" icon={PiggyBank}>
          <AllowanceSettings />
        </Tile>

        <Tile tone="paper" title="Connected apps" icon={PlugZap}>
          <Connections />
        </Tile>

        <Tile tone="paper" title="Add another screen" icon={Smartphone} className="wide:col-span-2">
          <p className="text-body text-fg-soft">
            A phone, tablet or laptop is paired once by opening Hearth&rsquo;s address with{" "}
            <code className="rounded-md bg-fill px-1.5 py-0.5 text-[0.9em]">
              /setup?token=…
            </code>{" "}
            on the end (Mitchell has the token). It then stays signed in: there is no
            login and no timeout. On a phone, add it to the home screen to open it like
            an app.
          </p>
        </Tile>
      </div>
    </Page>
  );
}
