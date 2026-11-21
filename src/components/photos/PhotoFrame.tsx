"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, EyeOff } from "lucide-react";
import type { PhotoInfo } from "@/lib/photos/types";

// The family photo on Home: one picture at a time, changing slowly, with
// whatever is passed as children (the clock) laid over the top of it.
//
// A photo that roughly matches the frame's shape fills it. One that doesn't (a
// wide shot in a tall frame) is shown whole at the bottom of the frame, over a
// blurred copy of itself, so nobody's face is cropped off and the clock sits
// mostly on the blur above it.
//
// Tapping the picture brings up two controls for a few seconds: Next, and
// "Don't show" (two taps, because it takes the photo off every screen).

const ADVANCE_MS = 45_000;
const CONTROLS_MS = 7_000;
/** How far a photo's shape may be from the frame's and still fill it. */
const FILL_TOLERANCE = 1.4;

/** A small stable hash, for a shuffle that is the same all day. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function Picture({ id, fresh }: { id: string; fresh: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // null until the picture has loaded and its shape is known.
  const [fill, setFill] = useState<boolean | null>(null);
  const src = `/api/photos/${id}`;
  return (
    <div
      ref={ref}
      className={`absolute inset-0 overflow-hidden bg-night ${fresh ? "[animation:hearth-fade-in_1400ms_ease-out]" : ""}`}
    >
      {fill === false && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl brightness-75" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onLoad={(e) => {
          const frame = ref.current;
          const img = e.currentTarget;
          if (!frame || !img.naturalWidth || !frame.clientHeight) return setFill(true);
          const photo = img.naturalWidth / img.naturalHeight;
          const box = frame.clientWidth / frame.clientHeight;
          setFill(Math.max(photo / box, box / photo) <= FILL_TOLERANCE);
        }}
        className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${
          fill === null ? "opacity-0" : "opacity-100"
        } ${fill === false ? "object-contain object-bottom" : "object-cover"}`}
      />
    </div>
  );
}

export function PhotoFrame({
  photos,
  daySeed,
  onRemove,
  children,
  className = "",
}: {
  photos: PhotoInfo[];
  /** Changes once a day (e.g. the date), so the order does too. */
  daySeed: string;
  /** Take the showing photo down for good. */
  onRemove: (id: string) => void;
  /** Laid over the top of the picture (the clock). */
  children?: ReactNode;
  className?: string;
}) {
  const order = useMemo(
    () => [...photos].sort((a, b) => hash(a.id + daySeed) - hash(b.id + daySeed)),
    [photos, daySeed],
  );
  const [step, setStep] = useState(0);
  const [controls, setControls] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (order.length < 2) return;
    const t = setInterval(() => setStep((s) => s + 1), ADVANCE_MS);
    return () => clearInterval(t);
  }, [order.length]);

  useEffect(() => {
    if (!controls) return;
    const t = setTimeout(() => {
      setControls(false);
      setArmed(false);
    }, CONTROLS_MS);
    return () => clearTimeout(t);
  }, [controls, step, armed]);

  if (order.length === 0) return null;
  const current = order[step % order.length];
  const previous = step > 0 ? order[(step - 1) % order.length] : null;
  const taken = current.takenAt
    ? new Date(current.takenAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  return (
    <section className={`on-color tile relative ${className}`} aria-label="Family photo">
      <button
        type="button"
        onClick={() => {
          setControls((c) => !c);
          setArmed(false);
        }}
        aria-label="Photo options"
        className="absolute inset-0 block"
      >
        {previous && previous.id !== current.id && <Picture key={`prev-${previous.id}`} id={previous.id} fresh={false} />}
        <Picture key={current.id} id={current.id} fresh={step > 0} />
        {/* Shade under the clock and under the caption. */}
        <span className="absolute inset-x-0 top-0 h-[55%] bg-gradient-to-b from-black/60 via-black/25 to-transparent" aria-hidden />
        <span className="absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-t from-black/55 to-transparent" aria-hidden />
      </button>

      {children && <div className="pointer-events-none relative p-4 wide:p-6">{children}</div>}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 wide:p-5">
        <p className="text-small font-semibold text-white/85">{taken}</p>
        {controls && (
          <div className="pointer-events-auto flex animate-fade items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (armed) {
                  setControls(false);
                  setArmed(false);
                  onRemove(current.id);
                } else setArmed(true);
              }}
              className={`flex min-h-11 items-center gap-1.5 rounded-full px-4 text-small font-semibold active:scale-95 ${
                armed ? "bg-spark text-night" : "bg-black/50 text-white"
              }`}
            >
              <EyeOff className="size-4" strokeWidth={2.5} aria-hidden />
              {armed ? "Remove it?" : "Don't show"}
            </button>
            {order.length > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="flex min-h-11 items-center gap-1 rounded-full bg-white px-4 text-small font-semibold text-night active:scale-95"
              >
                Next
                <ChevronRight className="size-4" strokeWidth={3} aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
