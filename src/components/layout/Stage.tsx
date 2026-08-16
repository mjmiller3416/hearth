"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Fit-to-viewport stage.
//
// Hearth is authored against a fixed 1920×1080 design basis (spec §6.1). The
// whole canvas is scaled uniformly — so the design's type sizes and spacing are
// preserved exactly — and then GROWN along whichever axis has room to spare, so
// the layout fills the panel edge to edge instead of letterboxing:
//
//   * Scale is the tighter of width/height against the 1920×1080 basis — the
//     same uniform factor a fit-and-letterbox would pick, so nothing is ever
//     cut off and the design's density is untouched.
//   * The canvas is then sized to the *scaled-back* viewport (w/scale × h/scale).
//     On the tight axis that resolves to exactly 1920 or 1080; on the loose axis
//     it comes out larger, and the fluid layout inside (a fixed sidebar rail +
//     flex-1 columns + grid-cols-7) simply reflows into the extra room. A 16:9
//     panel gets exactly 1920×1080; a wider panel gets a wider grid.
//
// This replaces the earlier letterbox behavior. The wall panel is wider than
// 16:9, so the old code centered the 1920 canvas and left warm-ground bars down
// both sides (one hidden behind the ground-colored sidebar, one visibly empty on
// the right). Growing the canvas lets the calendar reach both edges — what a
// wall display should do — while the vertical layout, which already fit, is left
// bit-for-bit unchanged (same scale, still 1080 tall).
//
// We measure the real fitted box with a ResizeObserver rather than reading
// `window.innerWidth/innerHeight` once on mount. Some WebViews (this Skylight
// among them) report a too-short viewport for the first frame or two after boot
// — immersive/system-UI insets settle a beat late — and never fire a `resize`
// the old code could catch, which left the canvas mis-scaled forever. The
// observer re-fires the moment the box settles; the extra rAF + timeouts are a
// belt-and-suspenders for viewports that settle without triggering it at all.
//
// `position: fixed` descendants (the FAB, the Add and Day panels) resolve
// against this transformed box, so they cover and scale with the canvas exactly
// as intended — and now reach the true screen edges.

const BASE_W = 1920;
const BASE_H = 1080;

export function Stage({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [canvas, setCanvas] = useState({ w: BASE_W, h: BASE_H });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w > 0 && h > 0) {
        const s = Math.min(w / BASE_W, h / BASE_H);
        setScale(s);
        // Grow the canvas to fill the viewport at this scale: the tight axis
        // lands on its 1920/1080 basis, the loose axis takes the extra room.
        setCanvas({ w: w / s, h: h / s });
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
          width: canvas.w,
          height: canvas.h,
          // The host is a flex box; without this the oversized canvas (grown
          // past the viewport on its loose axis) is flex-shrunk right back to the
          // viewport, re-introducing the letterbox we grew it to remove. It
          // overflows the host on purpose — the transform scales it back to fit.
          flexShrink: 0,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          // Hidden until measured so a non-16:9 screen never flashes the
          // unscaled canvas. On the wall this resolves within the first frame.
          visibility: ready ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
