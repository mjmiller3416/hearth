import type { PlaceMatch, WeatherPayload } from "./types";

// A canned forecast for development (HEARTH_WEATHER_MOCK=1): no network, and
// the same numbers every time so screenshots are stable.

/** A believable autumn day, hours starting from `startHour` today. */
export function mockForecast(today: string, startHour: number): WeatherPayload {
  const pad = (n: number) => String(n).padStart(2, "0");
  const temps = [58, 60, 62, 63, 64, 63, 61, 58, 55, 53, 51, 50];
  const skies = ["partly", "partly", "clear", "clear", "partly", "cloudy", "rain", "rain", "cloudy", "partly", "clear", "clear"] as const;
  const hours = temps.map((temp, i) => {
    const h = (startHour + i) % 24;
    return {
      time: `${today}T${pad(h)}:00`,
      temp,
      sky: skies[i],
      isDay: h >= 7 && h < 18,
      rainChance: skies[i] === "rain" ? 60 : skies[i] === "cloudy" ? 20 : 0,
    };
  });
  const day = (offset: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  return {
    configured: true,
    place: "Maple Hollow",
    now: {
      temp: 62,
      feelsLike: 60,
      sky: "partly",
      label: "Partly cloudy",
      isDay: startHour >= 7 && startHour < 18,
    },
    hours,
    days: [
      { date: day(0), high: 65, low: 48, sky: "partly", rainChance: 20 },
      { date: day(1), high: 59, low: 44, sky: "rain", rainChance: 70 },
      { date: day(2), high: 54, low: 39, sky: "cloudy", rainChance: 30 },
      { date: day(3), high: 57, low: 41, sky: "clear", rainChance: 0 },
    ],
  };
}

export function mockPlaces(query: string): PlaceMatch[] {
  const q = query.trim() || "Maple Hollow";
  return [
    { name: `${q}, North Carolina`, detail: "North Carolina, United States", latitude: 35.6, longitude: -82.55 },
    { name: `${q}, Ohio`, detail: "Ohio, United States", latitude: 40.1, longitude: -82.9 },
  ];
}
