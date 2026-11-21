"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

// Return a view to its resting state after a stretch of no interaction.
//
// Every view has the same requirement (spec §6.1 "ambient first"): someone taps
// to a past month, a filter, a detail sheet, then walks away, and the screen
// should quietly reset itself so the next glance is always the useful default.
//
// Interaction is any pointer or key event. A hidden→visible transition also
// counts as "someone's back," and resets the timer without firing.

const DEFAULT_TIMEOUT_MS = 5 * 60_000; // 5 minutes

export function useIdleReset(
  onIdle: () => void,
  { timeoutMs = DEFAULT_TIMEOUT_MS, enabled = true }: {
    timeoutMs?: number;
    enabled?: boolean;
  } = {},
) {
  // Hold the latest callback without re-subscribing listeners each render.
  const onIdleRef = useRef(onIdle);
  useLayoutEffect(() => {
    onIdleRef.current = onIdle;
  });

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onIdleRef.current(), timeoutMs);
    };

    const onVisibility = () => {
      // Don't reset while backgrounded; re-arm when it returns to view.
      if (document.visibilityState === "visible") arm();
    };

    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "wheel"];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);

    arm(); // start the clock
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [timeoutMs, enabled]);
}
