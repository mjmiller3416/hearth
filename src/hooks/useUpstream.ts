"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Shared polling hook implementing Hearth's stale-data contract (spec §6.2):
//
//   1. Keep the last known good data across failures.
//   2. Expose a `lastUpdated` timestamp.
//   3. Flip `isStale` only after two consecutive failed polls: a single blip
//      should not put an "as of" stamp on the wall.
//   4. Never throw to the view; degrade quietly.
//
// It also refetches when the page comes back into view (a phone unlocked, a tab
// switched back to), so a pocketed phone never shows this morning's list.

const STALE_AFTER = 2;
/** Coming back into view refetches only if the data is at least this old. */
const REFOCUS_MIN_AGE_MS = 15_000;

export interface UpstreamState<T> {
  /** Last good data, or null before the first successful load. */
  data: T | null;
  /** Epoch ms of the last successful fetch, or null. */
  lastUpdated: number | null;
  /** True after STALE_AFTER consecutive failures. */
  isStale: boolean;
  /** True only before the first successful load. */
  isLoading: boolean;
  /** True when nothing has ever loaded and the fetch keeps failing. */
  failed: boolean;
  error: unknown;
  /** Force a fetch now; resolves once that run settles (or is superseded). */
  refetch: () => Promise<void>;
}

export interface UpstreamOptions<T> {
  /** Poll interval in ms. Default 60s (spec §5). */
  intervalMs?: number;
  /** Set false to pause polling entirely. */
  enabled?: boolean;
  /**
   * Called with each successful result, right after it is committed. The place
   * to retire optimistic state the poll now agrees with.
   */
  onData?: (data: T) => void;
}

export function useUpstream<T>(
  fetcher: () => Promise<T>,
  options: UpstreamOptions<T> = {},
): UpstreamState<T> {
  const { intervalMs = 60_000, enabled = true, onData } = options;

  const [data, setData] = useState<T | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Keep the latest fetcher and callback without re-subscribing the interval.
  const fetcherRef = useRef(fetcher);
  const onDataRef = useRef(onData);
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
    onDataRef.current = onData;
  });
  const failuresRef = useRef(0);
  const lastOkRef = useRef(0);
  // Generation guard: only the most-recently-started run may commit. A refetch
  // on scope change (calendar month/week nav, Clean room switch) can overlap a
  // poll in flight, and without this a slower earlier response could land last
  // and overwrite the newer scope's data.
  const runIdRef = useRef(0);

  const run = useCallback(async () => {
    const myId = ++runIdRef.current;
    try {
      const next = await fetcherRef.current();
      if (myId !== runIdRef.current) return; // superseded by a newer run
      failuresRef.current = 0;
      lastOkRef.current = Date.now();
      setData(next);
      setLastUpdated(lastOkRef.current);
      setIsStale(false);
      setError(null);
      onDataRef.current?.(next);
    } catch (err) {
      if (myId !== runIdRef.current) return; // superseded by a newer run
      // Retain the last good `data`; only escalate to stale after N failures.
      failuresRef.current += 1;
      setError(err);
      if (failuresRef.current >= STALE_AFTER) setIsStale(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void run();
    };
    tick(); // immediate first load
    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastOkRef.current >= REFOCUS_MIN_AGE_MS) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs, run]);

  return {
    data,
    lastUpdated,
    isStale,
    isLoading: data === null && !isStale,
    failed: data === null && isStale,
    error,
    refetch: run,
  };
}
