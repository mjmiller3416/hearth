"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { textOn as staticTextOn } from "@/lib/calendar/palette";

// Carries the resolved per-slug text treatment to client chips (Phase 2 #3).
// Member colors are customizable, so whether a fill wants light or dark ink can
// no longer be hard-coded by slug — it depends on the CURRENT color. The server
// resolves that (defaults merged with overrides) and passes the map here; chips
// read it via useTextOn(). Unknown slugs fall back to the static palette rule.

type TextMap = Record<string, "light" | "dark">;

const ColorContext = createContext<TextMap>({});

export function ColorProvider({
  textBySlug,
  children,
}: {
  textBySlug: TextMap;
  children: ReactNode;
}) {
  return <ColorContext.Provider value={textBySlug}>{children}</ColorContext.Provider>;
}

/** Returns a `(slug) => "light" | "dark"` reader honoring the current colors. */
export function useTextOn(): (slug: string) => "light" | "dark" {
  const textBySlug = useContext(ColorContext);
  return useMemo(
    () => (slug: string) => textBySlug[slug] ?? staticTextOn(slug),
    [textBySlug],
  );
}
