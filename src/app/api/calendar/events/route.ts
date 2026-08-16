import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth";
import {
  isKnownMemberKey,
  canonicalizeMemberKeys,
  getMemberCalendarTargets,
} from "@/lib/calendar/config";
import { buildRecurrence, resolveTimeZone } from "@/lib/calendar/recurrence";
import {
  insertEvent,
  deleteHearthGroup,
  dedupeHearthGroups,
  CalendarWriteError,
  type GoogleEventInput,
} from "@/lib/google/calendar";
import type { CreateEventBody, RepeatRule } from "@/lib/calendar/types";

// POST /api/calendar/events   — create an event (fan-out to assignees' calendars)
// DELETE /api/calendar/events — remove every copy of a Hearth event by group id
//
// Per-person calendars: assigning members routes one color-tagged COPY of the
// event onto each assignee's own calendar (so it shows in their color on their
// phone); the wall de-dupes the copies into one banded chip. Google Calendar
// remains the system of record. Edits still happen on a phone (spec D2), but
// Hearth now owns create AND delete of its own events so a mistake is one tap.
//
// SECURITY: this is the device token's WRITE surface. `requireDevice()` is the
// FIRST statement in every handler, before any body parsing (Phase 0.1 model).
// The client can no longer name a target calendar at all — write targets are
// derived server-side from the member config, which is strictly safer than the
// old allowlist (a crafted request cannot reach an arbitrary calendar).
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
  // Canonicalize to MEMBERS order (stable band order on every copy) and require
  // at least one assignee — the "Family" default sends all members, so an empty
  // set only happens on a crafted request.
  const keys = canonicalizeMemberKeys(memberKeys);
  if (keys.length === 0) return bad("Choose at least one person.");

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

  // ── Build the shared event body ─────────────────────────────────────────────
  const tz = resolveTimeZone();
  const hearthGroupId = crypto.randomUUID();

  const baseInput = {
    summary: title,
    start: allDay
      ? { date: body.start }
      : { dateTime: `${body.start}:00`, timeZone: tz },
    end: allDay
      ? { date: exclusiveEnd(body.end) }
      : { dateTime: `${body.end}:00`, timeZone: tz },
    reminders: {
      useDefault: false as const,
      overrides:
        reminderMinutes === null
          ? []
          : [{ method: "popup" as const, minutes: reminderMinutes }],
    },
  };
  const basePrivate: Record<string, string> = {
    hearthMembers: keys.join(","),
    hearthGroupId,
    hearthCountdown: countdown ? "1" : "0",
  };
  const recurrence = buildRecurrence(repeat, allDay, tz);

  // ── Fan out: one color-tagged copy per assignee's calendar ──────────────────
  const targets = getMemberCalendarTargets(keys);
  const targetKeys = new Set(targets.map((t) => t.memberKey));
  // Selected people with no configured calendar can't receive a copy — report
  // them rather than failing the whole create.
  const failures: { memberKey: string; reason: string }[] = keys
    .filter((k) => !targetKeys.has(k))
    .map((memberKey) => ({ memberKey, reason: "no-calendar" }));

  if (targets.length === 0) {
    return NextResponse.json(
      { error: "None of the selected people have a calendar set up yet." },
      { status: 502 },
    );
  }

  const settled = await Promise.allSettled(
    targets.map((t) => {
      // No colorId: the copy lives on the member's own calendar, so it inherits
      // that calendar's color on their phone (which the wall palette mirrors).
      const input: GoogleEventInput = {
        ...baseInput,
        extendedProperties: { private: { ...basePrivate, hearthOwner: t.memberKey } },
      };
      if (recurrence) input.recurrence = recurrence;
      return insertEvent(t.calendarId, input);
    }),
  );

  const created = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") {
      created.push(r.value);
    } else {
      const err = r.reason;
      console.error("[api/calendar/events] copy failed:", err);
      const reason =
        err instanceof CalendarWriteError && err.status === 403 ? "no-access" : "error";
      failures.push({ memberKey: targets[i].memberKey, reason });
    }
  }

  // If not a single copy landed, this reads as a failed create.
  if (created.length === 0) {
    return NextResponse.json(
      { error: "Couldn't create the event on any calendar." },
      { status: 502 },
    );
  }

  // Return the de-duped representative — the SAME code the poll runs, so the
  // optimistic chip and the polled event share an id and never double up.
  const [event] = dedupeHearthGroups(created);
  return NextResponse.json({ event, failures }, { status: 201 });
}

// DELETE /api/calendar/events  — remove every copy of a Hearth event by group id.
export async function DELETE(req: Request) {
  const denied = await requireDevice();
  if (denied) return denied;

  let body: { hearthGroupId?: unknown };
  try {
    body = (await req.json()) as { hearthGroupId?: unknown };
  } catch {
    return bad("Request body must be JSON.");
  }

  const hearthGroupId =
    typeof body.hearthGroupId === "string" ? body.hearthGroupId.trim() : "";
  if (!hearthGroupId) return bad("Missing event id.");

  try {
    const { deleted, failures } = await deleteHearthGroup(hearthGroupId);
    return NextResponse.json({ ok: failures.length === 0, deleted, failures });
  } catch (err) {
    console.error("[api/calendar/events] delete failed:", err);
    return NextResponse.json({ error: "Couldn't delete the event." }, { status: 502 });
  }
}
