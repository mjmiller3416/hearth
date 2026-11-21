"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, MapPin, Search } from "lucide-react";
import { OnScreenKeyboard } from "@/components/common/OnScreenKeyboard";
import { Button } from "@/components/ui/Button";
import { useTouchWall } from "@/hooks/useTouchWall";
import type { PlaceMatch, PlacesPayload, WeatherPlace, WeatherPlacePayload } from "@/lib/weather/types";

// Settings → Weather: choose the town the forecast is for. Type a town (or a
// ZIP code), pick the right match, done; every screen then shows its weather.
//
// The forecast comes from Open-Meteo, a free service that needs no account.
// Only the town's coordinates are sent to it.
//
// Typing: a phone or laptop gets a real input (Enter searches). The wall gets
// the in-app keyboard, portaled to <body> so it sits over the bottom bar.

const QUERY_MAX = 60;

export function WeatherSettings() {
  const isWall = useTouchWall();
  const [place, setPlace] = useState<WeatherPlace | null>(null);
  const [fromEnv, setFromEnv] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<PlaceMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kbOpen, setKbOpen] = useState(false);

  const apply = useCallback((payload: WeatherPlacePayload) => {
    setPlace(payload.place);
    setFromEnv(payload.fromEnv);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/weather/place", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<WeatherPlacePayload>) : Promise.reject()))
      .then((payload) => {
        if (!cancelled) apply(payload);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const search = async () => {
    const q = query.trim();
    if (q.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    setKbOpen(false);
    try {
      const res = await fetch(`/api/weather/places?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setMatches(((await res.json()) as PlacesPayload).places);
    } catch {
      setError("Couldn't search right now. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (next: WeatherPlace | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/weather/place", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          next ? { name: next.name, latitude: next.latitude, longitude: next.longitude } : { place: null },
        ),
      });
      if (!res.ok) throw new Error(String(res.status));
      apply((await res.json()) as WeatherPlacePayload);
      setMatches(null);
      setQuery("");
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-body text-fg">
        <MapPin className="size-5 shrink-0 text-accent" strokeWidth={2.25} aria-hidden />
        {!loaded ? (
          <span className="text-fg-faint">Checking…</span>
        ) : place ? (
          <span>
            Showing the weather for <strong className="font-semibold">{place.name}</strong>
            {fromEnv ? " (set on the server)" : ""}.
          </span>
        ) : (
          <span className="text-fg-soft">No town chosen yet, so Home shows no weather.</span>
        )}
      </p>

      <div className="flex items-center gap-2 rounded-full bg-fill p-1.5 pl-5">
        {isWall ? (
          <button
            type="button"
            onClick={() => setKbOpen(true)}
            aria-label="Town or ZIP code"
            className="flex min-h-11 min-w-0 flex-1 items-center text-left text-body"
          >
            {query ? (
              <span className="truncate text-fg">{query}</span>
            ) : (
              <span className="text-fg-faint">Town or ZIP code…</span>
            )}
            {kbOpen && <span className="ml-0.5 h-6 w-0.5 shrink-0 animate-pulse bg-accent" aria-hidden />}
          </button>
        ) : (
          <input
            type="text"
            value={query}
            maxLength={QUERY_MAX}
            enterKeyHint="search"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
            placeholder="Town or ZIP code…"
            aria-label="Town or ZIP code"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-faint"
          />
        )}
        <Button variant="primary" onClick={() => void search()} disabled={query.trim().length < 2 || busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2.5} aria-hidden />
          ) : (
            <Search className="size-4" strokeWidth={2.5} aria-hidden />
          )}
          Find
        </Button>
      </div>

      {matches !== null &&
        (matches.length === 0 ? (
          <p className="text-small text-fg-soft">Nothing found by that name. Try the town without the state.</p>
        ) : (
          <ul className="flex flex-col gap-1.5" aria-label="Matches">
            {matches.map((m) => (
              <li key={`${m.latitude},${m.longitude}`}>
                <button
                  type="button"
                  onClick={() => void save(m)}
                  disabled={busy}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-fill px-4 text-left active:bg-fill-2 disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-fg">{m.name}</span>
                    <span className="block truncate text-small text-fg-faint">{m.detail}</span>
                  </span>
                  <Check className="size-5 shrink-0 text-fg-faint" strokeWidth={2.5} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ))}

      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-small text-fg-faint">
          The forecast comes from Open-Meteo. Only the town&rsquo;s location is sent to it.
        </p>
        {place && !fromEnv && (
          <Button size="sm" onClick={() => void save(null)} disabled={busy}>
            Turn weather off
          </Button>
        )}
      </div>

      {isWall &&
        kbOpen &&
        createPortal(
          <div className="paper fixed inset-x-0 bottom-0 z-40 animate-rise rounded-t-[2rem] shadow-float">
            <div className="flex items-center gap-4 px-6 py-3">
              <p className="min-w-0 flex-1 truncate text-body text-fg">
                {query || <span className="text-fg-faint">Town or ZIP code…</span>}
              </p>
              <Button variant="primary" onClick={() => void search()} disabled={query.trim().length < 2 || busy}>
                <Search className="size-4" strokeWidth={2.5} aria-hidden />
                Find
              </Button>
            </div>
            <OnScreenKeyboard
              onInsert={(t) => setQuery((q) => (q.length + t.length <= QUERY_MAX ? q + t : q))}
              onBackspace={() => setQuery((q) => q.slice(0, -1))}
              onDone={() => setKbOpen(false)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
