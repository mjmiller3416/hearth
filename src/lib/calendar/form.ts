// Client-safe helpers for the Add Event form (Phase 1.5). Pure date/time and
// payload shaping — no env, no server imports. The RRULE itself is still built
// server-side (Phase 1.5 #13); this only assembles the structured choices the
// server needs.

import type {
  CalendarEvent,
  CreateEventBody,
  EditEventBody,
  RepeatFreq,
  RepeatRule,
} from "./types";
import { parseBoundary, zonedFields } from "./dates";

export interface DateParts {
  y: number;
  m: number; // 1-based
  d: number;
}
export interface TimeParts {
  h: number; // 0–23
  min: number; // 0–59
}

export type RepeatChoice = "none" | RepeatFreq;
export type RepeatEndMode = "never" | "count" | "until";
export type ReminderChoice = "none" | "at" | "10" | "30" | "60" | "1440";

export interface EventDraft {
  title: string;
  allDay: boolean;
  startDate: DateParts;
  startTime: TimeParts;
  endDate: DateParts;
  endTime: TimeParts;
  repeat: RepeatChoice;
  repeatEndMode: RepeatEndMode;
  repeatCount: number;
  repeatUntil: DateParts;
  countdown: boolean;
  reminder: ReminderChoice;
  /** Assigned members. Empty means "Family" — expanded to all members on submit. */
  memberKeys: string[];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function dateStr(p: DateParts): string {
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

export function dateTimeStr(d: DateParts, t: TimeParts): string {
  return `${dateStr(d)}T${pad2(t.h)}:${pad2(t.min)}`;
}

export function partsFromDate(d: Date): DateParts {
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

/** Shift a DateParts by whole days, normalizing via a real Date. */
export function addDaysToParts(p: DateParts, n: number): DateParts {
  const d = new Date(p.y, p.m - 1, p.d + n);
  return partsFromDate(d);
}

export function toDate(p: DateParts): Date {
  return new Date(p.y, p.m - 1, p.d);
}

// ── Labels ────────────────────────────────────────────────────────────────
export function dateLabel(p: DateParts): string {
  return toDate(p).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function timeLabel(t: TimeParts): string {
  let h = t.h % 12;
  if (h === 0) h = 12;
  const suffix = t.h < 12 ? "AM" : "PM";
  return `${h}:${pad2(t.min)} ${suffix}`;
}

// ── Stepping ────────────────────────────────────────────────────────────────
export function stepHour(t: TimeParts, dir: number): TimeParts {
  return { ...t, h: (t.h + dir + 24) % 24 };
}

// 15-minute increments — a compact stepper beats a scroll wheel at wall distance.
export function stepMinute(t: TimeParts, dir: number): TimeParts {
  const total = t.h * 60 + t.min + dir * 15;
  const wrapped = (total + 1440) % 1440;
  return { h: Math.floor(wrapped / 60), min: wrapped % 60 };
}

export function addOneHour(t: TimeParts): TimeParts {
  // Clamp within the same day so a single event never rolls past midnight by
  // default (the end DATE is stepped separately if the user wants that).
  if (t.h >= 23) return { h: 23, min: 59 };
  return { h: t.h + 1, min: t.min };
}

// ── Draft construction & invariants ─────────────────────────────────────────
/**
 * A sensible new-event draft (Phase 1.5 #12): the tapped day, defaulting to the
 * next upcoming hour when that day is today, running one hour. Nobody should
 * have to set four fields to log a 3pm appointment.
 */
export function defaultDraft(day: Date, now: Date): EventDraft {
  const startDate = partsFromDate(day);
  const isToday =
    day.getFullYear() === now.getFullYear() &&
    day.getMonth() === now.getMonth() &&
    day.getDate() === now.getDate();
  const startTime: TimeParts = isToday
    ? { h: Math.min(now.getHours() + 1, 23), min: 0 }
    : { h: 9, min: 0 };
  const endTime = addOneHour(startTime);

  return {
    title: "",
    allDay: false,
    startDate,
    startTime,
    endDate: startDate,
    endTime,
    repeat: "none",
    repeatEndMode: "never",
    repeatCount: 10,
    repeatUntil: addDaysToParts(startDate, 30),
    countdown: false,
    reminder: "none",
    memberKeys: [], // empty === "Family" (default)
  };
}

/**
 * Keep end ≥ start after any edit. All-day end is inclusive (may equal start);
 * timed end must sit strictly after start, so a backward edit snaps it to
 * start + 1 hour. Called after every field change so the form is always valid.
 */
export function reconcile(draft: EventDraft): EventDraft {
  if (draft.allDay) {
    if (dateStr(draft.endDate) < dateStr(draft.startDate)) {
      return { ...draft, endDate: draft.startDate };
    }
    return draft;
  }
  const start = dateTimeStr(draft.startDate, draft.startTime);
  const end = dateTimeStr(draft.endDate, draft.endTime);
  if (end <= start) {
    return {
      ...draft,
      endDate: draft.startDate,
      endTime: addOneHour(draft.startTime),
    };
  }
  return draft;
}

const REMINDER_MINUTES: Record<ReminderChoice, number | null> = {
  none: null,
  at: 0,
  "10": 10,
  "30": 30,
  "60": 60,
  "1440": 1440,
};

function buildRepeat(draft: EventDraft): RepeatRule | null {
  if (draft.repeat === "none") return null;
  const freq = draft.repeat;
  if (draft.repeatEndMode === "count") {
    return { freq, end: { mode: "count", count: draft.repeatCount } };
  }
  if (draft.repeatEndMode === "until") {
    return { freq, end: { mode: "until", until: dateStr(draft.repeatUntil) } };
  }
  return { freq, end: { mode: "never" } };
}

/**
 * Shape the draft into the POST body the server expects. An empty `memberKeys`
 * means "Family" and expands to every member (`allMemberKeys`); the server
 * re-canonicalizes, so tap order here doesn't matter.
 */
export function buildBody(
  draft: EventDraft,
  allMemberKeys: string[],
): CreateEventBody {
  return {
    title: draft.title.trim(),
    allDay: draft.allDay,
    start: draft.allDay
      ? dateStr(draft.startDate)
      : dateTimeStr(draft.startDate, draft.startTime),
    end: draft.allDay
      ? dateStr(draft.endDate)
      : dateTimeStr(draft.endDate, draft.endTime),
    memberKeys: draft.memberKeys.length ? draft.memberKeys : allMemberKeys,
    // Countdown and repeat are mutually exclusive; the UI enforces it, and this
    // guards the payload regardless of stale state.
    repeat: draft.countdown ? null : buildRepeat(draft),
    countdown: draft.countdown,
    reminderMinutes: REMINDER_MINUTES[draft.reminder],
  };
}

// ── Editing ───────────────────────────────────────────────────────────────────

/**
 * Seed a draft from an existing event, for the edit panel. Repeat/reminder are
 * not editable from the wall so they default to "none". Assignment is prefilled
 * from the event's tags (or its owning member for an untagged personal event),
 * collapsing to the Family chip (`memberKeys: []`) when it's the whole household.
 */
export function draftFromEvent(
  event: CalendarEvent,
  allMemberKeys: string[],
  tz?: string,
): EventDraft {
  let startDate: DateParts;
  let startTime: TimeParts;
  let endDate: DateParts;
  let endTime: TimeParts;

  if (event.allDay) {
    // Date-only, floating: read the calendar day directly, never zoned.
    startDate = partsFromDate(parseBoundary(event.start));
    startTime = { h: 9, min: 0 }; // unused for all-day
    // Google's all-day end is EXCLUSIVE; the form's endDate is inclusive.
    endDate = addDaysToParts(partsFromDate(parseBoundary(event.end)), -1);
    endTime = addOneHour(startTime);
  } else {
    // Timed: seed the steppers with the HOUSEHOLD wall clock (Phase 2 #4), so the
    // pre-filled time matches what the wall shows and a save round-trips exactly —
    // even if the device's own timezone is set wrong.
    const sf = zonedFields(parseBoundary(event.start), tz);
    startDate = { y: sf.y, m: sf.m, d: sf.d };
    startTime = { h: sf.h, min: sf.mi };
    const ef = zonedFields(parseBoundary(event.end), tz);
    endDate = { y: ef.y, m: ef.m, d: ef.d };
    endTime = { h: ef.h, min: ef.mi };
  }

  const isWholeFamily =
    allMemberKeys.length > 0 &&
    event.memberKeys.length === allMemberKeys.length &&
    allMemberKeys.every((k) => event.memberKeys.includes(k));
  let memberKeys: string[];
  if (isWholeFamily) memberKeys = []; // Family chip
  else if (event.memberKeys.length > 0) memberKeys = event.memberKeys;
  else if (event.defaultMemberKey) memberKeys = [event.defaultMemberKey]; // owner
  else memberKeys = []; // untagged family-calendar event → Family

  return {
    title: event.title,
    allDay: event.allDay,
    startDate,
    startTime,
    endDate,
    endTime,
    repeat: "none",
    repeatEndMode: "never",
    repeatCount: 10,
    repeatUntil: addDaysToParts(startDate, 30),
    countdown: event.countdown,
    reminder: "none",
    memberKeys,
  };
}

/** Shape an edited draft into the PUT body. Empty memberKeys === Family (all). */
export function buildEditBody(
  draft: EventDraft,
  allMemberKeys: string[],
  target: EditEventBody["target"],
): EditEventBody {
  return {
    title: draft.title.trim(),
    allDay: draft.allDay,
    start: draft.allDay
      ? dateStr(draft.startDate)
      : dateTimeStr(draft.startDate, draft.startTime),
    end: draft.allDay
      ? dateStr(draft.endDate)
      : dateTimeStr(draft.endDate, draft.endTime),
    memberKeys: draft.memberKeys.length ? draft.memberKeys : allMemberKeys,
    countdown: draft.countdown,
    target,
  };
}
