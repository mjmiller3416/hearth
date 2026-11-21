"use client";

import { useSyncExternalStore } from "react";

// Per-device preferences, kept in this browser's localStorage: who is looking
// (the lens), the theme choice and what kind of screen this is. They are
// conveniences, not household data, so nothing here reaches the server.
//
// Read through useSyncExternalStore: the server render and the first client
// render both see `null`, then React re-renders with the stored value, so there
// is no hydration mismatch and no setState-in-effect.

export type PrefKey = "lens" | "theme" | "device";

const PREFIX = "hearth.";
const listeners = new Set<() => void>();
const cache = new Map<PrefKey, string | null>();

function read(key: PrefKey): string | null {
  if (cache.has(key)) return cache.get(key) ?? null;
  let value: string | null = null;
  try {
    value = window.localStorage.getItem(PREFIX + key);
  } catch {
    // Private mode or blocked storage: the preference just doesn't persist.
  }
  cache.set(key, value);
  return value;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab of the same browser changed a preference.
  const onStorage = (e: StorageEvent) => {
    if (!e.key || !e.key.startsWith(PREFIX)) return;
    cache.delete(e.key.slice(PREFIX.length) as PrefKey);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Set (or clear, with null) one preference and tell every reader. */
export function setPref(key: PrefKey, value: string | null): void {
  cache.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Still applies for this page load.
  }
  listeners.forEach((l) => l());
}

/** The stored preference, or null (also null during SSR and hydration). */
export function usePref(key: PrefKey): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
}

// ── What kind of screen is this? ────────────────────────────────────────────

export type DeviceClass = "phone" | "personal" | "wall";

function mm(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/**
 * "wall": a large touch-only screen (no mouse or trackpad), i.e. the shared
 * display. It types with the in-app keyboard, returns to Today when left
 * alone, and dims in the evening. "phone": a narrow screen. "personal":
 * anything with a fine pointer (a laptop or desktop). Settings can force
 * "wall" or "personal" when the guess is wrong.
 */
function detect(): DeviceClass {
  const forced = read("device");
  if (forced === "wall" || forced === "personal") {
    return forced === "personal" && window.innerWidth < 900 ? "phone" : forced;
  }
  if (window.innerWidth < 900) return "phone";
  const touch = mm("(pointer: coarse)") || navigator.maxTouchPoints > 0;
  const fine = mm("(any-pointer: fine)");
  return touch && !fine ? "wall" : "personal";
}

function subscribeDevice(listener: () => void): () => void {
  window.addEventListener("resize", listener);
  const off = subscribe(listener);
  return () => {
    window.removeEventListener("resize", listener);
    off();
  };
}

/** This screen's class. "personal" during SSR and hydration. */
export function useDeviceClass(): DeviceClass {
  return useSyncExternalStore(subscribeDevice, detect, () => "personal");
}

/** True once running in the browser (false during SSR and hydration). */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
