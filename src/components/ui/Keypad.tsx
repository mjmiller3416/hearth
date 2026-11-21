"use client";

import { useEffect } from "react";
import { Delete } from "lucide-react";

// A number pad for the two things Hearth asks for in digits: the parent PIN and
// a dollar amount. Tappable on every screen (so the wall never raises the OS
// keyboard and a PIN is never typed into a field that could autofill), and it
// also listens to a physical keyboard so a laptop can just type.

export function Keypad({
  value,
  onChange,
  maxLength,
  decimal = false,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  /** Show a "." key (amounts); a PIN pad leaves that corner empty. */
  decimal?: boolean;
  /** Enter on a physical keyboard. */
  onEnter?: () => void;
}) {
  const press = (key: string) => {
    if (key === "back") return onChange(value.slice(0, -1));
    if (value.length >= maxLength) return;
    if (key === ".") {
      if (!decimal || value.includes(".")) return;
      return onChange(value === "" ? "0." : value + ".");
    }
    // At most two digits after the decimal point.
    const dot = value.indexOf(".");
    if (dot !== -1 && value.length - dot > 2) return;
    onChange(value + key);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key) || e.key === ".") press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter") onEnter?.();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "", "0", "back"];
  return (
    <div className="mx-auto grid w-full max-w-[18rem] grid-cols-3 gap-2">
      {keys.map((key, i) =>
        key === "" ? (
          <span key={`blank-${i}`} />
        ) : (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            aria-label={key === "back" ? "Delete" : key === "." ? "Decimal point" : key}
            className="flex h-14 items-center justify-center rounded-2xl bg-fill font-display text-big leading-none text-fg active:scale-95 active:bg-fill-2"
          >
            {key === "back" ? <Delete className="size-6" strokeWidth={2} aria-hidden /> : key}
          </button>
        ),
      )}
    </div>
  );
}

/** The dots above a PIN pad: one per digit entered. */
export function PinDots({ length, max }: { length: number; max: number }) {
  return (
    <div className="flex h-6 items-center justify-center gap-2.5" aria-label={`${length} digits entered`}>
      {Array.from({ length: Math.max(length, 4) }, (_, i) => (
        <span
          key={i}
          className={`size-3.5 rounded-full ${i < length ? "bg-accent" : "bg-line-strong"}`}
        />
      )).slice(0, max)}
    </div>
  );
}
