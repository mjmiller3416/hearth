"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, Users, X } from "lucide-react";
import type { CalendarEvent, Member } from "@/lib/calendar/types";
import { colorVar, textOn, EVERYONE_COLOR } from "@/lib/calendar/palette";
import {
  addDaysToParts,
  buildBody,
  dateLabel,
  defaultDraft,
  reconcile,
  stepHour,
  stepMinute,
  timeLabel,
  type DateParts,
  type EventDraft,
  type ReminderChoice,
  type RepeatChoice,
  type RepeatEndMode,
  type TimeParts,
} from "@/lib/calendar/form";

// The Add Event panel (Phase 1.5 #9–#20). Slides in from the right over the
// grid, ordered to match the Skylight interface the household already knows:
// Title, All-day, Start, End, Repeats, Countdown, Reminder, Assign.
//
// There is no calendar picker: assignment decides where copies are written.
// "Assign" defaults to a Family chip (everyone); tapping individuals narrows it
// to just them, and clearing everyone falls back to Family.
//
// Every control is sized for a hand reaching up to a wall (spec §6.1); date and
// time use compact steppers, not scroll wheels (Phase 1.5 #18). The RRULE is
// built server-side from these choices (Phase 1.5 #13); this only collects them.
//
// On submit the button disables, we POST, and on success hand the created event
// up so it lands in local state immediately (Phase 1.5 #19). On failure the
// panel stays open with every field intact and shows the server's message
// inline (Phase 1.5 #20) — typed input is never discarded on error.

const REPEAT_OPTIONS: { v: RepeatChoice; l: string }[] = [
  { v: "none", l: "Doesn't repeat" },
  { v: "daily", l: "Daily" },
  { v: "weekly", l: "Weekly" },
  { v: "monthly", l: "Monthly" },
  { v: "yearly", l: "Yearly" },
];

const REPEAT_END_OPTIONS: { v: RepeatEndMode; l: string }[] = [
  { v: "never", l: "Forever" },
  { v: "count", l: "After…" },
  { v: "until", l: "Until…" },
];

const REMINDER_OPTIONS: { v: ReminderChoice; l: string }[] = [
  { v: "none", l: "None" },
  { v: "at", l: "At time" },
  { v: "10", l: "10 min" },
  { v: "30", l: "30 min" },
  { v: "60", l: "1 hour" },
  { v: "1440", l: "1 day" },
];

// ── Small controls ───────────────────────────────────────────────────────────
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-label font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="text-stamp text-ink-faint">{hint}</span>}
    </div>
  );
}

function RoundButton({
  onClick,
  label,
  children,
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ground text-ink transition-colors hover:bg-ground-2 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function StepperPair({
  label,
  onDec,
  onInc,
}: {
  label: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-stamp text-ink-faint">{label}</span>
      <div className="flex items-center gap-1.5">
        <RoundButton onClick={onDec} label={`${label} down`}>
          <Minus className="size-6" strokeWidth={2.5} aria-hidden />
        </RoundButton>
        <RoundButton onClick={onInc} label={`${label} up`}>
          <Plus className="size-6" strokeWidth={2.5} aria-hidden />
        </RoundButton>
      </div>
    </div>
  );
}

function DateStepper({
  value,
  onChange,
}: {
  value: DateParts;
  onChange: (v: DateParts) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <RoundButton onClick={() => onChange(addDaysToParts(value, -1))} label="Previous day">
        <ChevronLeft className="size-6" strokeWidth={2.5} aria-hidden />
      </RoundButton>
      <span className="min-w-[10rem] flex-1 text-center text-body text-ink">
        {dateLabel(value)}
      </span>
      <RoundButton onClick={() => onChange(addDaysToParts(value, 1))} label="Next day">
        <ChevronRight className="size-6" strokeWidth={2.5} aria-hidden />
      </RoundButton>
    </div>
  );
}

function TimeStepper({
  value,
  onChange,
}: {
  value: TimeParts;
  onChange: (v: TimeParts) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="w-28 text-body tabular-nums text-ink">{timeLabel(value)}</span>
      <div className="flex items-center gap-4">
        <StepperPair
          label="Hour"
          onDec={() => onChange(stepHour(value, -1))}
          onInc={() => onChange(stepHour(value, 1))}
        />
        <StepperPair
          label="Min"
          onDec={() => onChange(stepMinute(value, -1))}
          onInc={() => onChange(stepMinute(value, 1))}
        />
      </div>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`flex h-9 w-16 items-center rounded-full p-1 transition-colors ${
        on ? "bg-ink" : "bg-hairline-strong"
      }`}
    >
      <span
        className={`size-7 rounded-full bg-surface transition-transform ${
          on ? "translate-x-7" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { v: T; l: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.v)}
            className={`rounded-full px-5 py-2.5 text-label font-medium transition-colors ${
              active
                ? "bg-ink text-surface"
                : "bg-ground text-ink-soft hover:bg-ground-2"
            }`}
          >
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
export function AddEventPanel({
  initialDate,
  now,
  members,
  onClose,
  onCreated,
}: {
  initialDate: Date;
  now: Date;
  members: Member[];
  onClose: () => void;
  onCreated: (event: CalendarEvent) => void;
}) {
  const [draft, setDraft] = useState<EventDraft>(() =>
    defaultDraft(initialDate, now),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => setShown(true), []);

  // Escape closes — harmless on a touch wall, helpful during development.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = (p: Partial<EventDraft>) => setDraft((d) => reconcile({ ...d, ...p }));

  const toggleMember = (key: string) =>
    setDraft((d) =>
      reconcile({
        ...d,
        memberKeys: d.memberKeys.includes(key)
          ? d.memberKeys.filter((k) => k !== key)
          : [...d.memberKeys, key],
      }),
    );

  const setRepeat = (v: RepeatChoice) =>
    // Selecting a repeat clears countdown (they are mutually exclusive, D10).
    patch({ repeat: v, countdown: v === "none" ? draft.countdown : false });

  const repeatsOn = draft.repeat !== "none";

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildBody(draft, members.map((m) => m.key))),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Couldn't create the event.");
        setSubmitting(false); // keep the panel open, fields intact
        return;
      }
      // Merge the event onto the wall immediately either way.
      onCreated(json.event as CalendarEvent);

      const failures: { memberKey: string }[] = Array.isArray(json.failures)
        ? json.failures
        : [];
      if (failures.length > 0) {
        // Created, but some people's calendars aren't shared with Hearth yet —
        // keep the panel open so the note is seen. The wall still shows the event.
        const names = failures
          .map((f) => members.find((m) => m.key === f.memberKey)?.name ?? f.memberKey)
          .join(", ");
        setError(`Added, but ${names} can't see it yet — share their calendar with Hearth.`);
        setSubmitting(false);
        return;
      }
      onClose();
    } catch {
      setError("Couldn't reach the server. Try again.");
      setSubmitting(false);
    }
  }

  const canSubmit = !submitting && draft.title.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      {/* Dim scrim. Deliberately not tap-to-close: a stray tap on a wall must not
          discard an in-progress event. Close with the X or Cancel. */}
      <div className="absolute inset-0 bg-ink/25" aria-hidden />

      <div
        className={`relative flex h-full w-[34rem] max-w-full flex-col bg-surface shadow-[-20px_0_60px_-20px_rgba(43,38,32,0.45)] transition-transform duration-200 ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Add event"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline px-8 py-5">
          <h2 className="font-display text-display text-ink">New event</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-12 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ground-2"
          >
            <X className="size-8" strokeWidth={2} aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-8 py-6">
          <Field label="Title">
            <input
              type="text"
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="What's happening?"
              className="w-full rounded-xl bg-ground px-4 py-3 text-body text-ink outline-none placeholder:text-ink-faint focus:bg-ground-2"
            />
          </Field>

          <div className="flex items-center justify-between">
            <span className="text-label font-medium text-ink-soft">All-day</span>
            <Toggle
              on={draft.allDay}
              onChange={(on) => patch({ allDay: on })}
              label="All-day event"
            />
          </div>

          <Field label="Starts">
            <div className="flex flex-col gap-3">
              <DateStepper
                value={draft.startDate}
                onChange={(v) => patch({ startDate: v })}
              />
              {!draft.allDay && (
                <TimeStepper
                  value={draft.startTime}
                  onChange={(v) => patch({ startTime: v })}
                />
              )}
            </div>
          </Field>

          <Field label="Ends">
            <div className="flex flex-col gap-3">
              <DateStepper
                value={draft.endDate}
                onChange={(v) => patch({ endDate: v })}
              />
              {!draft.allDay && (
                <TimeStepper
                  value={draft.endTime}
                  onChange={(v) => patch({ endTime: v })}
                />
              )}
            </div>
          </Field>

          <Field label="Repeats">
            <Segmented options={REPEAT_OPTIONS} value={draft.repeat} onChange={setRepeat} />
            {repeatsOn && (
              <div className="mt-3 flex flex-col gap-3 rounded-xl bg-ground px-4 py-4">
                <Segmented
                  options={REPEAT_END_OPTIONS}
                  value={draft.repeatEndMode}
                  onChange={(v) => patch({ repeatEndMode: v })}
                />
                {draft.repeatEndMode === "count" && (
                  <div className="flex items-center justify-between">
                    <span className="text-body text-ink">
                      {draft.repeatCount} times
                    </span>
                    <StepperPair
                      label="Times"
                      onDec={() =>
                        patch({ repeatCount: Math.max(1, draft.repeatCount - 1) })
                      }
                      onInc={() => patch({ repeatCount: draft.repeatCount + 1 })}
                    />
                  </div>
                )}
                {draft.repeatEndMode === "until" && (
                  <DateStepper
                    value={draft.repeatUntil}
                    onChange={(v) => patch({ repeatUntil: v })}
                  />
                )}
              </div>
            )}
          </Field>

          <div className="flex items-center justify-between">
            <span className="text-label font-medium text-ink-soft">Countdown</span>
            <Toggle
              on={draft.countdown}
              onChange={(on) => patch({ countdown: on })}
              label="Show a countdown"
            />
          </div>
          {repeatsOn && (
            <p className="-mt-4 text-stamp text-ink-faint">
              Countdown is off for repeating events — it would count to the next
              occurrence, which is a different thing.
            </p>
          )}

          <Field label="Reminder">
            <Segmented
              options={REMINDER_OPTIONS}
              value={draft.reminder}
              onChange={(v) => patch({ reminder: v })}
            />
          </Field>

          <Field
            label="Assign"
            hint="Family covers everyone. Tap people to make it about just them."
          >
            <div className="flex flex-wrap gap-3">
              {/* Family = everyone, and the default (selected when no individual
                  is chosen). Tapping a person clears it; clearing everyone
                  restores it — so an event is never assigned to no one. */}
              <button
                type="button"
                aria-pressed={draft.memberKeys.length === 0}
                aria-label="Family"
                onClick={() => patch({ memberKeys: [] })}
                className="flex flex-col items-center gap-1.5"
              >
                <span
                  className={`flex size-14 items-center justify-center rounded-full text-white transition-all ${
                    draft.memberKeys.length === 0
                      ? "ring-4 ring-ink ring-offset-2 ring-offset-surface"
                      : "opacity-55"
                  }`}
                  style={{ backgroundColor: `var(${colorVar(EVERYONE_COLOR)})` }}
                >
                  <Users className="size-7" strokeWidth={2.5} aria-hidden />
                </span>
                <span className="text-stamp text-ink-soft">Family</span>
              </button>
              {members.map((m) => {
                const selected = draft.memberKeys.includes(m.key);
                const initials = m.name.slice(0, 1).toUpperCase();
                const dark = textOn(m.color) === "dark";
                return (
                  <button
                    key={m.key}
                    type="button"
                    aria-pressed={selected}
                    aria-label={m.name}
                    onClick={() => toggleMember(m.key)}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span
                      className={`flex size-14 items-center justify-center rounded-full font-display text-title transition-all ${
                        dark ? "text-ink" : "text-white"
                      } ${
                        selected
                          ? "ring-4 ring-ink ring-offset-2 ring-offset-surface"
                          : "opacity-55"
                      }`}
                      style={{ backgroundColor: `var(${colorVar(m.color)})` }}
                    >
                      {initials}
                    </span>
                    <span className="text-stamp text-ink-soft">{m.name}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        {/* Footer */}
        <div className="border-t border-hairline px-8 py-5">
          {error && (
            <p role="alert" className="mb-3 text-body text-[var(--color-maryann)]">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-6 py-3 text-label font-medium text-ink-soft transition-colors hover:bg-ground-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-full bg-ink px-8 py-3 text-label font-semibold text-surface transition-opacity disabled:opacity-40"
            >
              {submitting ? "Adding…" : "Add event"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
