"use client";

import { usePathname } from "next/navigation";
import { useTimeZone } from "@/components/common/TimeZone";
import { useNow } from "@/hooks/useNow";

// The scene behind everything: which sky the screen is showing, and the lights
// drifting across it.
//
// Home follows the household clock (dawn, day, dusk); every other page takes
// its area's color, so you can tell where you are from across the room. In the
// evening theme every scene becomes the night sky (globals.css does that from
// <html data-theme>, so nothing here needs to know the theme).

const AREA_SCENES: [prefix: string, scene: string][] = [
  ["/calendar", "scene-ocean"],
  ["/school", "scene-sun"],
  ["/chores", "scene-grape"],
  ["/kitchen", "scene-leaf"],
  ["/settings", "scene-slate"],
];

/** The scene class for Home at a given household hour. */
function homeScene(hour: number): string {
  if (hour >= 5 && hour < 8) return "scene-dawn";
  if (hour >= 8 && hour < 17) return "scene-day";
  return "scene-dusk";
}

/** The CSS class of the scene this page should show. */
export function useScene(): string {
  const pathname = usePathname();
  const now = useNow(useTimeZone());
  const area = AREA_SCENES.find(([prefix]) => pathname.startsWith(prefix));
  if (area) return area[1];
  // Before the clock is known (SSR and the first paint) Home shows the day sky.
  return now ? homeScene(now.getHours()) : "scene-day";
}

// A fixed scatter of stars (left %, top %, size rem, delay s). They only show
// in the evening theme.
const STARS: [number, number, number, number][] = [
  [6, 12, 0.18, 0],
  [14, 34, 0.12, 1.2],
  [22, 8, 0.14, 2.1],
  [31, 22, 0.2, 0.6],
  [38, 6, 0.12, 3.3],
  [47, 16, 0.16, 1.8],
  [55, 30, 0.12, 2.7],
  [63, 9, 0.2, 0.3],
  [71, 24, 0.14, 3.9],
  [79, 12, 0.16, 1.5],
  [88, 28, 0.12, 2.4],
  [94, 7, 0.18, 0.9],
  [10, 58, 0.12, 3.0],
  [27, 70, 0.14, 1.1],
  [44, 62, 0.12, 2.2],
  [68, 66, 0.16, 0.4],
  [84, 54, 0.12, 3.6],
  [92, 76, 0.14, 1.9],
];

/** The drifting lights and the stars. Sits behind the page, never interactive. */
export function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="glow glow-a" />
      <div className="glow glow-b" />
      <div className="glow glow-c" />
      {STARS.map(([left, top, size, delay], i) => (
        <span
          key={i}
          className="star"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: `${size}rem`,
            height: `${size}rem`,
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </div>
  );
}
