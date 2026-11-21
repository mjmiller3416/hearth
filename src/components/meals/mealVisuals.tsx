"use client";

import { createElement, type CSSProperties } from "react";
import {
  Beef,
  CakeSlice,
  Carrot,
  Coffee,
  Cookie,
  Croissant,
  Drumstick,
  EggFried,
  Fish,
  Hamburger,
  type LucideIcon,
  Pizza,
  Salad,
  Soup,
  UtensilsCrossed,
} from "lucide-react";

// Visual identity for a meal — a deterministic color "tone" and a food icon,
// derived from the meal's id and name. Enchanted Spoon sends each recipe's own
// photo when it has one (its banner or reference image, a Cloudinary address),
// and MealImage shows that. A recipe without a photo, and every meal in the
// mock data, gets a vivid colored picture with a big white food glyph instead. When Enchanted Spoon starts returning image URLs, MealImage
// renders the real photo and the placeholder simply stops showing — no other
// change needed (spec: design for images, ship the image-less state first).
//
// The tile and the open card share these helpers keyed on the SAME mealId, so a
// meal's color stays consistent from the grid to its card.

export interface MealTone {
  /** var(--tone-<name>-bg) — the vivid fill. Also the solid fallback. */
  bg: string;
  /** var(--tone-<name>-ink) — its deep partner (dots and marks on paper). */
  ink: string;
  /** A diagonal fill from bg into ink, for pictures. Paint it as a
   *  background-image OVER a background-color of `bg`: the wall's engine has
   *  dropped gradients built from custom properties before. */
  gradient: string;
}

// The tone names must match the --tone-<name>-{bg,ink} pairs in globals.css.
const TONE_NAMES = [
  "peach",
  "berry",
  "lavender",
  "periwinkle",
  "mint",
  "coral",
  "teal",
  "honey",
] as const;

function toneByName(name: string): MealTone {
  const bg = `var(--tone-${name}-bg)`;
  const ink = `var(--tone-${name}-ink)`;
  return {
    bg,
    ink,
    gradient: `linear-gradient(140deg, ${bg} 10%, ${ink} 100%)`,
  };
}

/** A tiny stable string hash so a meal keeps its tone across renders and reloads. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** The color tone for a meal, stable for a given id. */
export function mealTone(id: string): MealTone {
  return toneByName(TONE_NAMES[hashString(id) % TONE_NAMES.length]);
}

// Keyword → icon. First match wins, so specific dishes come before general ones
// (a burger is a Hamburger before it's Beef). Anything unmatched falls back to
// crossed utensils.
const ICON_RULES: Array<[readonly string[], LucideIcon]> = [
  [["pizza"], Pizza],
  [["burger", "cheeseburger", "slider"], Hamburger],
  [["salmon", "fish", "tuna", "cod", "shrimp", "seafood", "crab"], Fish],
  [["chicken", "roast", "turkey", "wing", "drumstick", "poultry"], Drumstick],
  [["taco", "burrito", "steak", "beef", "meatball", "bolognese", "brisket", "sausage", "pork"], Beef],
  [["egg", "omelet", "breakfast", "benedict", "frittata", "b&g"], EggFried],
  [["salad", "slaw", "greens", "veggie", "vegetable", "avocado"], Salad],
  [["carrot"], Carrot],
  [["bread", "biscuit", "toast", "baguette", "roll", "croissant", "muffin", "pastry", "scone"], Croissant],
  [["cake", "cobbler", "pie", "brownie", "dessert", "crumble", "tart", "pudding"], CakeSlice],
  [["cookie"], Cookie],
  [["coffee", "latte", "espresso", "smoothie", "drink"], Coffee],
  [
    ["soup", "stew", "chili", "ramen", "noodle", "pasta", "spaghetti", "curry", "rice", "stir-fry", "stir fry", "bowl", "alfredo", "mac", "risotto"],
    Soup,
  ],
];

/** A representative food icon for a meal or recipe name. */
export function foodIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  for (const [keywords, Icon] of ICON_RULES) {
    if (keywords.some((k) => n.includes(k))) return Icon;
  }
  return UtensilsCrossed;
}

/**
 * Renders the food icon for a name. `foodIcon` returns a stable module-level
 * lucide component (a lookup, not a fresh component), so this is rendered via
 * `createElement` — the dynamic element type is idiomatic and keeps the
 * static-components lint rule from mistaking the lookup for a component defined
 * during render.
 */
export function FoodGlyph({
  name,
  className,
  strokeWidth = 1.5,
  style,
}: {
  name: string;
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}) {
  return createElement(foodIcon(name), { className, strokeWidth, style, "aria-hidden": true });
}

/**
 * A meal's picture surface — the real Enchanted Spoon photo when one exists,
 * otherwise a colored tone gradient with a centered food glyph. Fills its parent
 * (which sets the height and rounding); pass `iconClassName` to size the glyph.
 */
export function MealImage({
  id,
  name,
  imageUrl,
  iconClassName = "size-24",
}: {
  id: string;
  name: string;
  imageUrl: string | null;
  iconClassName?: string;
}) {
  if (imageUrl) {
    return (
      // Plain <img>, not next/image: the src is an external Enchanted Spoon URL
      // and a wall kiosk doesn't need optimization/remotePatterns config.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" className="h-full w-full object-cover" />
    );
  }
  const tone = mealTone(id);
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ backgroundColor: tone.bg, backgroundImage: tone.gradient }}
      aria-hidden
    >
      {/* A soft highlight, then the glyph. */}
      <span className="absolute -left-[20%] -top-[40%] size-[90%] rounded-full bg-white/15" />
      <FoodGlyph name={name} className={`relative text-white ${iconClassName}`} strokeWidth={1.4} />
    </div>
  );
}
