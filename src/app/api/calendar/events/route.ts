import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth";
import { isKnownMemberKey, isWritableCalendar } from "@/lib/calendar/config";
import { buildRecurrence, resolveTimeZone } from "@/lib/calendar/recurrence";
import {
  insertEvent,
  CalendarWriteError,
  type GoogleEventInput,
} from "@/lib/google/calendar";
import type { CreateEventBody, RepeatRule } from "@/lib/calendar/types";

// POST /api/calendar/events — create ONE event (Phase 1.5 #6, #7, #8).
//
// Create only: Hearth never edits or deletes (spec D2 amended — corrections
// happen on a phone). Google Calendar remains the system of record; this writes
// to it and returns the created event normalized through the exact read path, so
// the client receives a shape identical to a polled event.
//
// SECURITY: this is the device token's first WRITE surface. `requireDevice()` is
// the FIRST statement, before any body parsing (Phase 0.1 model). The target
// calendar is allowlisted against CALENDAR_MAP `writable:true` — a crafted
// request must not be able to write to an arbitrary calendar the household
// account merely has access to.
export const dynamic = "force-dynamic";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const ALLOWED_REMINDERS = new Set([0, 10, 30, 60, 1440]);
const ALLOWED_FREQ = new Set(["daily", "weekly", "monthly", "yearly"]);

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Add one day to a "YYYY-MM-DD", returning Google's EXCLUSIVE all-day end. */
function exclusiveEnd(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Validate the repeat rule shape. Returns an error message, or null if valid. */
function validateRepeat(repeat: RepeatRule): string | null {
  if (!ALLOWED_FREQ.has(repeat.freq)) return "Unknown repeat frequency.";
  const end = repeat.end;
  if (!end || typeof end !== "object") return "Repeat end condition is required.";
  if (end.mode === "count") {
    if (!Number.isInteger(end.count) || end.count < 1) {
      return "Repeat count must be a positive whole number.";
    }
  } else if (end.mode === "until") {
    if (!DATE_ONLY.test(end.until)) return "Repeat until-date is invalid.";
  } else if (end.mode !== "never") {
    return "Unknown repeat end condition.";
  }
  return null;
}

export async function POST(req: Request) {
  const denied = await requireDevice();
  if (denied) return denied;

  let body: CreateEventBody;
  try {
    body = (await req.json()) as CreateEventBody;
  } catch {
    return bad("Request body must be JSON.");
  }

  // ── Validation (Phase 1.5 #6) — a specific message per rule ────────────────
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return bad("Give the event a title.");

  if (typeof body.calendarId !== "string" || !body.calendarId) {
    return bad("Choose a calendar.");
  }
  // Allowlist: present in CALENDAR_MAP AND writable. Rejects both an unknown
  // calendar and a known-but-read-only one (Phase 1.5 acceptance #12).
  if (!isWritableCalendar(body.calendarId)) {
    return bad("That calendar can't be written to from here.");
  }

  const allDay = body.allDay === true;
  const startOk = allDay ? DATE_ONLY.test(body.start) : DATE_TIME.test(body.start);
  const endOk = allDay ? DATE_ONLY.test(body.end) : DATE_TIME.test(body.end);
  if (!startOk || !endOk) return bad("Start and end times are invalid.");

  // All-day end is inclusive (the last covered day), so equal is fine; timed
  // events must actually span forward.
  const endAfterStart = allDay ? body.end >= body.start : body.end > body.start;
  if (!endAfterStart) return bad("The event must end after it starts.");

  const memberKeys = Array.isArray(body.memberKeys) ? body.memberKeys : [];
  for (const key of memberKeys) {
    if (typeof key !== "string" || !isKnownMemberKey(key)) {
      return bad(`Unknown member: ${String(key)}.`);
    }
  }

  const countdown = body.countdown === true;
  const repeat = body.repeat ?? null;

  // Countdown and repeat are mutually exclusive (spec D10): counting down to a
  // recurring event means counting to its next occurrence — a different feature.
  if (countdown && repeat) {
    return bad("An event can count down or repeat, but not both.");
  }
  if (repeat) {
    const repeatError = validateRepeat(repeat);
    if (repeatError) return bad(repeatError);
  }

  const reminderMinutes =
    body.reminderMinutes === null || body.reminderMinutes === undefined
      ? null
      : body.reminderMinutes;
  if (reminderMinutes !== null && !ALLOWED_REMINDERS.has(reminderMinutes)) {
    return bad("That reminder time isn't available.");
  }

  // ── Build the Google event (Phase 1.5 #7) ──────────────────────────────────
  const tz = resolveTimeZone();

  const input: GoogleEventInput = {
    summary: title,
    start: allDay
      ? { date: body.start }
      : { dateTime: `${body.start}:00`, timeZone: tz },
    end: allDay
      ? { date: exclusiveEnd(body.end) }
      : { dateTime: `${body.end}:00`, timeZone: tz },
    reminders: {
      useDefault: false,
      overrides:
        reminderMinutes === null
          ? []
          : [{ method: "popup", minutes: reminderMinutes }],
    },
    extendedProperties: {
      private: {
        hearthMembers: memberKeys.join(","),
        hearthCountdown: countdown ? "1" : "0",
      },
    },
  };

  const recurrence = buildRecurrence(repeat, allDay, tz);
  if (recurrence) input.recurrence = recurrence;

  // ── Write, and return the event normalized like a read (Phase 1.5 #8) ──────
  try {
    const event = await insertEvent(body.calendarId, input);
    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    if (err instanceof CalendarWriteError) {
      // A 403 here means the household account has only read access on a
      // calendar the operator marked writable — a sharing misconfig, not a
      // client error. Surface a calm, specific message; keep the panel open.
      console.error("[api/calendar/events] write failed:", err);
      const msg =
        err.status === 403
          ? "Hearth doesn't have permission to write to that calendar yet."
          : "Couldn't create the event. Please try again.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    console.error("[api/calendar/events] unexpected error:", err);
    return NextResponse.json({ error: "Couldn't create the event." }, { status: 502 });
  }
}
