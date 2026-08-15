"use client";

import { useEffect, useState, type ReactNode } from "react";

// Fit-to-viewport stage.
//
// Hearth is authored for ONE fixed canvas — 1920×1080 landscape (spec §6.1,
// D-locked: "design to it. Do not build a responsive system for a screen that
// will never change size"). Rather than making every component fluid — which
// that decision explicitly rules out — the whole fixed canvas is scaled
// uniformly to fit whatever window it is shown in:
//
//   * On the real wall (1920×1080) the scale is exactly 1 — pixel-crisp, the
//     design as drawn.
//   * In a dev browser, or on any other panel, the canvas scales down (or up)
//     to fit, so nothing is ever cut off and the aspect ratio is preserved
//     (letterboxed in the warm ground color).
//
// `position: fixed` descendants (the FAB, the Add and Day panels) resolve
// against this transformed box, so they cover and scale with the canvas exactly
// as intended.

const STAGE_W = 1920;
const STAGE_H = 1080;

export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const compute = () => {
      setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
      setReady(true);
    };
    compute();
    window.addEventListener("resize", compute);
    // Some devices settle their viewport a beat after orientation/chrome changes.
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-ground">
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
