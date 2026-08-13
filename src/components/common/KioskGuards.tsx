"use client";

import { useEffect } from "react";

// Client-only kiosk hardening. Renders nothing; installs the behaviors a
// wall-mounted, always-on, touch-only display needs (spec §6.1, Phase 0 items
// 13–14). CSS handles the passive guards (user-select, overscroll, callout,
// touch-action) in globals.css; this handles the ones that need JS.

type WakeLockLike = {
  request: (type: "screen") => Promise<{ release: () => Promise<void>; addEventListener: (e: string, cb: () => void) => void }>;
};

export function KioskGuards() {
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: WakeLockLike };
    let sentinel: { release: () => Promise<void> } | null = null;

    // ── 1. Screen Wake Lock ─────────────────────────────────────────────
    // Keep the display awake while foregrounded. The lock is released when the
    // page is backgrounded, so re-acquire on visibility change (Phase 0 #13).
    const acquire = async () => {
      try {
        if (nav.wakeLock && document.visibilityState === "visible") {
          const lock = await nav.wakeLock.request("screen");
          sentinel = lock;
          lock.addEventListener("release", () => {
            sentinel = null;
          });
        }
      } catch {
        // Unsupported or denied (e.g. not over HTTPS) — degrade silently.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    // ── 2. Suppress long-press context menu ─────────────────────────────
    const onContextMenu = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", onContextMenu);

    // ── 3. Suppress iOS pinch-zoom gesture events ───────────────────────
    // Belt-and-suspenders with the viewport meta (maximumScale=1) and the
    // touch-action CSS.
    const onGesture = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", onGesture);
    document.addEventListener("gesturechange", onGesture);

    // ── 4. Suppress double-tap-to-zoom ──────────────────────────────────
    let lastTouchEnd = 0;
    const onTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd < 300) e.preventDefault();
      lastTouchEnd = now;
    };
    document.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("gesturestart", onGesture);
      document.removeEventListener("gesturechange", onGesture);
      document.removeEventListener("touchend", onTouchEnd);
      void sentinel?.release().catch(() => {});
    };
  }, []);

  return null;
}
