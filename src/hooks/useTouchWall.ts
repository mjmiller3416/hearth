"use client";

import { useState } from "react";

// Is this the touch wall, or a PC? (Phase 2 #8)
//
// Touch walls type with the in-app OnScreenKeyboard: no native input ever
// focuses, so the OS keyboard can't appear and shrink the fixed canvas. A
// PC/laptop (fine pointer, hover) gets a real text input instead, so a physical
// keyboard works normally. Computed once on first render; call it only from
// components that render client-side (panels, or views gated on `mounted`).
export function useTouchWall(): boolean {
  const [isTouch] = useState(() => {
    if (typeof window === "undefined") return false;
    const mm = (q: string) =>
      typeof window.matchMedia === "function" && window.matchMedia(q).matches;
    // Touch capability — generous (coarse primary pointer OR any touch points) so
    // the kiosk WebView is always caught.
    const coarse = mm("(pointer: coarse)");
    const hasTouchPoints =
      typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
    const touchCapable = coarse || hasTouchPoints;
    // …but a device with a fine pointer (mouse/trackpad) is a PC, even if it also
    // has a touchscreen. Only a touch-capable device with NO fine pointer is the
    // wall kiosk. This is the fix for the OSK appearing on touchscreen PCs and
    // blocking the physical keyboard (Todoist: "OSK on PC"). The wall reports no
    // fine pointer, so it still gets the in-app keyboard and never the OS one.
    const hasFinePointer = mm("(any-pointer: fine)");
    return touchCapable && !hasFinePointer;
  });
  return isTouch;
}
