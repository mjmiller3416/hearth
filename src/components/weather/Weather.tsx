"use client";

import Link from "next/link";
import { createElement } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapPin,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { AsOf, SourceGate, Tile } from "@/components/ui/Tile";
import type { UpstreamState } from "@/hooks/useUpstream";
import { hourLabel, type Sky, type WeatherPayload } from "@/lib/weather/types";

// The weather, in its two forms on Home: a line under the clock (always there
// once a town is chosen) and a tile with the next few hours (when there is
// room for one). Both read the same forecast.

function iconFor(sky: Sky, isDay: boolean): LucideIcon {
  switch (sky) {
    case "clear":
      return isDay ? Sun : Moon;
    case "partly":
      return isDay ? CloudSun : CloudMoon;
    case "cloudy":
      return Cloud;
    case "fog":
      return CloudFog;
    case "drizzle":
      return CloudDrizzle;
    case "rain":
      return CloudRain;
    case "snow":
      return CloudSnow;
    case "storm":
      return CloudLightning;
  }
}

/** The picture for a sky. A clear day's sun is gold; everything else is white. */
export function SkyIcon({
  sky,
  isDay,
  className = "",
}: {
  sky: Sky;
  isDay: boolean;
  className?: string;
}) {
  // iconFor returns a stable module-level lucide component (a lookup, not a
  // component made during render), so it is rendered through createElement.
  return createElement(iconFor(sky, isDay), {
    className: `${sky === "clear" && isDay ? "text-spark" : ""} ${className}`,
    strokeWidth: 2,
    "aria-hidden": true,
  });
}

/** Under the clock: the sky, the temperature, and today's high and low. */
export function WeatherLine({ weather, className = "" }: { weather: WeatherPayload | null; className?: string }) {
  if (!weather?.configured || !weather.now) return null;
  const today = weather.days[0];
  return (
    <p
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-display text-lead text-fg wide:text-big ${className}`}
      aria-label={`${weather.now.temp} degrees, ${weather.now.label}`}
    >
      <SkyIcon sky={weather.now.sky} isDay={weather.now.isDay} className="size-7 wide:size-9" />
      <span className="font-medium tabular-nums">{weather.now.temp}°</span>
      <span className="font-light text-fg-soft">{weather.now.label}</span>
      {today && (
        <span className="text-small font-semibold tabular-nums text-fg-soft wide:text-body">
          H {today.high}° · L {today.low}°
        </span>
      )}
    </p>
  );
}

/** The weather tile: now, large, and the hours ahead. */
export function WeatherTile({
  state,
  className = "",
}: {
  state: UpstreamState<WeatherPayload>;
  className?: string;
}) {
  const weather = state.data;
  const now = weather?.now ?? null;
  const today = weather?.days[0];
  // Every third hour after this one: enough to plan an afternoon by.
  const ahead = (weather?.hours ?? []).filter((_, i) => i > 0 && i % 3 === 0).slice(0, 3);

  return (
    <Tile
      tone="sky"
      title={
        <span className="flex items-center gap-1.5">
          {weather?.place ? (
            <>
              <MapPin className="size-4 shrink-0" strokeWidth={2.5} aria-hidden />
              <span className="truncate">{weather.place}</span>
            </>
          ) : (
            "Weather"
          )}
        </span>
      }
      className={className}
      bodyClassName="flex flex-col justify-between gap-3"
      stamp={<AsOf isStale={state.isStale} lastUpdated={state.lastUpdated} />}
    >
      {state.failed || state.isLoading ? (
        <SourceGate state={state} configured app="the forecast" what="The weather" rows={2} compact>
          {null}
        </SourceGate>
      ) : !weather?.configured || !now ? (
        <div>
          <p className="font-display text-lead leading-tight text-fg">No town chosen yet</p>
          <p className="mt-1 text-small text-fg-soft">Pick one and the forecast shows here.</p>
          <Link
            href="/settings"
            className="mt-3 inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-small font-semibold text-on-accent"
          >
            Choose in Settings
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <SkyIcon sky={now.sky} isDay={now.isDay} className="size-16 shrink-0" />
            <div className="min-w-0">
              <p className="font-display text-giant font-light leading-none tabular-nums text-fg">{now.temp}°</p>
              <p className="mt-1 truncate text-small font-semibold text-fg">{now.label}</p>
              {today && (
                <p className="truncate text-small font-semibold tabular-nums text-fg-soft">
                  H {today.high}° · L {today.low}°
                </p>
              )}
            </div>
          </div>
          <ul className="flex flex-col">
            {ahead.map((h) => (
              <li
                key={h.time}
                className="flex items-center gap-3 border-t border-line py-1.5 text-body tabular-nums text-fg"
              >
                <span className="w-[3.6em] text-small font-semibold text-fg-soft">{hourLabel(h.time)}</span>
                <SkyIcon sky={h.sky} isDay={h.isDay} className="size-6" />
                <span className="font-display font-medium">{h.temp}°</span>
                {h.rainChance !== null && h.rainChance >= 20 && (
                  <span className="ml-auto flex items-center gap-1 text-small font-semibold text-fg-soft">
                    <Droplets className="size-4" strokeWidth={2.25} aria-hidden />
                    {h.rainChance}%
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Tile>
  );
}
