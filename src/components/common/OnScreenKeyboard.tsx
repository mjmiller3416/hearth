"use client";

import { useState } from "react";
import { ArrowBigUp, ChevronDown, Delete } from "lucide-react";

// A themed, in-app on-screen keyboard (Phase 2 #7).
//
// The wall's fields never focus a native input, so the OS keyboard never
// appears (and never shrinks the fixed-canvas Stage). Text fields render as
// tappable displays that open THIS keyboard instead; it drives the value through
// the callbacks below. Fully branded, touch-sized, no system chrome — the
// seamless experience the household wants.
//
// It owns only its transient shift/layer state; the field's value lives in the
// parent (insert/backspace/done are the whole contract).

type Layer = "letters" | "symbols";

const LETTER_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

const SYMBOL_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["-", "/", ":", ";", "(", ")", "$", "&", "@"],
  [".", ",", "?", "!", "'", "\""],
];

function Key({
  label,
  onClick,
  className = "",
  ariaLabel,
  grow = 1,
}: {
  label: React.ReactNode;
  onClick: () => void;
  className?: string;
  ariaLabel?: string;
  grow?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{ flexGrow: grow, flexBasis: 0 }}
      className={`flex h-16 min-w-0 items-center justify-center rounded-xl text-title font-medium transition-colors active:scale-95 ${className}`}
    >
      {label}
    </button>
  );
}

export function OnScreenKeyboard({
  onInsert,
  onBackspace,
  onDone,
  doneLabel = "Done",
}: {
  onInsert: (text: string) => void;
  onBackspace: () => void;
  onDone: () => void;
  doneLabel?: string;
}) {
  const [shift, setShift] = useState(true); // start capitalized, like a title
  const [layer, setLayer] = useState<Layer>("letters");

  const rows = layer === "letters" ? LETTER_ROWS : SYMBOL_ROWS;

  const press = (k: string) => {
    onInsert(shift && layer === "letters" ? k.toUpperCase() : k);
    if (shift && layer === "letters") setShift(false); // one-shot shift
  };

  const base = "bg-surface text-ink shadow-[0_1px_0_var(--color-hairline-strong)]";
  const accent = "bg-ground-2 text-ink-soft";

  return (
    <div className="flex flex-col gap-2 rounded-t-3xl border-t border-hairline bg-ground px-4 pb-5 pt-4 shadow-[0_-12px_30px_-18px_rgba(43,38,32,0.4)]">
      {rows.map((row, i) => (
        <div key={i} className="flex justify-center gap-1.5">
          {/* Shift sits at the left of the last letter row. */}
          {layer === "letters" && i === rows.length - 1 && (
            <Key
              ariaLabel="Shift"
              grow={1.5}
              onClick={() => setShift((s) => !s)}
              className={shift ? "bg-ink text-surface" : accent}
              label={<ArrowBigUp className="size-7" strokeWidth={2} aria-hidden />}
            />
          )}
          {row.map((k) => (
            <Key
              key={k}
              label={shift && layer === "letters" ? k.toUpperCase() : k}
              onClick={() => press(k)}
              className={base}
            />
          ))}
          {/* Backspace sits at the right of the last row. */}
          {i === rows.length - 1 && (
            <Key
              ariaLabel="Backspace"
              grow={1.5}
              onClick={onBackspace}
              className={accent}
              label={<Delete className="size-7" strokeWidth={2} aria-hidden />}
            />
          )}
        </div>
      ))}

      {/* Bottom row: layer toggle · space · done. */}
      <div className="flex justify-center gap-1.5">
        <Key
          ariaLabel="Toggle symbols"
          grow={1.5}
          onClick={() => setLayer((l) => (l === "letters" ? "symbols" : "letters"))}
          className={accent}
          label={<span className="text-label font-semibold">{layer === "letters" ? "123" : "ABC"}</span>}
        />
        <Key
          ariaLabel="Space"
          grow={5}
          onClick={() => onInsert(" ")}
          className={base}
          label={<span className="text-label text-ink-faint">space</span>}
        />
        <Key
          ariaLabel={doneLabel}
          grow={2}
          onClick={onDone}
          className="bg-ink text-surface"
          label={
            <span className="flex items-center gap-1.5 text-label font-semibold">
              <ChevronDown className="size-6" strokeWidth={2.25} aria-hidden />
              {doneLabel}
            </span>
          }
        />
      </div>
    </div>
  );
}
