"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Fit-to-viewport stage.
//
// Hearth is authored for ONE fixed canvas — 1920×1080 landscape (spec §6.1,
// D-locked: "design to it. Do not build a responsive system for a screen that
// will never change size"). Rather than making every component fluid — which
// that decision explicitly rules out — the whole fixed canvas is scaled
// uniformly to fit whatever window it is shown in:
//
//   * On a 16:9 viewport (the wall at 1920×1080, or a 1280×720 WebView, or a
//     maximized browser) the canvas fills it edge to edge.
//   * On any other aspect it scales to fit and letterboxes in the warm ground
//     color, so nothing is ever cut off.
//
// We measure the real fitted box with a ResizeObserver rather than reading
// `window.innerWidth/innerHeight` once on mount. Some WebViews (this Skylight
// among them) report a too-short viewport height for the first frame or two
// after boot — immersive/system-UI insets settle a beat late — and never fire a
// `resize` the old code could catch, which left the canvas scaled down and
// letterboxed on the sides forever. The observer re-fires the moment the box
// settles; the extra rAF + timeouts are a belt-and-suspenders for viewports
// that settle without triggering the observer at all.
//
// `position: fixed` descendants (the FAB, the Add and Day panels) resolve
// against this transformed box, so they cover and scale with the canvas exactly
// as intended.

const STAGE_W = 1920;
const STAGE_H = 1080;

export function Stage({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w > 0 && h > 0) {
        setScale(Math.min(w / STAGE_W, h / STAGE_H));
        setReady(true);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);

    // Catch late viewport settles that don't reach the observer at mount.
    const raf = requestAnimationFrame(measure);
    const timers = [200, 600, 1200].map((ms) => window.setTimeout(measure, ms));

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="fixed inset-0 flex items-center justify-center overflow-hidden bg-ground"
    >
      <div
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          // Hidden until measured so a non-1920 screen never flashes the
          // unscaled canvas. On the wall this resolves within the first frame.
          visibility: ready ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
