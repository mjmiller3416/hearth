"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, CircleCheck, CircleDashed, RefreshCw } from "lucide-react";
import { useTimeZone } from "@/components/common/TimeZone";
import { Button, Segmented } from "@/components/ui/Button";
import { NIGHT_END, NIGHT_START } from "@/lib/config";
import { toDateParam, addDays, zonedNow } from "@/lib/calendar/dates";
import { setPref, useDeviceClass, usePref } from "@/lib/prefs";
import { shortTime } from "@/lib/tandem/week";

// Settings that belong to THIS screen (kept in this browser, see lib/prefs) and
// a live check of what Hearth is connected to.

/** Theme and screen type for this device. */
export function ScreenSettings() {
  const theme = usePref("theme") ?? "auto";
  const forced = usePref("device") ?? "auto";
  const device = useDeviceClass();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-body text-fg">Appearance</span>
          <Segmented
            label="Appearance"
            value={theme}
            onChange={(v) => setPref("theme", v === "auto" ? null : v)}
            options={[
              { value: "auto", label: "Auto" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Evening" },
            ]}
          />
        </div>
        <p className="text-small text-fg-faint">
          {device === "wall"
            ? `Auto dims this screen for the evening, ${shortTime(NIGHT_START)} PM to ${shortTime(NIGHT_END)} AM.`
            : "Auto follows this device's own light or dark setting."}
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-body text-fg">This screen is</span>
          <Segmented
            label="Screen type"
            value={forced}
            onChange={(v) => setPref("device", v === "auto" ? null : v)}
            options={[
              { value: "auto", label: "Auto" },
              { value: "wall", label: "Shared" },
              { value: "personal", label: "Mine" },
            ]}
          />
        </div>
        <p className="text-small text-fg-faint">
          {device === "wall"
            ? "Treated as a shared screen: it returns to Today when left alone, forgets who was looking, types with the on-screen keyboard and keeps allowance amounts covered."
            : "Treated as a personal screen: it stays where you left it and remembers who's looking."}
          {forced === "auto" ? " Hearth guessed; change it here if that's wrong." : ""}
        </p>
      </div>
    </div>
  );
}

// ── Connections ─────────────────────────────────────────────────────────────

type Health = "checking" | "ok" | "off" | "down";

interface Connection {
  app: string;
  powers: string;
  /** A cheap read whose payload carries `configured`. */
  url: (today: Date) => string;
}

const CONNECTIONS: Connection[] = [
  {
    app: "Google Calendar",
    powers: "The calendar and countdowns",
    url: (t) => `/api/calendar?start=${toDateParam(t)}&end=${toDateParam(addDays(t, 1))}`,
  },
  { app: "Tada!", powers: "Kids' chores and the cleaning session", url: () => "/api/tasks/kids" },
  { app: "Tandem", powers: "The kids' school week", url: (t) => `/api/schedule?week=${toDateParam(t)}` },
  { app: "Enchanted Spoon", powers: "The meal plan and shopping list", url: () => "/api/meals" },
];

async function probe(url: string): Promise<Health> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return "down";
    const json = (await res.json()) as { configured?: boolean };
    return json.configured ? "ok" : "off";
  } catch {
    return "down";
  }
}

const HEALTH: Record<Health, { label: string; className: string; Icon: typeof CircleCheck }> = {
  checking: { label: "Checking…", className: "text-fg-faint", Icon: CircleDashed },
  ok: { label: "Connected", className: "text-good", Icon: CircleCheck },
  off: { label: "Not set up", className: "text-fg-faint", Icon: CircleDashed },
  down: { label: "Not answering", className: "text-bad", Icon: CircleAlert },
};

/**
 * What Hearth is connected to, checked live. One place to look when a card on
 * Today says an app isn't connected or can't be reached.
 */
export function Connections() {
  const timeZone = useTimeZone();
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const check = useCallback(async () => {
    setHealth({});
    const today = zonedNow(timeZone);
    await Promise.all(
      CONNECTIONS.map(async (c) => {
        const result = await probe(c.url(today));
        setHealth((prev) => ({ ...prev, [c.app]: result }));
      }),
    );
    setCheckedAt(new Date());
  }, [timeZone]);

  useEffect(() => {
    const t = setTimeout(() => void check(), 0);
    return () => clearTimeout(t);
  }, [check]);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line">
        {CONNECTIONS.map((c) => {
          const h = HEALTH[health[c.app] ?? "checking"];
          return (
            <li key={c.app} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-body text-fg">{c.app}</span>
                <span className="block text-small text-fg-faint">{c.powers}</span>
              </span>
              <span className={`flex shrink-0 items-center gap-1.5 text-small font-semibold ${h.className}`}>
                <h.Icon className="size-5" strokeWidth={2.25} aria-hidden />
                {h.label}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-tiny text-fg-faint">
          {checkedAt
            ? `Checked at ${checkedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone })}`
            : " "}
        </span>
        <Button size="sm" onClick={() => void check()}>
          <RefreshCw className="size-4" strokeWidth={2.25} aria-hidden />
          Check again
        </Button>
      </div>
      <p className="text-small text-fg-faint">
        &ldquo;Not set up&rdquo; means that app&rsquo;s address or key isn&rsquo;t on the Hearth server.
        &ldquo;Not answering&rdquo; means it is, but the app didn&rsquo;t reply just now; Hearth keeps
        showing the last thing it heard and retries every minute.
      </p>
    </div>
  );
}
