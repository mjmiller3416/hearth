import type { CalendarEvent } from "@/lib/calendar/types";
import {
  getMembers,
  getReadCalendarIds,
  getDefaultMemberKey,
  getFamilyCalendarId,
  resolveEventColorsFor,
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
 * MEMBERS + FAMILY_CALENDAR_ID (both fall back locally, so the mock works with
 * zero config). Produces the RAW per-calendar shapes the real feed would, so
 * `getEvents` -> `presentEvents` exercises the actual filter + de-dup:
 *   - Hearth coordinated events, FANNED OUT (one copy per assigned member's
 *     calendar, sharing a hearthGroupId) — these collapse to one banded chip;
 *     1–4 members exercise solid / band / everyone rendering.
 *   - Family-calendar events (no group) — shown neutral.
 *   - Private personal events on member calendars (no group) — FILTERED OUT.
 *   - A couple of countdown events (Hearth) for the badge and strip.
 */
export function getMockEvents(start: Date, end: Date): CalendarEvent[] {
  const members = getMembers();
  const readIds = getReadCalendarIds();
  const familyId = getFamilyCalendarId();
  const memberCalIds = members
    .map((m) => m.calendarId)
    .filter((c): c is string => Boolean(c));
  if (readIds.length === 0) return [];

  const now = new Date();
  const events: CalendarEvent[] = [];
  let groupSeq = 0;

  const push = (
    id: string,
    calId: string,
    title: string,
    startStr: string,
    endStr: string,
    allDay: boolean,
    memberKeys: string[],
    hearthGroupId: string | null,
    countdown: boolean,
  ) => {
    const defaultMemberKey = getDefaultMemberKey(calId);
    events.push({
      id,
      title,
      start: startStr,
      end: endStr,
      allDay,
      calendarId: calId,
      memberKeys,
      hearthGroupId,
      countdown,
      recurring: false,
      defaultMemberKey,
      colors: resolveEventColorsFor(memberKeys, calId, defaultMemberKey),
    });
  };

  // Fan out one Hearth event across the assigned members (a copy per calendar,
  // sharing a groupId) — exactly what the write path does.
  const pushHearth = (
    tag: string,
    title: string,
    startStr: string,
    endStr: string,
    allDay: boolean,
    memberKeys: string[],
    countdown: boolean,
  ) => {
    const groupId = `mock-group-${tag}-${groupSeq++}`;
    for (const key of memberKeys) {
      const m = members.find((mm) => mm.key === key);
      if (!m?.calendarId) continue;
      push(`${groupId}-${key}`, m.calendarId, title, startStr, endStr, allDay, memberKeys, groupId, countdown);
    }
  };

  // Scatter events across roughly two months around today.
  for (let day = -20; day <= 40; day++) {
    const count = Math.floor(seeded(day + 100) * 5); // 0–4 events; exercises "+N more"
    for (let i = 0; i < count; i++) {
      const title = SAMPLE_TITLES[Math.floor(seeded(day * 13 + i * 3) * SAMPLE_TITLES.length)];
      const allDay = seeded(day * 5 + i) > 0.85;
      const hour = 8 + Math.floor(seeded(day * 11 + i) * 11); // 8am–6pm
      const startStr = allDay ? dateOnly(now, day) : iso(now, day, hour);
      const endStr = allDay ? dateOnly(now, day + 1) : iso(now, day, hour + 1);

      const roll = seeded(day * 17 + i * 5);
      if (roll > 0.62) {
        // Hearth coordinated event, fanned out to 1–4 members.
        let n = 1;
        if (roll > 0.9 && members.length >= 4) n = 4;
        else if (roll > 0.82 && members.length >= 3) n = 3;
        else if (roll > 0.72 && members.length >= 2) n = 2;
        const startIdx = Math.floor(seeded(day * 3 + i) * members.length);
        const memberKeys = Array.from(
          { length: n },
          (_, k) => members[(startIdx + k) % members.length].key,
        );
        pushHearth(`${day}-${i}`, title, startStr, endStr, allDay, memberKeys, false);
      } else if (roll > 0.5 && familyId) {
        // Family-calendar event (no group) → shown neutral.
        push(`mock-fam-${day}-${i}`, familyId, title, startStr, endStr, allDay, [], null, false);
      } else if (memberCalIds.length > 0) {
        // Private personal event on a member calendar (no group) → filtered out.
        const calId = memberCalIds[Math.floor(seeded(day * 7 + i) * memberCalIds.length)];
        push(`mock-priv-${day}-${i}`, calId, title, startStr, endStr, allDay, [], null, false);
      }
    }
  }

  // A couple of countdown events (Hearth) so the badge and the strip have data.
  const firstKey = members[0]?.key;
  if (firstKey) {
    pushHearth("cd1", "Disney trip", dateOnly(now, 12), dateOnly(now, 13), true, [firstKey], true);
  }
  if (members.length >= 2) {
    pushHearth(
      "cd2",
      "Last day of school",
      dateOnly(now, 26),
      dateOnly(now, 27),
      true,
      [members[0].key, members[1].key],
      true,
    );
  }

  return events.filter((ev) => {
    const s = new Date(ev.start).getTime();
    const e = new Date(ev.end).getTime();
    return s < end.getTime() && e > start.getTime();
  });
}
