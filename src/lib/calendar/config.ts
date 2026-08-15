import type { CalendarEvent, Member, PickerCalendar } from "./types";
import { NEUTRAL_COLOR } from "./palette";

// Hearth's people-and-calendars configuration (Phase 1.5). Server-side only —
// it reads environment variables and must never be imported into a client
// component (the resolved colors it produces are baked onto each event instead;
// see `resolveEventColors`).
//
// Phase 1.5 splits the old single CALENDAR_MAP into two ideas, because members
// and calendars are no longer the same thing — there are more calendars than
// people, and a tag is not a calendar:
//
//   MEMBERS      JSON array of { key, name, color }. The canonical list of
//                people who can be tagged. `key` is a stable lowercase slug and
//                is what gets written into extendedProperties.private.hearthMembers.
//                `color` is a palette slug -> var(--color-<color>).
//
//   CALENDAR_MAP JSON map of Google calendar id -> { label, writable,
//                defaultMemberKey? }. `label` shows in the Add Event picker,
//                `writable` controls whether it appears there at all (and gates
//                the write path), `defaultMemberKey` supplies the fallback color
//                for untagged events on that calendar (the Phase 1 behavior).
//
// Both are parsed once and memoized — they only change on redeploy. Malformed
// config is an operator error: log once and degrade to empty so the wall stays
// calm (spec §6.2), never crash.

export interface CalendarConfig {
  label: string;
  writable: boolean;
  defaultMemberKey: string | null;
}

// NEUTRAL_COLOR / EVERYONE_COLOR live in ./palette (client-safe) so chips can
// use them too; resolveEventColors returns NEUTRAL_COLOR as the last resort.

// ── MEMBERS ─────────────────────────────────────────────────────────────────
let membersCache: Member[] | null = null;
let membersByKeyCache: Map<string, Member> | null = null;
let membersWarned = false;

// A zero-config fallback so local development and the mock work without any env
// set. Never reached in a real deploy, which always sets MEMBERS.
const FALLBACK_MEMBERS: Member[] = [
  { key: "maryann", name: "Maryann", color: "maryann" },
  { key: "mitchell", name: "Mitchell", color: "mitchell" },
  { key: "lincoln", name: "Lincoln", color: "lincoln" },
  { key: "ollie", name: "Ollie", color: "ollie" },
];

export function getMembers(): Member[] {
  if (membersCache) return membersCache;

  const raw = process.env.MEMBERS;
  if (!raw) {
    membersCache = FALLBACK_MEMBERS;
    return membersCache;
  }

  try {
    const parsed = JSON.parse(raw) as Array<{
      key?: string;
      name?: string;
      color?: string;
    }>;
    membersCache = parsed
      .filter((m): m is { key: string; name?: string; color?: string } =>
        Boolean(m.key),
      )
      .map((m) => ({
        key: m.key,
        name: m.name ?? m.key,
        color: m.color ?? m.key,
      }));
  } catch (err) {
    if (!membersWarned) {
      console.error("[calendar] MEMBERS is not valid JSON:", err);
      membersWarned = true;
    }
    membersCache = [];
  }
  return membersCache;
}

function membersByKey(): Map<string, Member> {
  if (!membersByKeyCache) {
    membersByKeyCache = new Map(getMembers().map((m) => [m.key, m]));
  }
  return membersByKeyCache;
}

export function getMemberByKey(key: string): Member | undefined {
  return membersByKey().get(key);
}

/** True when the key names a configured member (write-path validation). */
export function isKnownMemberKey(key: string): boolean {
  return membersByKey().has(key);
}

// ── CALENDAR_MAP ─────────────────────────────────────────────────────────────
let calendarCache: Map<string, CalendarConfig> | null = null;
let calendarWarned = false;

// Mirrors FALLBACK_MEMBERS: one writable calendar per person, ids matching the
// mock's synthetic calendar ids so the local mock exercises the whole path.
const FALLBACK_CALENDAR_MAP: Record<string, CalendarConfig> = {
  "maryann@example.com": { label: "Maryann", writable: true, defaultMemberKey: "maryann" },
  "mitchell@example.com": { label: "Mitchell", writable: true, defaultMemberKey: "mitchell" },
  "lincoln@example.com": { label: "Lincoln", writable: true, defaultMemberKey: "lincoln" },
  "ollie@example.com": { label: "Ollie", writable: true, defaultMemberKey: "ollie" },
};

export function getCalendarMap(): Map<string, CalendarConfig> {
  if (calendarCache) return calendarCache;

  const raw = process.env.CALENDAR_MAP;
  if (!raw) {
    calendarCache = new Map(Object.entries(FALLBACK_CALENDAR_MAP));
    return calendarCache;
  }

  try {
    const parsed = JSON.parse(raw) as Record<
      string,
      { label?: string; writable?: boolean; defaultMemberKey?: string }
    >;
    calendarCache = new Map(
      Object.entries(parsed).map(([id, v]) => [
        id,
        {
          label: v.label ?? id,
          writable: v.writable === true,
          defaultMemberKey: v.defaultMemberKey ?? null,
        },
      ]),
    );
  } catch (err) {
    if (!calendarWarned) {
      console.error("[calendar] CALENDAR_MAP is not valid JSON:", err);
      calendarWarned = true;
    }
    calendarCache = new Map();
  }
  return calendarCache;
}

/** Every mapped calendar id — Hearth reads all of them (writable or not). */
export function getReadCalendarIds(): string[] {
  return [...getCalendarMap().keys()];
}

export function getCalendarConfig(id: string): CalendarConfig | undefined {
  return getCalendarMap().get(id);
}

/**
 * True only when the calendar is present in CALENDAR_MAP AND marked writable.
 * The write path validates against this so a crafted request cannot write to an
 * arbitrary calendar the household account merely happens to have access to
 * (Phase 1.5, locked decision: target calendar is allowlisted).
 */
export function isWritableCalendar(id: string): boolean {
  return getCalendarConfig(id)?.writable === true;
}

/** Writable calendars for the Add Event picker, in config order, by label. */
export function getWritableCalendars(): PickerCalendar[] {
  return [...getCalendarMap().entries()]
    .filter(([, c]) => c.writable)
    .map(([id, c]) => ({ id, label: c.label }));
}

/** True when at least one calendar is mapped. */
export function hasCalendars(): boolean {
  return getCalendarMap().size > 0;
}

// ── Color resolution ─────────────────────────────────────────────────────────
/**
 * The ordered band colors for an event (Phase 1.5 #3):
 *   1. the tagged members' colors, when the event carries tags;
 *   2. otherwise a single-element array from the owning calendar's
 *      `defaultMemberKey` — exactly the Phase 1 behavior, so every existing
 *      event keeps its color with no backfill;
 *   3. otherwise a neutral.
 *
 * Returns the RAW list (may exceed three). The chip caps at three bands and
 * renders four-or-more as the single "everyone" treatment. Runs server-side
 * during normalization; the result is baked onto `event.colors`.
 */
export function resolveEventColors(
  event: Pick<CalendarEvent, "memberKeys" | "defaultMemberKey">,
): string[] {
  if (event.memberKeys.length > 0) {
    const colors = event.memberKeys
      .map((key) => getMemberByKey(key)?.color)
      .filter((c): c is string => Boolean(c));
    if (colors.length > 0) return colors;
  }
  if (event.defaultMemberKey) {
    const color = getMemberByKey(event.defaultMemberKey)?.color;
    if (color) return [color];
  }
  return [NEUTRAL_COLOR];
}
