"use client";

import { useDeviceClass } from "@/lib/prefs";

// Does this screen type with the in-app keyboard?
//
// Only the shared wall does: a large touch-only screen where a native input
// would raise the OS keyboard over half the display. A phone uses its own
// keyboard (it has autocorrect and the family already types on it all day), and
// a laptop uses its physical one. See useDeviceClass for how a wall is told
// apart, and Settings → This screen to override the guess.
export function useTouchWall(): boolean {
  return useDeviceClass() === "wall";
}
