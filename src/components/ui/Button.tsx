"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

// The app's buttons. One primary color (ink) everywhere: saturation is reserved
// for people (spec §7), so an action never competes with a person's color.
// Every size clears a 44px touch target on a phone and scales up on the wall.

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-on-ink active:opacity-85",
  secondary: "bg-surface-2 text-ink ring-1 ring-inset ring-hairline-strong active:bg-ground-2",
  ghost: "text-ink-soft active:bg-ground-2 hover:bg-surface-2",
  danger: "bg-bad-soft text-bad active:opacity-85",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-9 px-3.5 text-label gap-1.5",
  md: "min-h-11 px-5 text-label gap-2",
  lg: "min-h-14 px-7 text-body gap-2.5",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none transition-[opacity,background-color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </button>
  );
}

/** A round, icon-only button. `label` is what a screen reader hears. */
export function IconButton({
  label,
  variant = "ghost",
  className = "",
  children,
  ...rest
}: {
  label: string;
  variant?: Variant;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      {...rest}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-[opacity,background-color,transform] active:scale-95 disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/** A segmented choice: one of a few options, the current one filled. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  /** What the group chooses, for a screen reader. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex shrink-0 items-center rounded-full bg-ground-2 p-1 ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`min-h-9 flex-1 whitespace-nowrap rounded-full px-4 text-label font-semibold leading-none transition-colors ${
              active ? "bg-surface text-ink shadow-card" : "text-ink-soft"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A wrapping row of choice pills (repeat frequency, reminder, rooms). */
export function ChoicePills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`min-h-10 rounded-full px-4 text-label font-semibold leading-none transition-colors ${
              active ? "bg-ink text-on-ink" : "bg-surface-2 text-ink-soft ring-1 ring-inset ring-hairline"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** An on/off switch. */
export function Toggle({
  on,
  onChange,
  label,
  disabled = false,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors disabled:opacity-40 ${
        on ? "bg-ink" : "bg-hairline-strong"
      }`}
    >
      <span
        className={`size-6 rounded-full bg-surface transition-transform ${
          on ? "translate-x-6" : "translate-x-0"
        }`}
      />
    </button>
  );
}
