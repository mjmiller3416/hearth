// The weather shapes shared by the server (lib/weather) and the client views.
// Client-safe: types and pure helpers only.

/** What the sky is doing, reduced to the handful of pictures Hearth draws. */
export type Sky = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** Where the forecast is for. Chosen in Settings (or set by env). */
export interface WeatherPlace {
  /** What to show, e.g. "Asheville, North Carolina". */
  name: string;
  latitude: number;
  longitude: number;
}

export interface WeatherNow {
  /** Degrees Fahrenheit, rounded. */
  temp: number;
  feelsLike: number;
  sky: Sky;
  /** "Partly cloudy", "Light rain", ... */
  label: string;
  isDay: boolean;
}

export interface WeatherHour {
  /** Local wall time at the place, "YYYY-MM-DDTHH:MM". */
  time: string;
  temp: number;
  sky: Sky;
  isDay: boolean;
  /** Chance of rain or snow, 0–100, or null when the forecast has none. */
  rainChance: number | null;
}

export interface WeatherDay {
  /** "YYYY-MM-DD". */
  date: string;
  high: number;
  low: number;
  sky: Sky;
  rainChance: number | null;
}

export interface WeatherPayload {
  /** False when no place has been chosen yet: nothing else is filled in. */
  configured: boolean;
  place: string | null;
  now: WeatherNow | null;
  /** The next hours, starting with the current one. */
  hours: WeatherHour[];
  /** Today first. */
  days: WeatherDay[];
}

/** One match from the place search in Settings. */
export interface PlaceMatch extends WeatherPlace {
  /** State or region, and country, for telling two "Springfield"s apart. */
  detail: string;
}

export interface PlacesPayload {
  places: PlaceMatch[];
}

export interface WeatherPlacePayload {
  place: WeatherPlace | null;
  /** True when the place comes from the server's environment, not Settings. */
  fromEnv: boolean;
}

/** "3 PM" from a local "YYYY-MM-DDTHH:MM". */
export function hourLabel(time: string): string {
  const h = Number(time.slice(11, 13));
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}
