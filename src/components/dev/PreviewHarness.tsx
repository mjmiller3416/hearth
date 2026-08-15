"use client";

import { useMemo, useState } from "react";
import { NAV } from "@/lib/config";

// ── Wall preview harness (dev only) ──────────────────────────────────────────
//
// Renders the real app inside a FIXED-size iframe, then shrinks that iframe
// visually with a CSS transform. The point is legibility judgement at wall
// distance without the actual hardware.
//
// Why an iframe: an iframe establishes its own viewport, so everything inside —
// media queries AND, for Hearth specifically, <Stage>'s `window.innerWidth/
// innerHeight` measurement — responds to the iframe's dimensions, NOT the laptop
// window. Set the iframe to a device resolution and the app renders exactly as
// it would on a panel of that size, regardless of how large the harness window
// is or how small we scale it down to view it.
//
// Why transform, not zoom/resize: `transform: scale()` shrinks the iframe
// *visually* while its internal viewport stays at the device resolution. Browser
// zoom or a smaller iframe element would change what the app measures and defeat
// the whole exercise. transform-origin is top-left and the wrapper is sized to
// the *scaled* box, so page layout (centering, the bezel) uses the visual size.
//
// The default (1280×720 @ 0.35) matches the ~13"-wide calendar panel viewed from
// ~6 ft: on a typical laptop that lands around 4.4" wide — the same angular size
// you'll get on the wall. Flip to 1920×1080 for a pixel-crisp Stage-native view
// (Stage renders at scale 1 there). Use the angular-size helper to re-derive the
// scale for a different panel, distance, or screen density.

type DevicePreset = { label: string; w: number; h: number };

const DEVICE_PRESETS: DevicePreset[] = [
  { label: "1280 × 720 — calendar panel (720p)", w: 1280, h: 720 },
  { label: "1920 × 1080 — wall, Stage-native (crisp)", w: 1920, h: 1080 },
  { label: "1366 × 768 — laptop panel", w: 1366, h: 768 },
  { label: "1024 × 600 — small HDMI panel", w: 1024, h: 600 },
];

const SCALE_PRESETS = [0.25, 0.35, 0.5, 1] as const;

// Routes worth previewing. NAV is the app's own destination list (pure data);
// `/` is added so the redirect-to-calendar path can be exercised too.
const ROUTE_OPTIONS = [{ label: "Home (/) → redirects", href: "/" }].concat(
  NAV.map((n) => ({ label: `${n.label} (${n.href})`, href: n.href })),
);

// Dark chrome so the harness never reads as the app itself, and so the warm
// cream canvas pops against it the way a lit panel would on a wall.
const C = {
  bg: "#0f0d0b",
  panel: "#171410",
  panelSoft: "#1f1b16",
  line: "#2c2822",
  ink: "#e9e3d5",
  inkSoft: "#a99f8c",
  inkFaint: "#6f675a",
  accent: "#c98a1e", // amber, borrowed from the app's Ollie token
};

export function PreviewHarness() {
  const [deviceW, setDeviceW] = useState(1280);
  const [deviceH, setDeviceH] = useState(720);
  const [scale, setScale] = useState(0.35);
  const [route, setRoute] = useState("/calendar");
  const [customRoute, setCustomRoute] = useState("/calendar");
  const [reloadNonce, setReloadNonce] = useState(0);

  // Angular-size helper inputs. Defaults describe the real calendar panel: ~13"
  // wide, viewed from ~6 ft, checked from ~2 ft at the laptop, on a ~96 CSS-px/in
  // display. These reproduce the ~0.35 default scale.
  const [wallWidthIn, setWallWidthIn] = useState(13);
  const [wallDistFt, setWallDistFt] = useState(6);
  const [laptopDistFt, setLaptopDistFt] = useState(2);
  const [densityPpi, setDensityPpi] = useState(96);

  const onScreenW = Math.round(deviceW * scale);
  const onScreenH = Math.round(deviceH * scale);

  const angular = useMemo(() => {
    // To match angular size, the on-screen physical width must equal the wall's
    // physical width scaled by the ratio of the two viewing distances.
    const targetIn =
      wallDistFt > 0 ? wallWidthIn * (laptopDistFt / wallDistFt) : 0;
    const targetPx = targetIn * densityPpi;
    const recommended = deviceW > 0 ? targetPx / deviceW : 0;
    const currentIn = densityPpi > 0 ? onScreenW / densityPpi : 0;
    return { targetIn, recommended, currentIn };
  }, [wallWidthIn, wallDistFt, laptopDistFt, densityPpi, deviceW, onScreenW]);

  const applyPreset = (p: DevicePreset) => {
    setDeviceW(p.w);
    setDeviceH(p.h);
  };

  const activePreset = DEVICE_PRESETS.find(
    (p) => p.w === deviceW && p.h === deviceH,
  );

  return (
    <div
      className="fixed inset-0 flex select-text overflow-hidden font-sans"
      style={{ background: C.bg, color: C.ink }}
    >
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <aside
        className="flex h-full w-[320px] shrink-0 flex-col gap-6 overflow-y-auto p-5 text-sm"
        style={{ background: C.panel, borderRight: `1px solid ${C.line}` }}
      >
        <header className="flex items-baseline justify-between">
          <h1 className="text-base font-semibold tracking-tight">
            Wall Preview
          </h1>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: C.panelSoft, color: C.accent }}
          >
            dev only
          </span>
        </header>

        {/* Device resolution ------------------------------------------------ */}
        <Section title="Device resolution" hint="the viewport the app measures">
          <div className="flex flex-col gap-1.5">
            {DEVICE_PRESETS.map((p) => {
              const active = p.w === deviceW && p.h === deviceH;
              return (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs transition-colors"
                  style={{
                    background: active ? C.accent : C.panelSoft,
                    color: active ? "#1a1206" : C.inkSoft,
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <NumberField
              label="W"
              value={deviceW}
              min={200}
              max={4096}
              onChange={setDeviceW}
            />
            <span style={{ color: C.inkFaint }}>×</span>
            <NumberField
              label="H"
              value={deviceH}
              min={200}
              max={4096}
              onChange={setDeviceH}
            />
          </div>
          {!activePreset && (
            <p className="mt-1 text-[11px]" style={{ color: C.inkFaint }}>
              Custom size — Stage inside will fit-scale the 1920×1080 canvas.
            </p>
          )}
        </Section>

        {/* Visual scale ----------------------------------------------------- */}
        <Section
          title={`Visual scale · ${Math.round(scale * 100)}%`}
          hint="shrinks the iframe, viewport unchanged"
        >
          <input
            type="range"
            min={0.1}
            max={1.5}
            step={0.01}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: C.accent }}
          />
          <div className="mt-2 flex items-center gap-1.5">
            {SCALE_PRESETS.map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className="flex-1 rounded-md px-1 py-1 text-xs transition-colors"
                style={{
                  background: scale === s ? C.accent : C.panelSoft,
                  color: scale === s ? "#1a1206" : C.inkSoft,
                  fontWeight: scale === s ? 600 : 400,
                }}
              >
                {Math.round(s * 100)}%
              </button>
            ))}
          </div>
        </Section>

        {/* Route ------------------------------------------------------------ */}
        <Section title="Route" hint="loaded in the frame">
          <select
            value={
              ROUTE_OPTIONS.some((o) => o.href === route) ? route : "__custom"
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__custom") {
                setRoute(customRoute);
              } else {
                setRoute(v);
                setCustomRoute(v);
              }
            }}
            className="w-full rounded-md px-2 py-1.5 text-xs"
            style={{ background: C.panelSoft, color: C.ink, border: `1px solid ${C.line}` }}
          >
            {ROUTE_OPTIONS.map((o) => (
              <option key={o.href} value={o.href}>
                {o.label}
              </option>
            ))}
            <option value="__custom">Custom…</option>
          </select>
          <div className="mt-2 flex items-center gap-1.5">
            <input
              type="text"
              value={customRoute}
              onChange={(e) => setCustomRoute(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setRoute(customRoute);
              }}
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md px-2 py-1.5 font-mono text-xs"
              style={{ background: C.panelSoft, color: C.ink, border: `1px solid ${C.line}` }}
            />
            <button
              onClick={() => setRoute(customRoute)}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium"
              style={{ background: C.panelSoft, color: C.inkSoft, border: `1px solid ${C.line}` }}
            >
              Go
            </button>
          </div>
          <button
            onClick={() => setReloadNonce((n) => n + 1)}
            className="mt-2 w-full rounded-md px-2 py-1.5 text-xs font-medium"
            style={{ background: C.panelSoft, color: C.inkSoft, border: `1px solid ${C.line}` }}
          >
            ↻ Reload frame
          </button>
        </Section>

        {/* Angular-size helper --------------------------------------------- */}
        <details className="text-xs" style={{ color: C.inkSoft }}>
          <summary className="cursor-pointer select-none font-medium" style={{ color: C.ink }}>
            Angular-size helper
          </summary>
          <p className="mt-2 leading-relaxed" style={{ color: C.inkFaint }}>
            Match how big the type <em>looks</em>. Enter the panel size, how far
            away it hangs, how far you sit from this laptop, and your screen
            density — then apply the recommended scale.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <NumberField label="Panel width (in)" value={wallWidthIn} min={1} max={200} onChange={setWallWidthIn} wide />
            <NumberField label="Panel dist (ft)" value={wallDistFt} min={1} max={50} onChange={setWallDistFt} wide />
            <NumberField label="Your dist (ft)" value={laptopDistFt} min={0.5} max={20} step={0.5} onChange={setLaptopDistFt} wide />
            <NumberField label="Screen PPI" value={densityPpi} min={72} max={400} onChange={setDensityPpi} wide />
          </div>
          <dl className="mt-3 flex flex-col gap-1" style={{ color: C.inkSoft }}>
            <Readout k="Target on-screen width" v={`${angular.targetIn.toFixed(1)} in`} />
            <Readout k="Recommended scale" v={`${Math.round(angular.recommended * 100)}%`} />
            <Readout k="Current on-screen width" v={`${angular.currentIn.toFixed(1)} in`} />
          </dl>
          <button
            onClick={() => setScale(Number(angular.recommended.toFixed(2)))}
            className="mt-2 w-full rounded-md px-2 py-1.5 text-xs font-semibold"
            style={{ background: C.accent, color: "#1a1206" }}
          >
            Apply recommended scale
          </button>
        </details>

        <p className="mt-auto text-[11px] leading-relaxed" style={{ color: C.inkFaint }}>
          If the frame shows the setup screen, authorize this browser once at{" "}
          <span className="font-mono">/setup?token=…</span>, then reload the
          frame.
        </p>
      </aside>

      {/* ── Stage ────────────────────────────────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div
          className="flex shrink-0 items-center justify-between px-4 py-2 font-mono text-[11px]"
          style={{ background: C.panel, borderBottom: `1px solid ${C.line}`, color: C.inkSoft }}
        >
          <span style={{ color: C.ink }}>{route}</span>
          <span>
            {deviceW}×{deviceH} · {Math.round(scale * 100)}% · {onScreenW}×
            {onScreenH}px on screen
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto p-10">
          {/* Wrapper is sized to the SCALED box so centering/letterboxing use
              the visual dimensions. The iframe keeps its full device size and is
              shrunk by transform from the top-left corner into this box. */}
          <div
            className="shrink-0"
            style={{
              width: onScreenW,
              height: onScreenH,
              boxShadow: "0 24px 70px -20px rgba(0,0,0,0.8)",
              outline: `1px solid ${C.line}`,
            }}
          >
            <iframe
              key={reloadNonce}
              title="Hearth wall preview"
              src={route}
              style={{
                width: deviceW,
                height: deviceH,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                border: "0",
                display: "block",
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

// ── small building blocks ────────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.ink }}>
          {title}
        </h2>
        {hint && (
          <p className="text-[11px]" style={{ color: C.inkFaint }}>
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  wide = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  wide?: boolean;
}) {
  return (
    <label className={`flex items-center gap-1.5 ${wide ? "flex-col items-start" : ""}`}>
      <span className="text-[11px]" style={{ color: C.inkFaint }}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className={`rounded-md px-2 py-1 text-xs ${wide ? "w-full" : "w-16"}`}
        style={{ background: C.panelSoft, color: C.ink, border: `1px solid ${C.line}` }}
      />
    </label>
  );
}

function Readout({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt style={{ color: C.inkFaint }}>{k}</dt>
      <dd className="font-mono" style={{ color: C.ink }}>
        {v}
      </dd>
    </div>
  );
}
