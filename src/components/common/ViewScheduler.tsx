"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTimeZone } from "@/components/common/TimeZone";
import { currentSlot } from "@/lib/viewSchedule";

// Switches the wall to the scheduled view as each boundary in VIEW_SCHEDULE
// (config.ts) passes, by the household clock. Renders nothing.
//
// It acts only on a *change* of slot, never on mount: a reload keeps whatever
// view was showing, and a tap to another view mid-slot is left alone until the
// next boundary. If someone touched the wall in the last minute when a boundary
// passes, the switch waits until they've stepped away — so it never pulls a
// half-typed event out from under a hand.

const CHECK_EVERY_MS = 15_000;
const QUIET_BEFORE_SWITCH_MS = 60_000;

export function ViewScheduler() {
  const timeZone = useTimeZone();
  const router = useRouter();

  useEffect(() => {
    let lastKey = currentSlot(new Date(), timeZone)?.key ?? null;
    let lastInteraction = 0;

    const check = () => {
      const slot = currentSlot(new Date(), timeZone);
      if (!slot || slot.key === lastKey) return;
      // Boundary passed — hold off while someone is using the wall.
      if (Date.now() - lastInteraction < QUIET_BEFORE_SWITCH_MS) return;
      lastKey = slot.key;
      if (window.location.pathname !== slot.href) router.push(slot.href);
    };

    const onInteract = () => {
      lastInteraction = Date.now();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };

    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "wheel"];
    events.forEach((e) => window.addEventListener(e, onInteract, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(check, CHECK_EVERY_MS);

    return () => {
      clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, onInteract));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [timeZone, router]);

  return null;
}
