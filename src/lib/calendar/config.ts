import type { CalendarEvent, Member } from "./types";
import { NEUTRAL_COLOR } from "./palette";

// Hearth's people-and-calendars configuration (Phase 1.5, reworked for
// per-person calendars). Server-side only — it reads environment variables and
// must never be imported into a client component (the resolved colors it
// produces are baked onto each event instead; see `resolveEventColors`).
//
// The model: each MEMBER owns a Google calendar (their own). Assigning a member
// to an event routes a color-tagged copy onto their calendar (the write path);
// the wall reads every member calendar plus the shared FAMILY calendar and
// de-dupes the copies back into one banded chip. There is no longer a
// "which calendar" picker — "where it lives" is derived from "who it concerns".
//
//   MEMBERS            JSON array of { key, name, color, calendarId?, googleColorId? }.
//                      The canonical, ORDERED list of taggable people. `key` is a
//                      stable slug written into hearthMembers; `color` is a palette
//                      slug -> var(--color-<color>); `calendarId` is the member's
//                      own Google calendar (their assigned-event write target);
//                      `googleColorId` optionally overrides the Google per-event
//                      color used on their copies.
//
//   FAMILY_CALENDAR_ID A single shared Google calendar id, READ (never written) so
//                      events added there directly from a phone still appear on the
//                      wall. Untagged, so it renders neutral.
//
// Both are parsed once and memoized — they only change on redeploy. Malformed
// config is an operator error: log once and degrade to empty so the wall stays
// calm (spec §6.2), never crash.

// ── Google per-event colors ──────────────────────────────────────────────────
// A Google event carries one colorId (1–11); it is a property of the event
// RESOURCE, so the calendar's owner sees it. Each member's copy is written with
// their color, so an assigned event shows in their color on their own phone.
// These four are the most distinct hues matching the member palette; unknown
// slugs fall back to Graphite. (See globals.css for the wall-side hex values.)
const COLOR_ID_BY_SLUG: Record<string, string> = {
  mitchell: "10", // Basil (green)
  maryann: "11", // Tomato (red)
  lincoln: "9", // Blueberry (blue)
  ollie: "5", // Banana (amber)
};
const FALLBACK_COLOR_ID = "8"; // Graphite

// ── MEMBERS ─────────────────────────────────────────────────────────────────
let membersCache: Member[] | null = null;
let membersByKeyCache: Map<string, Member> | null = null;
let membersWarned = false;
let dupCalendarWarned = false;

// A zero-config fallback so local development and the mock work without any env
// set. Never reached in a real deploy, which always sets MEMBERS. The calendar
// ids mirror the mock's synthetic ids so the local mock exercises the fan-out.
const FALLBACK_MEMBERS: Member[] = [
  { key: "maryann", name: "Maryann", color: "maryann", calendarId: "maryann@example.com" },
  { key: "mitchell", name: "Mitchell", color: "mitchell", calendarId: "mitchell@example.com" },
  { key: "lincoln", name: "Lincoln", color: "lincoln", calendarId: "lincoln@example.com" },
  { key: "ollie", name: "Ollie", color: "ollie", calendarId: "ollie@example.com" },
];

// Local-only shared-calendar fallback (used when MEMBERS is unset, i.e. dev/mock).
const FALLBACK_FAMILY_CALENDAR_ID = "family@example.com";

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
      calendarId?: string;
      googleColorId?: string;
    }>;
    membersCache = parsed
      .filter((m): m is {
        key: string;
        name?: string;
        color?: string;
        calendarId?: string;
        googleColorId?: string;
      } => Boolean(m.key))
      .map((m) => ({
        key: m.key,
        name: m.name ?? m.key,
        color: m.color ?? m.key,
        calendarId: m.calendarId,
        googleColorId: m.googleColorId,
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

// ── Calendars (read set) ──────────────────────────────────────────────────────
// The wall reads every member's own calendar plus the shared family calendar.
// "Where it lives" is derived from members now; there is no separate CALENDAR_MAP.
let readIdsCache: string[] | null = null;
let memberKeyByCalendarCache: Map<string, string> | null = null;

/** The shared, read-only family calendar id (or null when unconfigured). */
export function getFamilyCalendarId(): string | null {
  const raw = process.env.FAMILY_CALENDAR_ID?.trim();
  if (raw) return raw;
  // Only fall back locally (no MEMBERS env means dev/mock), never in a real deploy.
  if (!process.env.MEMBERS) return FALLBACK_FAMILY_CALENDAR_ID;
  return null;
}

/** Every calendar Hearth reads: each member's calendar plus the family calendar. */
export function getReadCalendarIds(): string[] {
  if (readIdsCache) return readIdsCache;
  const ids = new Set<string>();
  for (const m of getMembers()) {
    if (m.calendarId) ids.add(m.calendarId);
  }
  const family = getFamilyCalendarId();
  if (family) ids.add(family);
  readIdsCache = [...ids];
  return readIdsCache;
}

function memberKeyByCalendar(): Map<string, string> {
  if (memberKeyByCalendarCache) return memberKeyByCalendarCache;
  const map = new Map<string, string>();
  for (const m of getMembers()) {
    if (!m.calendarId) continue;
    if (map.has(m.calendarId)) {
      if (!dupCalendarWarned) {
        console.error(
          `[calendar] two members share calendarId ${m.calendarId}; copies will collide`,
        );
        dupCalendarWarned = true;
      }
      continue; // first member wins as the color source
    }
    map.set(m.calendarId, m.key);
  }
  memberKeyByCalendarCache = map;
  return map;
}

/**
 * The member key that owns a calendar — the fallback color source for an
 * untagged event on it. Null for the family calendar (renders neutral).
 */
export function getDefaultMemberKey(calendarId: string): string | null {
  return memberKeyByCalendar().get(calendarId) ?? null;
}

/** True when at least one calendar is configured to read. */
export function hasReadCalendars(): boolean {
  return getReadCalendarIds().length > 0;
}

// ── Write targets (fan-out) ───────────────────────────────────────────────────
/**
 * Reduce arbitrary member keys to the canonical MEMBERS order, de-duplicated,
 * with unknown keys dropped. Guarantees a stable band order across every copy of
 * an event regardless of the order the user tapped the Assign chips.
 */
export function canonicalizeMemberKeys(keys: string[]): string[] {
  const wanted = new Set(keys);
  return getMembers()
    .map((m) => m.key)
    .filter((k) => wanted.has(k));
}

export interface MemberCalendarTarget {
  memberKey: string;
  calendarId: string;
  colorId: string;
}

/** The Google per-event colorId for a member's copies. */
export function memberColorId(member: Member): string {
  return member.googleColorId ?? COLOR_ID_BY_SLUG[member.color] ?? FALLBACK_COLOR_ID;
}

/**
 * The fan-out targets for a set of assigned members: each member that has a
 * configured calendar, in canonical order, with their write calendar and color.
 * Members without a `calendarId` are omitted — the caller reports them as a
 * per-member failure rather than failing the whole create.
 */
export function getMemberCalendarTargets(keys: string[]): MemberCalendarTarget[] {
  const byKey = membersByKey();
  const targets: MemberCalendarTarget[] = [];
  for (const key of canonicalizeMemberKeys(keys)) {
    const m = byKey.get(key);
    if (!m?.calendarId) continue;
    targets.push({ memberKey: m.key, calendarId: m.calendarId, colorId: memberColorId(m) });
  }
  return targets;
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
