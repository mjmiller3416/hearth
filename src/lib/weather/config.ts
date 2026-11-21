import { readSettings } from "@/lib/settings/store";
import type { WeatherPlace } from "./types";

// Where the forecast is for. SERVER-ONLY.
//
// The town chosen in Settings wins (it is kept in Hearth's settings file with
// the family colors, so every screen agrees). Without one, the environment can
// supply it: HEARTH_WEATHER_LAT, HEARTH_WEATHER_LON and HEARTH_WEATHER_NAME.
// With neither, weather is simply "not set up" and nothing is fetched.

/** True in development when HEARTH_WEATHER_MOCK=1: a canned forecast, no network. */
export function weatherMockOn(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.HEARTH_WEATHER_MOCK === "1";
}

/** A sane latitude/longitude pair, or null. */
export function validCoords(latitude: unknown, longitude: unknown): { latitude: number; longitude: number } | null {
  const lat = typeof latitude === "number" ? latitude : Number.NaN;
  const lon = typeof longitude === "number" ? longitude : Number.NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { latitude: lat, longitude: lon };
}

function envPlace(): WeatherPlace | null {
  const rawLat = process.env.HEARTH_WEATHER_LAT?.trim();
  const rawLon = process.env.HEARTH_WEATHER_LON?.trim();
  if (!rawLat || !rawLon) return null;
  const coords = validCoords(Number(rawLat), Number(rawLon));
  if (!coords) return null;
  return { name: process.env.HEARTH_WEATHER_NAME?.trim() || "Home", ...coords };
}

/** The place to forecast, and whether it came from the environment. */
export async function getWeatherPlace(): Promise<{ place: WeatherPlace | null; fromEnv: boolean }> {
  const { weather } = await readSettings();
  if (weather) return { place: weather, fromEnv: false };
  const env = envPlace();
  return { place: env, fromEnv: env !== null };
}
