"use client";

import { Users } from "lucide-react";
import { colorVar, EVERYONE_COLOR } from "@/lib/calendar/palette";
import { useTextOn } from "@/components/common/ColorProvider";

// A person's mark: their initial on their color. The same circle everywhere a
// person appears (lens, calendar, chores, school, allowance), so color and
// initial together are the family's whole visual vocabulary for "who".

const SIZES = {
  xs: "size-6 text-[0.8rem]",
  sm: "size-8 text-[1rem]",
  md: "size-10 text-[1.3rem]",
  lg: "size-12 text-[1.6rem]",
  xl: "size-16 text-[2.1rem]",
} as const;

export type AvatarSize = keyof typeof SIZES;

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
      className={`flex shrink-0 items-center justify-center rounded-full font-display leading-none ${SIZES[size]} ${className}`}
      style={{
        backgroundColor: `var(${colorVar(color)})`,
        color: dark ? "#27221c" : "#ffffff",
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
      className={`flex shrink-0 items-center justify-center rounded-full ${SIZES[size]} ${className}`}
      style={{
        backgroundColor: `var(${colorVar(EVERYONE_COLOR)})`,
        color: dark ? "#27221c" : "#ffffff",
      }}
      aria-hidden
    >
      <Users className="size-[55%]" strokeWidth={2.4} />
    </span>
  );
}

/** A soft wash of a member color over the card surface (rows, chips, lanes). */
export function tint(color: string, percent = 16): string {
  return `color-mix(in srgb, var(${colorVar(color)}) ${percent}%, var(--color-surface))`;
}
