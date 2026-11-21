import type { Sky } from "./types";

// WMO weather interpretation codes (what Open-Meteo returns) → the picture and
// the words Hearth shows. Pure and client-safe.

const TABLE: [codes: number[], sky: Sky, label: string][] = [
  [[0], "clear", "Clear"],
  [[1], "clear", "Mostly clear"],
  [[2], "partly", "Partly cloudy"],
  [[3], "cloudy", "Cloudy"],
  [[45, 48], "fog", "Foggy"],
  [[51, 53, 55], "drizzle", "Drizzle"],
  [[56, 57], "drizzle", "Freezing drizzle"],
  [[61], "rain", "Light rain"],
  [[63], "rain", "Rain"],
  [[65], "rain", "Heavy rain"],
  [[66, 67], "rain", "Freezing rain"],
  [[71], "snow", "Light snow"],
  [[73], "snow", "Snow"],
  [[75], "snow", "Heavy snow"],
  [[77], "snow", "Snow grains"],
  [[80, 81], "rain", "Showers"],
  [[82], "rain", "Heavy showers"],
  [[85, 86], "snow", "Snow showers"],
  [[95], "storm", "Thunderstorms"],
  [[96, 99], "storm", "Thunderstorms with hail"],
];

/** The sky and its label for a WMO code. Unknown codes read as cloudy. */
export function describeCode(code: number, isDay: boolean): { sky: Sky; label: string } {
  const row = TABLE.find(([codes]) => codes.includes(code));
  if (!row) return { sky: "cloudy", label: "Cloudy" };
  const [, sky, label] = row;
  // "Clear" at noon reads oddly; say what a person would.
  if (code === 0) return { sky, label: isDay ? "Sunny" : "Clear" };
  if (code === 1) return { sky, label: isDay ? "Mostly sunny" : "Mostly clear" };
  return { sky, label };
}
