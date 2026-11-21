"use client";

import { Users } from "lucide-react";
import { colorVar, EVERYONE_COLOR } from "@/lib/calendar/palette";
import { useTextOn } from "@/components/common/ColorProvider";

// A person's mark: their initial on their color. The same circle everywhere a
// person appears (the dock, calendar, chores, school, allowance), so color and
// initial together are the family's whole visual vocabulary for "who".
//
// Each has a soft white rim, so a person's color still reads when it sits on a
// tile of a similar color (Ollie's blue on the sky, Lincoln's green on leaf).

/** Dark text on a light member color. Fixed: member colors ignore the theme. */
export const ON_LIGHT = "#141a33";

const SIZES = {
  xs: "size-6 text-[0.8rem]",
  sm: "size-8 text-[1rem]",
  md: "size-10 text-[1.25rem]",
  lg: "size-12 text-[1.5rem]",
  xl: "size-16 text-[2rem]",
} as const;

export type AvatarSize = keyof typeof SIZES;

const RIM = "shadow-[0_0_0_2px_rgba(255,255,255,0.75)]";

export function Avatar({
  name,
  color,
  size = "md",
  className = "",
}: {
  name: string;
  /** Palette slug. */
  color: string;
  size?: AvatarSize;
  className?: string;
}) {
  const textOn = useTextOn();
  const dark = textOn(color) === "dark";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-semibold leading-none ${RIM} ${SIZES[size]} ${className}`}
      style={{
        backgroundColor: `var(${colorVar(color)})`,
        color: dark ? ON_LIGHT : "#ffffff",
      }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** The whole family's mark (the family calendar's color). */
export function FamilyAvatar({
  size = "md",
  className = "",
}: {
  size?: AvatarSize;
  className?: string;
}) {
  const textOn = useTextOn();
  const dark = textOn(EVERYONE_COLOR) === "dark";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${RIM} ${SIZES[size]} ${className}`}
      style={{
        backgroundColor: `var(${colorVar(EVERYONE_COLOR)})`,
        color: dark ? ON_LIGHT : "#ffffff",
      }}
      aria-hidden
    >
      <Users className="size-[55%]" strokeWidth={2.4} />
    </span>
  );
}

/**
 * A translucent wash of a member color (rows, lanes, pills). It is mixed with
 * transparent rather than with a surface color, so it works on any tile.
 */
export function tint(color: string, percent = 16): string {
  return `color-mix(in srgb, var(${colorVar(color)}) ${percent}%, transparent)`;
}
