import type { CalendarEvent } from "@/lib/calendar/types";
import {
  getMembers,
  getCalendarMap,
  resolveEventColors,
} from "@/lib/calendar/config";

// Synthetic events for LOCAL development only. Building the full month grid,
// overflow panel, filters, week view, color bands, and the countdown strip is
// impossible to verify without event data, and the real Google setup (dedicated
// account, OAuth consent, refresh token) is manual operator work that can't run
// in a build sandbox. This lets the rendering be exercised end-to-end against
// realistic shapes — including Phase 1.5 tags and countdowns.
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
 * Deterministic sample events across the given range, using the configured
 * MEMBERS and CALENDAR_MAP (both fall back to the four family members when unset
 * locally, so the mock works with zero configuration). Produces a realistic mix:
 * mostly untagged (owner color), some tagged one-to-three ways (bands), an
 * occasional four-member "everyone", and a couple of future countdown events.
 */
export function getMockEvents(start: Date, end: Date): CalendarEvent[] {
  const members = getMembers();
  const calendars = [...getCalendarMap().entries()].map(([id, cfg]) => ({
    id,
    defaultMemberKey: cfg.defaultMemberKey,
  }));
  if (calendars.length === 0) return [];

  const now = new Date();
  const events: CalendarEvent[] = [];

  const push = (
    id: string,
    calId: string,
    defaultMemberKey: string | null,
    title: string,
    startStr: string,
    endStr: string,
    allDay: boolean,
    memberKeys: string[],
    countdown: boolean,
  ) => {
    events.push({
      id,
      title,
      start: startStr,
      end: endStr,
      allDay,
      calendarId: calId,
      memberKeys,
      countdown,
      defaultMemberKey,
      colors: resolveEventColors({ memberKeys, defaultMemberKey }),
    });
  };

  // Scatter events across roughly two months around today.
  for (let day = -20; day <= 40; day++) {
    const count = Math.floor(seeded(day + 100) * 5); // 0–4 events; exercises "+N more"
    for (let i = 0; i < count; i++) {
      const cal = calendars[Math.floor(seeded(day * 7 + i) * calendars.length)];
      const titleIdx = Math.floor(seeded(day * 13 + i * 3) * SAMPLE_TITLES.length);
      const allDay = seeded(day * 5 + i) > 0.85;
      const hour = 8 + Math.floor(seeded(day * 11 + i) * 11); // 8am–6pm

      // Tagging: ~55% untagged (owner color), the rest tagged 1–4 ways to
      // exercise solid / band / everyone rendering.
      const tagRoll = seeded(day * 17 + i * 5);
      let memberKeys: string[] = [];
      if (tagRoll > 0.9 && members.length >= 4) {
        memberKeys = members.slice(0, 4).map((m) => m.key); // "everyone"
      } else if (tagRoll > 0.75 && members.length >= 3) {
        memberKeys = members.slice(0, 3).map((m) => m.key); // three bands
      } else if (tagRoll > 0.55 && members.length >= 2) {
        const a = Math.floor(seeded(day * 3 + i) * members.length);
        const b = (a + 1) % members.length;
        memberKeys = [members[a].key, members[b].key]; // two bands
      }

      push(
        `mock-${day}-${i}`,
        cal.id,
        cal.defaultMemberKey,
        SAMPLE_TITLES[titleIdx],
        allDay ? dateOnly(now, day) : iso(now, day, hour),
        allDay ? dateOnly(now, day + 1) : iso(now, day, hour + 1),
        allDay,
        memberKeys,
        false,
      );
    }
  }

  // A couple of countdown events in the future, so the badge and the strip
  // above the grid have something to show.
  const firstMember = members[0]?.key;
  push(
    "mock-countdown-1",
    calendars[0].id,
    calendars[0].defaultMemberKey,
    "Disney trip",
    dateOnly(now, 12),
    dateOnly(now, 13),
    true,
    firstMember ? [firstMember] : [],
    true,
  );
  push(
    "mock-countdown-2",
    calendars[Math.min(1, calendars.length - 1)].id,
    calendars[Math.min(1, calendars.length - 1)].defaultMemberKey,
    "Last day of school",
    dateOnly(now, 26),
    dateOnly(now, 27),
    true,
    [],
    true,
  );

  return events.filter((ev) => {
    const s = new Date(ev.start).getTime();
    const e = new Date(ev.end).getTime();
    return s < end.getTime() && e > start.getTime();
  });
}
