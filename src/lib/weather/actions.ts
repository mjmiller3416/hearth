import { fail, ok, type ActionResult } from "@/lib/action";
import { zonedFields } from "@/lib/calendar/dates";
import { resolveTimeZone } from "@/lib/calendar/recurrence";
import { setWeatherPlace as storePlace } from "@/lib/settings/store";
import { fetchForecast, searchPlaces as search } from "./client";
import { getWeatherPlace, weatherMockOn, validCoords } from "./config";
import { mockForecast, mockPlaces } from "./mock";
import type { PlacesPayload, WeatherPayload, WeatherPlace, WeatherPlacePayload } from "./types";

// Weather: the forecast for the household's town. The wall's routes and the
// MCP tool both run these. SERVER-ONLY.
//
// The forecast is kept in memory for ten minutes per place, so a house full of
// screens polling every few minutes is one request to Open-Meteo, not dozens.
// If Open-Meteo stops answering, the last forecast keeps being served for up
// to two hours rather than blanking the tile.

const FRESH_MS = 10 * 60_000;
const USABLE_MS = 2 * 60 * 60_000;
const NAME_MAX = 80;

let cache: { key: string; at: number; payload: WeatherPayload } | null = null;

const NOT_SET: WeatherPayload = { configured: false, place: null, now: null, hours: [], days: [] };

/** GET /api/weather */
export async function getWeather(): Promise<ActionResult> {
  if (weatherMockOn()) {
    const f = zonedFields(new Date(), resolveTimeZone());
    const pad = (n: number) => String(n).padStart(2, "0");
    return ok(mockForecast(`${f.y}-${pad(f.m)}-${pad(f.d)}`, f.h));
  }
  const { place } = await getWeatherPlace();
  if (!place) return ok(NOT_SET);

  const key = `${place.latitude},${place.longitude},${place.name}`;
  const now = Date.now();
  if (cache && cache.key === key && now - cache.at < FRESH_MS) return ok(cache.payload);
  try {
    const payload = await fetchForecast(place);
    cache = { key, at: now, payload };
    return ok(payload);
  } catch (e) {
    console.error("[weather] forecast failed:", e instanceof Error ? e.message : e);
    if (cache && cache.key === key && now - cache.at < USABLE_MS) return ok(cache.payload);
    return fail("Couldn't reach the forecast service.", 502);
  }
}

/** GET /api/weather/places?q=… : towns matching what was typed in Settings. */
export async function findPlaces(query: string): Promise<ActionResult> {
  const q = query.trim().slice(0, NAME_MAX);
  if (q.length < 2) return ok({ places: [] } satisfies PlacesPayload);
  if (weatherMockOn()) return ok({ places: mockPlaces(q) } satisfies PlacesPayload);
  try {
    return ok({ places: await search(q) } satisfies PlacesPayload);
  } catch (e) {
    console.error("[weather] place search failed:", e instanceof Error ? e.message : e);
    return fail("Couldn't search for places right now.", 502);
  }
}

/** GET /api/weather/place : the place the forecast is for. */
export async function currentPlace(): Promise<ActionResult> {
  return ok((await getWeatherPlace()) satisfies WeatherPlacePayload);
}

/** PUT /api/weather/place : choose the town ({ name, latitude, longitude }), or null to clear it. */
export async function choosePlace(body: unknown): Promise<ActionResult> {
  if (body === null || (typeof body === "object" && body !== null && (body as { place?: unknown }).place === null)) {
    await storePlace(null);
    return currentPlace();
  }
  if (typeof body !== "object" || body === null) return fail("Send a place: name, latitude and longitude.");
  const { name, latitude, longitude } = body as Record<string, unknown>;
  const coords = validCoords(latitude, longitude);
  const label = typeof name === "string" ? name.trim().slice(0, NAME_MAX) : "";
  if (!coords || !label) return fail("Send a place: name, latitude and longitude.");
  const place: WeatherPlace = { name: label, ...coords };
  await storePlace(place);
  return currentPlace();
}
