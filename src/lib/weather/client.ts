import { resolveTimeZone } from "@/lib/calendar/recurrence";
import { describeCode } from "./codes";
import type { PlaceMatch, WeatherDay, WeatherHour, WeatherPayload, WeatherPlace } from "./types";

// Open-Meteo: a free forecast service that needs no account or key. SERVER-ONLY.
//
// What leaves Hearth: the place's coordinates (rounded to about a kilometer)
// for the forecast, and the text typed into the place search in Settings.
// Nothing about the household goes with them.
//
// Units are Fahrenheit, and times come back as wall-clock times in the
// household's timezone.

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const SEARCH_URL = "https://geocoding-api.open-meteo.com/v1/search";
const TIMEOUT_MS = 8000;
const HOURS = 12;
const DAYS = 4;

interface ForecastResponse {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    is_day: number;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    is_day: number[];
    precipitation_probability?: (number | null)[];
  };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    precipitation_probability_max?: (number | null)[];
  };
}

interface SearchResponse {
  results?: {
    name: string;
    admin1?: string;
    country?: string;
    latitude: number;
    longitude: number;
  }[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  return (await res.json()) as T;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The forecast for a place: now, the next hours, and the next few days. */
export async function fetchForecast(place: WeatherPlace): Promise<WeatherPayload> {
  const params = new URLSearchParams({
    latitude: String(round2(place.latitude)),
    longitude: String(round2(place.longitude)),
    current: "temperature_2m,apparent_temperature,weather_code,is_day",
    hourly: "temperature_2m,weather_code,is_day,precipitation_probability",
    daily: "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
    temperature_unit: "fahrenheit",
    timezone: resolveTimeZone(),
    forecast_days: String(DAYS),
    forecast_hours: String(HOURS),
  });
  const data = await getJson<ForecastResponse>(`${FORECAST_URL}?${params}`);
  if (!data.current) throw new Error("open-meteo: no current conditions");

  const isDay = data.current.is_day === 1;
  const hours: WeatherHour[] = (data.hourly?.time ?? []).map((time, i) => {
    const day = data.hourly!.is_day[i] === 1;
    return {
      time,
      temp: Math.round(data.hourly!.temperature_2m[i]),
      sky: describeCode(data.hourly!.weather_code[i], day).sky,
      isDay: day,
      rainChance: data.hourly!.precipitation_probability?.[i] ?? null,
    };
  });
  const days: WeatherDay[] = (data.daily?.time ?? []).map((date, i) => ({
    date,
    high: Math.round(data.daily!.temperature_2m_max[i]),
    low: Math.round(data.daily!.temperature_2m_min[i]),
    sky: describeCode(data.daily!.weather_code[i], true).sky,
    rainChance: data.daily!.precipitation_probability_max?.[i] ?? null,
  }));

  return {
    configured: true,
    place: place.name,
    now: {
      temp: Math.round(data.current.temperature_2m),
      feelsLike: Math.round(data.current.apparent_temperature),
      ...describeCode(data.current.weather_code, isDay),
      isDay,
    },
    hours,
    days,
  };
}

/** Towns matching what was typed, best match first. */
export async function searchPlaces(query: string): Promise<PlaceMatch[]> {
  const params = new URLSearchParams({ name: query, count: "6", language: "en", format: "json" });
  const data = await getJson<SearchResponse>(`${SEARCH_URL}?${params}`);
  return (data.results ?? []).map((r) => {
    const detail = [r.admin1, r.country].filter(Boolean).join(", ");
    return {
      name: r.admin1 ? `${r.name}, ${r.admin1}` : r.name,
      detail,
      latitude: round2(r.latitude),
      longitude: round2(r.longitude),
    };
  });
}
