import type { ScheduleActivity, TandemChild } from "./types";
import { weekdays } from "./week";

// Synthetic Tandem data for LOCAL development only (Schedule view). Serves the
// same routine every week (school blocks plus a few after-school activities,
// including an overlap and an important one), so the grid, week navigation,
// and overlap layout can be exercised without the real Tandem API. Read-only, so
// unlike the Tada! and Meals mocks it holds no mutable state.
//
// SAFETY: enabled only when HEARTH_SCHEDULE_MOCK=1 AND NODE_ENV !== production,
// so a synthetic schedule can never reach the real wall.

export function isScheduleMockEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.HEARTH_SCHEDULE_MOCK === "1"
  );
}

type Block = [TandemChild, string, string, string, boolean?];

// Index = weekday (0 = Monday).
const ROUTINE: Block[][] = [
  [
    ["link", "Math live class", "09:00", "09:45"],
    ["link", "Reading", "10:00", "11:00"],
    ["ollie", "Circle time", "09:00", "09:30"],
    ["ollie", "Phonics", "09:30", "10:30"],
    ["link", "Soccer practice", "16:00", "17:30"],
  ],
  [
    ["link", "Science lab", "09:00", "10:30", true],
    ["ollie", "Art", "10:00", "11:00"],
    ["ollie", "Speech therapy", "13:00", "13:45", true],
    ["link", "Piano", "15:30", "16:00"],
  ],
  [
    ["link", "Math live class", "09:00", "09:45"],
    ["link", "Writing", "10:00", "11:00"],
    ["link", "Book club", "10:30", "11:30"],
    ["ollie", "Circle time", "09:00", "09:30"],
    ["ollie", "Swim lesson", "16:00", "16:45"],
  ],
  [
    ["link", "History", "09:00", "10:00"],
    ["ollie", "Phonics", "09:30", "10:30"],
    ["ollie", "Music", "11:00", "11:45"],
    ["link", "Soccer practice", "16:00", "17:30"],
  ],
  [
    ["link", "Field trip", "09:00", "14:00", true],
    ["ollie", "Show and tell", "09:00", "09:45"],
    ["ollie", "Library", "10:30", "11:15"],
  ],
];

export function mockWeek(monday: string): ScheduleActivity[] {
  return weekdays(monday).flatMap((day, i) =>
    ROUTINE[i].map(([child, name, start, end, important], j) => ({
      id: `${day}-${j}`,
      child,
      name,
      day,
      start,
      end,
      important: Boolean(important),
    })),
  );
}
