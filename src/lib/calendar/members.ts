import type { CalendarMember } from "./types";

// Parse the CALENDAR_MAP environment variable — Hearth's entire notion of who
// is in the household (spec §5.1 "a static map in config ... Four entries. Not
// a database table"). Shape:
//
//   CALENDAR_MAP = {
//     "maryann@gmail.com":  { "name": "Maryann",  "color": "maryann"  },
//     "mitchell@gmail.com": { "name": "Mitchell", "color": "mitchell" },
//     "link@gmail.com":     { "name": "Lincoln",  "color": "lincoln"  },
//     "ollie@gmail.com":    { "name": "Ollie",    "color": "ollie"    }
//   }
//
// The key is the Google calendar id. `color` is a member-id key that resolves to
// a CSS token (src/lib/calendar/palette.ts). Parsed once and memoized — the map
// only changes on redeploy.

let cache: CalendarMember[] | null = null;
let warned = false;

export function getMembers(): CalendarMember[] {
  if (cache) return cache;

  const raw = process.env.CALENDAR_MAP;
  if (!raw) {
    cache = [];
    return cache;
  }

  try {
    const parsed = JSON.parse(raw) as Record<
      string,
      { name?: string; color?: string }
    >;
    cache = Object.entries(parsed).map(([calendarId, v]) => ({
      calendarId,
      name: v.name ?? calendarId,
      color: v.color ?? "",
    }));
  } catch (err) {
    // Malformed config is an operator error, not a runtime one — log once and
    // degrade to "no calendars" so the view stays calm (spec §6.2).
    if (!warned) {
      console.error("[calendar] CALENDAR_MAP is not valid JSON:", err);
      warned = true;
    }
    cache = [];
  }
  return cache;
}

/** True when at least one calendar is mapped. */
export function hasMembers(): boolean {
  return getMembers().length > 0;
}
