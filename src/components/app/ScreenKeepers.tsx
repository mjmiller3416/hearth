"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { appConfig, IDLE_HOME_MS, NIGHT_END, NIGHT_START } from "@/lib/config";
import { zonedFields } from "@/lib/calendar/dates";
import { setPref, useDeviceClass, usePref, type DeviceClass } from "@/lib/prefs";
import { useIdleReset } from "@/hooks/useIdleReset";
import { useTimeZone } from "@/components/common/TimeZone";

// Two behaviors that belong to the screen rather than to any one view. Both
// render nothing.

/** "HH:MM" → minutes since midnight. */
function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Is the household clock inside the evening window (which wraps midnight)? */
function isNight(now: Date, timeZone?: string): boolean {
  const f = zonedFields(now, timeZone);
  const at = f.h * 60 + f.mi;
  const start = minutes(NIGHT_START);
  const end = minutes(NIGHT_END);
  return start > end ? at >= start || at < end : at >= start && at < end;
}

/** Light or dark, from the Settings choice, the kind of screen and the hour. */
export function resolveTheme(
  choice: string | null,
  device: DeviceClass,
  timeZone?: string,
): "light" | "dark" {
  if (choice === "light" || choice === "dark") return choice;
  // Auto: a shared screen follows the household clock (a wall has no "system
  // dark mode" worth trusting); a phone or laptop follows its own setting.
  if (device === "wall") return isNight(new Date(), timeZone) ? "dark" : "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Keeps <html data-theme> right: on a Settings change, when the phone flips its
 * own dark mode, and at dusk and dawn on the wall. The root layout's inline
 * script sets the same attribute before first paint, so there is no flash.
 */
export function ThemeKeeper() {
  const choice = usePref("theme");
  const device = useDeviceClass();
  const timeZone = useTimeZone();

  useEffect(() => {
    const apply = () => {
      const theme = resolveTheme(choice, device, timeZone);
      document.documentElement.dataset.theme = theme;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme === "dark" ? "#0d1030" : "#2f7ff0");
    };
    apply();
    const interval = setInterval(apply, 60_000);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", apply);
    return () => {
      clearInterval(interval);
      mq?.removeEventListener?.("change", apply);
    };
  }, [choice, device, timeZone]);

  return null;
}

/**
 * A shared screen left alone goes home: back to Today, nobody selected. So the
 * wall across the room is always the family's day, never whichever recipe or
 * month someone last opened. Phones and laptops are left exactly as they were.
 */
export function IdleHome() {
  const device = useDeviceClass();
  const router = useRouter();
  const pathname = usePathname();

  useIdleReset(
    () => {
      setPref("lens", null);
      if (pathname !== appConfig.defaultRoute) router.push(appConfig.defaultRoute);
    },
    { timeoutMs: IDLE_HOME_MS, enabled: device === "wall" },
  );

  return null;
}
