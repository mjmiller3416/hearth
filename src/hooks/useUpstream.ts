"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Shared polling hook implementing Hearth's stale-data contract (spec §6.2):
//
//   1. Keep the last known good data across failures.
//   2. Expose a `lastUpdated` timestamp.
//   3. Flip `isStale` only after two consecutive failed polls — a single blip
//      should not put an "as of" stamp on the wall.
//   4. Never throw to the view; degrade quietly.
//
// Phase 0 ships this as infrastructure; the real upstreams (Calendar, Tada!,
// Enchanted Spoon) plug their fetchers in from Phase 1 onward.

const STALE_AFTER = 2;

export interface UpstreamState<T> {
  /** Last good data, or null before the first successful load. */
  data: T | null;
  /** Epoch ms of the last successful fetch, or null. */
  lastUpdated: number | null;
  /** True after STALE_AFTER consecutive failures. */
  isStale: boolean;
  /** True only before the first successful load. */
  isLoading: boolean;
  error: unknown;
  /** Force a fetch now; resolves once that run settles (or is superseded). */
  refetch: () => Promise<void>;
}

export interface UpstreamOptions {
  /** Poll interval in ms. Default 60s (spec §5). */
  intervalMs?: number;
  /** Set false to pause polling entirely. */
  enabled?: boolean;
}

export function useUpstream<T>(
  fetcher: () => Promise<T>,
  options: UpstreamOptions = {},
): UpstreamState<T> {
  const { intervalMs = 60_000, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Keep the latest fetcher without re-subscribing the interval each render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const failuresRef = useRef(0);
  // Generation guard: only the most-recently-started run may commit. A refetch on
  // scope change (calendar month/week nav, Clean room switch) can overlap a poll
  // in flight, and without this a slower earlier response could land last and
  // overwrite the newer scope's data (a stale room showing under a pressed pill).
  const runIdRef = useRef(0);

  const run = useCallback(async () => {
    const myId = ++runIdRef.current;
    try {
      const next = await fetcherRef.current();
      if (myId !== runIdRef.current) return; // superseded by a newer run
      failuresRef.current = 0;
      setData(next);
      setLastUpdated(Date.now());
      setIsStale(false);
      setError(null);
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
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, intervalMs, run]);

  return {
    data,
    lastUpdated,
    isStale,
    isLoading: data === null && lastUpdated === null && !isStale,
    error,
    refetch: run,
  };
}
