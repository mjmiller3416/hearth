import type { CalendarEvent, CalendarMember } from "@/lib/calendar/types";

// Synthetic events for LOCAL development only. Building the full month grid,
// overflow panel, filters, and week view is impossible to verify without event
// data, and the real Google setup (dedicated account, OAuth consent, refresh
// token) is manual operator work that can't run in a build sandbox. This lets
// the rendering be exercised end-to-end against realistic shapes.
//
// SAFETY: enabled only when HEARTH_CALENDAR_MOCK=1 AND NODE_ENV !== production.
// It can never turn on in a Railway deploy, so no fake data reaches the wall.

export function isMockEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" && process.env.HEARTH_CALENDAR_MOCK === "1"
  );
}

// Deterministic pseudo-random so the mocked wall doesn't reshuffle every poll.
function seeded(n: number): number {
  const x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}

function iso(base: Date, dayOffset: number, hour: number, min = 0): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour, min);
  return d.toISOString();
}

function dateOnly(base: Date, dayOffset: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const SAMPLE_TITLES = [
  "Dr. appt", "Soccer practice", "Piano lesson", "Dentist", "Book club",
  "Work trip", "Swim meet", "Parent–teacher", "Haircut", "Team standup",
  "Grocery run", "Date night", "Vet visit", "Recital", "Study group",
];

/**
 * Deterministic sample events for the mapped members across the given range.
 * Falls back to two placeholder members if CALENDAR_MAP isn't set locally, so
 * the mock works with zero configuration.
 */
export function getMockEvents(
  members: CalendarMember[],
  start: Date,
  end: Date,
): CalendarEvent[] {
  const people: CalendarMember[] =
    members.length > 0
      ? members
      : [
          { calendarId: "maryann@example.com", name: "Maryann", color: "maryann" },
          { calendarId: "mitchell@example.com", name: "Mitchell", color: "mitchell" },
          { calendarId: "lincoln@example.com", name: "Lincoln", color: "lincoln" },
          { calendarId: "ollie@example.com", name: "Ollie", color: "ollie" },
        ];

  const now = new Date();
  const events: CalendarEvent[] = [];
  // Scatter events across roughly two months around today.
  for (let day = -20; day <= 40; day++) {
    const count = Math.floor(seeded(day + 100) * 5); // 0–4 events; exercises "+N more"
    for (let i = 0; i < count; i++) {
      const person = people[Math.floor(seeded(day * 7 + i) * people.length)];
      const titleIdx = Math.floor(seeded(day * 13 + i * 3) * SAMPLE_TITLES.length);
      const allDay = seeded(day * 5 + i) > 0.85;
      const hour = 8 + Math.floor(seeded(day * 11 + i) * 11); // 8am–6pm
      events.push({
        id: `mock-${day}-${i}`,
        title: SAMPLE_TITLES[titleIdx],
        start: allDay ? dateOnly(now, day) : iso(now, day, hour),
        end: allDay ? dateOnly(now, day + 1) : iso(now, day, hour + 1),
        allDay,
        calendarId: person.calendarId,
        color: person.color,
        memberName: person.name,
      });
    }
  }

  return events.filter((ev) => {
    const s = new Date(ev.start).getTime();
    const e = new Date(ev.end).getTime();
    return s < end.getTime() && e > start.getTime();
  });
}
