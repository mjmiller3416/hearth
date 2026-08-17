"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Minus,
  Pencil,
  Plus,
  Repeat,
  Sun,
  Timer,
  Trash2,
  Type,
  Users,
  X,
} from "lucide-react";
import type { CalendarEvent, EditEventBody, Member } from "@/lib/calendar/types";
import { colorVar, EVERYONE_COLOR } from "@/lib/calendar/palette";
import { OnScreenKeyboard } from "@/components/common/OnScreenKeyboard";
import { useTextOn } from "@/components/common/ColorProvider";
import { useTimeZone } from "@/components/common/TimeZone";
import {
  addDaysToParts,
  addOneHour,
  buildBody,
  buildEditBody,
  dateLabel,
  defaultDraft,
  draftFromEvent,
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

// The Add / Edit Event panel (Phase 1.5 #9–#20, reworked Phase 2 #5/#7/#9).
// A centered pop-up over the grid (was a right-side drawer) — a wider, shorter
// floating card that scales in on open. Sections are ordered to match the
// Skylight interface the household already knows: Title, All-day, Start, End,
// Repeats, Countdown, Reminder, Assign — each a clearly separated, icon-labeled
// section.
//
// Phase 2 changes:
//   #5 — tapping the dim scrim closes the panel (not just the X).
//   #7 — the Title uses the in-app OnScreenKeyboard; no native input ever
//        focuses, so the OS keyboard never appears and the canvas never shrinks.
//   #9 — generous separation between options, and a time control that stacks the
//        value over its steppers so a 4-digit time never reflows to a new line.
//
// There is no calendar picker: assignment decides where copies are written.
// "Assign" defaults to a Family chip (everyone). Every control is sized for a
// hand reaching up to a wall (spec §6.1). The RRULE is built server-side.
//
// On submit the button disables, we POST/PUT, and on success hand the event up
// so it lands on the wall immediately. On failure the panel stays open with
// every field intact and shows the server's message inline.

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

/** A titled section with a leading icon. Every field reads the same way. */
function Section({
  icon,
  label,
  children,
  hint,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2.5 text-ink-soft">
        <span className="text-ink-faint" aria-hidden>
          {icon}
        </span>
        <span className="text-label font-semibold uppercase tracking-wide">{label}</span>
      </div>
      {children}
      {hint && <span className="text-stamp text-ink-faint">{hint}</span>}
    </section>
  );
}

/** An inline "label + control on the right" row with its own leading icon. */
function InlineRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="flex items-center justify-between gap-4 border-t border-hairline pt-5">
      <div className="flex items-center gap-2.5 text-ink-soft">
        <span className="text-ink-faint" aria-hidden>
          {icon}
        </span>
        <span className="text-label font-semibold uppercase tracking-wide">{label}</span>
      </div>
      {children}
    </section>
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

// ── Compact date/time (Phase 2 #7) ────────────────────────────────────────────
// Starts/Ends read as compact value PILLS (date beside time); tapping a pill
// reveals a small stepper right beneath it. Far denser than the old always-open
// stacked steppers, matching the interface the household asked for.

/** A small round stepper button for the compact date/time editors. */
function MiniStep({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-[0_1px_0_var(--color-hairline-strong)] transition-colors hover:bg-ground-2 active:scale-95"
    >
      {children}
    </button>
  );
}

/** A tappable field showing a value; opens its editor when tapped. */
function FieldPill({
  active,
  onClick,
  icon,
  children,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={active}
      onClick={onClick}
      className={`flex min-w-0 items-center gap-2 rounded-xl px-4 py-3 text-body transition-colors ${
        active ? "bg-ground-2 text-ink ring-2 ring-ink/15" : "bg-ground text-ink hover:bg-ground-2"
      } ${className}`}
    >
      <span className="shrink-0 text-ink-faint" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      <ChevronDown
        className={`size-5 shrink-0 text-ink-faint transition-transform ${active ? "rotate-180" : ""}`}
        strokeWidth={2}
        aria-hidden
      />
    </button>
  );
}

/** Compact date stepper: ‹ value ›. */
function DateEditor({
  value,
  onChange,
}: {
  value: DateParts;
  onChange: (v: DateParts) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-ground/70 px-2 py-2">
      <MiniStep onClick={() => onChange(addDaysToParts(value, -1))} label="Previous day">
        <ChevronLeft className="size-6" strokeWidth={2.5} aria-hidden />
      </MiniStep>
      <span className="whitespace-nowrap text-title text-ink">{dateLabel(value)}</span>
      <MiniStep onClick={() => onChange(addDaysToParts(value, 1))} label="Next day">
        <ChevronRight className="size-6" strokeWidth={2.5} aria-hidden />
      </MiniStep>
    </div>
  );
}

/** Compact time stepper: hour steppers · value · minute steppers, one row. */
function TimeEditor({
  value,
  onChange,
}: {
  value: TimeParts;
  onChange: (v: TimeParts) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-ground/70 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <MiniStep onClick={() => onChange(stepHour(value, -1))} label="Hour down">
          <Minus className="size-5" strokeWidth={2.5} aria-hidden />
        </MiniStep>
        <MiniStep onClick={() => onChange(stepHour(value, 1))} label="Hour up">
          <Plus className="size-5" strokeWidth={2.5} aria-hidden />
        </MiniStep>
      </div>
      <span className="whitespace-nowrap text-title tabular-nums text-ink">
        {timeLabel(value)}
      </span>
      <div className="flex items-center gap-1.5">
        <MiniStep onClick={() => onChange(stepMinute(value, -1))} label="Minute down">
          <Minus className="size-5" strokeWidth={2.5} aria-hidden />
        </MiniStep>
        <MiniStep onClick={() => onChange(stepMinute(value, 1))} label="Minute up">
          <Plus className="size-5" strokeWidth={2.5} aria-hidden />
        </MiniStep>
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
      className={`flex h-9 w-16 shrink-0 items-center rounded-full p-1 transition-colors ${
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
  initialEvent,
  onClose,
  onCreated,
  onEdited,
  onDeleted,
}: {
  initialDate: Date;
  now: Date;
  members: Member[];
  /** When present, the panel edits this event instead of creating a new one. */
  initialEvent?: CalendarEvent;
  onClose: () => void;
  onCreated: (event: CalendarEvent) => void;
  onEdited?: (event: CalendarEvent, oldEvent: CalendarEvent) => void;
  onDeleted?: (event: CalendarEvent) => void;
}) {
  const textOn = useTextOn();
  const timeZone = useTimeZone();
  const allKeys = members.map((m) => m.key);
  const editing = Boolean(initialEvent);
  const recurring = initialEvent?.recurring ?? false;
  // Any event being edited can be deleted: a Hearth event by its group id, or a
  // phone-made event by its real calendar + event id (never a synthetic wall id
  // without a group). This is what makes EVERY event on the wall deletable.
  const deletable = Boolean(
    initialEvent &&
      (initialEvent.hearthGroupId ||
        (initialEvent.calendarId && !initialEvent.id.startsWith("hearth:"))),
  );

  const [draft, setDraft] = useState<EventDraft>(() =>
    initialEvent
      ? draftFromEvent(initialEvent, allKeys, timeZone)
      : defaultDraft(initialDate, now),
  );
  // Which compact date/time editor is expanded (only one at a time), and whether
  // the Reminder options are expanded (Phase 2 #7 — a denser, collapsible form).
  type OpenField = "startDate" | "startTime" | "endDate" | "endTime" | null;
  const [openField, setOpenField] = useState<OpenField>(null);
  const [remOpen, setRemOpen] = useState(false);
  const toggleField = (f: Exclude<OpenField, null>) =>
    setOpenField((cur) => (cur === f ? null : f));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  // Touch walls type with the in-app on-screen keyboard (no native input ever
  // focuses, so the OS keyboard can't appear and shrink the canvas). A PC/laptop
  // (fine pointer, hover) instead gets a real text input so a physical keyboard
  // works normally (Phase 2 #8). Computed once — this panel only renders client-side.
  const [isTouch] = useState(() => {
    if (typeof window === "undefined") return false;
    const mm = (q: string) =>
      typeof window.matchMedia === "function" && window.matchMedia(q).matches;
    // Touch capability — generous (coarse primary pointer OR any touch points) so
    // the kiosk WebView is always caught.
    const coarse = mm("(pointer: coarse)");
    const hasTouchPoints =
      typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
    const touchCapable = coarse || hasTouchPoints;
    // …but a device with a fine pointer (mouse/trackpad) is a PC, even if it also
    // has a touchscreen. Only a touch-capable device with NO fine pointer is the
    // wall kiosk. This is the fix for the OSK appearing on touchscreen PCs and
    // blocking the physical keyboard (Todoist: "OSK on PC"). The wall reports no
    // fine pointer, so it still gets the in-app keyboard and never the OS one.
    const hasFinePointer = mm("(any-pointer: fine)");
    return touchCapable && !hasFinePointer;
  });

  useEffect(() => setShown(true), []);

  // Escape closes — harmless on a touch wall, helpful during development.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (kbOpen) setKbOpen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, kbOpen]);

  const patch = (p: Partial<EventDraft>) => setDraft((d) => reconcile({ ...d, ...p }));

  // Changing the START carries the end to start + 1 hour, so the end always
  // defaults to one hour after the start (Todoist: "end should default to one
  // hour after start") instead of drifting when the start steppers move. Only
  // for NEW timed events — editing an existing event keeps the end the user
  // already has (reconcile still keeps it valid). Editing the End directly goes
  // through `patch`, which never rewrites it.
  const patchStart = (p: Partial<EventDraft>) =>
    setDraft((d) => {
      const next: EventDraft = { ...d, ...p };
      if (!editing && !next.allDay) {
        next.endDate = next.startDate;
        next.endTime = addOneHour(next.startTime);
      }
      return reconcile(next);
    });

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
  const reminderLabel =
    REMINDER_OPTIONS.find((o) => o.v === draft.reminder)?.l ?? "None";

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const target: EditEventBody["target"] | null = initialEvent
        ? initialEvent.hearthGroupId
          ? { hearthGroupId: initialEvent.hearthGroupId }
          : { calendarId: initialEvent.calendarId, eventId: initialEvent.id }
        : null;

      const res = await fetch("/api/calendar/events", {
        method: editing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          editing && target
            ? buildEditBody(draft, allKeys, target)
            : buildBody(draft, allKeys),
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? (editing ? "Couldn't save the event." : "Couldn't create the event."));
        setSubmitting(false); // keep the panel open, fields intact
        return;
      }

      // Merge the event onto the wall immediately either way.
      const event = json.event as CalendarEvent;
      if (editing && initialEvent) onEdited?.(event, initialEvent);
      else onCreated(event);

      const failures: { memberKey?: string }[] = Array.isArray(json.failures)
        ? json.failures
        : [];
      if (failures.length > 0) {
        // Saved, but some people's calendars aren't shared with Hearth yet — keep
        // the panel open so the note is seen. The wall still shows the event.
        const names = failures
          .map((f) => members.find((m) => m.key === f.memberKey)?.name ?? f.memberKey ?? "someone")
          .join(", ");
        setError(`Saved, but ${names} can't see it yet — share their calendar with Hearth.`);
        setSubmitting(false);
        return;
      }
      onClose();
    } catch {
      setError("Couldn't reach the server. Try again.");
      setSubmitting(false);
    }
  }

  function remove() {
    if (initialEvent && onDeleted) onDeleted(initialEvent);
    onClose();
  }

  const canSubmit = !submitting && !recurring && draft.title.trim().length > 0;

  return (
    // The whole overlay closes on an outside tap (#5); the panel stops the tap
    // so interacting inside never dismisses it. Centered pop-up (was a right-side
    // drawer): a wider, shorter floating card that scales in on open.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      role="presentation"
      onClick={() => (kbOpen ? setKbOpen(false) : onClose())}
    >
      <div
        className={`absolute inset-0 bg-ink/25 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden
      />

      <div
        className={`relative flex max-h-[86vh] w-[46rem] max-w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_30px_80px_-20px_rgba(43,38,32,0.55)] transition-all duration-200 ease-out ${
          shown ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Edit event" : "Add event"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline px-8 py-5">
          <h2 className="flex items-center gap-3 font-display text-display text-ink">
            <span className="text-ink-soft" aria-hidden>
              {editing ? (
                <Pencil className="size-8" strokeWidth={2} />
              ) : (
                <CalendarPlus className="size-8" strokeWidth={2} />
              )}
            </span>
            {editing ? "Edit event" : "New event"}
          </h2>
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
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-8 py-6">
          {recurring && (
            <p className="rounded-xl bg-ground px-4 py-3 text-body text-ink-soft">
              This is a repeating event — edit it on your phone. You can delete it
              here.
            </p>
          )}

          <Section icon={<Type className="size-5" strokeWidth={2} />} label="Title">
            {isTouch ? (
              // Wall: a tappable display that opens the in-app keyboard — no native
              // input, so the OS keyboard never appears.
              <button
                type="button"
                onClick={() => setKbOpen(true)}
                aria-label="Event title"
                className={`flex min-h-[3.75rem] w-full items-center rounded-xl px-4 py-3 text-left text-body transition-colors ${
                  kbOpen ? "bg-ground-2 ring-2 ring-ink/15" : "bg-ground hover:bg-ground-2"
                }`}
              >
                {draft.title ? (
                  <span className="text-ink">{draft.title}</span>
                ) : (
                  <span className="text-ink-faint">What&rsquo;s happening?</span>
                )}
                {kbOpen && (
                  <span className="ml-0.5 inline-block h-7 w-0.5 animate-pulse bg-ink" aria-hidden />
                )}
              </button>
            ) : (
              // PC/laptop: a real input so the physical keyboard just works.
              <input
                type="text"
                autoFocus
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (canSubmit) submit();
                  }
                }}
                placeholder="What's happening?"
                aria-label="Event title"
                className="min-h-[3.75rem] w-full rounded-xl bg-ground px-4 py-3 text-body text-ink outline-none transition-colors placeholder:text-ink-faint hover:bg-ground-2 focus:bg-ground-2 focus:ring-2 focus:ring-ink/15"
              />
            )}
          </Section>

          <InlineRow icon={<Sun className="size-5" strokeWidth={2} />} label="All-day">
            <Toggle
              on={draft.allDay}
              onChange={(on) => patch({ allDay: on })}
              label="All-day event"
            />
          </InlineRow>

          <Section icon={<Clock className="size-5" strokeWidth={2} />} label="Starts">
            <div className="flex gap-2">
              <FieldPill
                active={openField === "startDate"}
                onClick={() => toggleField("startDate")}
                icon={<CalendarDays className="size-5" strokeWidth={2} />}
                className={draft.allDay ? "flex-1" : "flex-[3]"}
              >
                {dateLabel(draft.startDate)}
              </FieldPill>
              {!draft.allDay && (
                <FieldPill
                  active={openField === "startTime"}
                  onClick={() => toggleField("startTime")}
                  icon={<Clock className="size-5" strokeWidth={2} />}
                  className="flex-[2]"
                >
                  {timeLabel(draft.startTime)}
                </FieldPill>
              )}
            </div>
            {openField === "startDate" && (
              <DateEditor value={draft.startDate} onChange={(v) => patchStart({ startDate: v })} />
            )}
            {openField === "startTime" && !draft.allDay && (
              <TimeEditor value={draft.startTime} onChange={(v) => patchStart({ startTime: v })} />
            )}
          </Section>

          <Section icon={<CalendarDays className="size-5" strokeWidth={2} />} label="Ends">
            <div className="flex gap-2">
              <FieldPill
                active={openField === "endDate"}
                onClick={() => toggleField("endDate")}
                icon={<CalendarDays className="size-5" strokeWidth={2} />}
                className={draft.allDay ? "flex-1" : "flex-[3]"}
              >
                {dateLabel(draft.endDate)}
              </FieldPill>
              {!draft.allDay && (
                <FieldPill
                  active={openField === "endTime"}
                  onClick={() => toggleField("endTime")}
                  icon={<Clock className="size-5" strokeWidth={2} />}
                  className="flex-[2]"
                >
                  {timeLabel(draft.endTime)}
                </FieldPill>
              )}
            </div>
            {openField === "endDate" && (
              <DateEditor value={draft.endDate} onChange={(v) => patch({ endDate: v })} />
            )}
            {openField === "endTime" && !draft.allDay && (
              <TimeEditor value={draft.endTime} onChange={(v) => patch({ endTime: v })} />
            )}
          </Section>

          {!editing && (
            <>
              <InlineRow icon={<Repeat className="size-5" strokeWidth={2} />} label="Repeats">
                <Toggle
                  on={repeatsOn}
                  onChange={(on) => setRepeat(on ? "weekly" : "none")}
                  label="Repeats"
                />
              </InlineRow>
              {repeatsOn && (
                <div className="-mt-2 flex flex-col gap-3 rounded-xl bg-ground px-4 py-4">
                  <Segmented
                    options={REPEAT_OPTIONS.filter((o) => o.v !== "none")}
                    value={draft.repeat}
                    onChange={setRepeat}
                  />
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
                    <DateEditor
                      value={draft.repeatUntil}
                      onChange={(v) => patch({ repeatUntil: v })}
                    />
                  )}
                </div>
              )}
            </>
          )}

          <InlineRow icon={<Timer className="size-5" strokeWidth={2} />} label="Countdown">
            <Toggle
              on={draft.countdown}
              onChange={(on) => patch({ countdown: on })}
              label="Show a countdown"
            />
          </InlineRow>
          {repeatsOn && (
            <p className="-mt-3 text-stamp text-ink-faint">
              Countdown is off for repeating events — it would count to the next
              occurrence, which is a different thing.
            </p>
          )}

          {!editing && (
            <section className="flex flex-col gap-3 border-t border-hairline pt-5">
              <button
                type="button"
                aria-expanded={remOpen}
                onClick={() => setRemOpen((o) => !o)}
                className="flex items-center justify-between gap-4"
              >
                <span className="flex items-center gap-2.5 text-ink-soft">
                  <span className="text-ink-faint" aria-hidden>
                    <Bell className="size-5" strokeWidth={2} />
                  </span>
                  <span className="text-label font-semibold uppercase tracking-wide">
                    Reminder
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-body text-ink">{reminderLabel}</span>
                  <ChevronDown
                    className={`size-5 text-ink-faint transition-transform ${remOpen ? "rotate-180" : ""}`}
                    strokeWidth={2}
                    aria-hidden
                  />
                </span>
              </button>
              {remOpen && (
                <Segmented
                  options={REMINDER_OPTIONS}
                  value={draft.reminder}
                  onChange={(v) => patch({ reminder: v })}
                />
              )}
            </section>
          )}

          <Section
            icon={<Users className="size-5" strokeWidth={2} />}
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
                      className={`flex size-14 items-center justify-center rounded-full font-display text-[1.75rem] leading-none transition-all ${
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
          </Section>
        </div>

        {/* Footer */}
        <div className="border-t border-hairline px-8 py-5">
          {error && (
            <p role="alert" className="mb-3 text-body text-[var(--color-maryann)]">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            {deletable && (
              <button
                type="button"
                onClick={remove}
                aria-label="Delete event"
                className="flex size-12 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ground-2 hover:text-[var(--color-maryann)]"
              >
                <Trash2 className="size-6" strokeWidth={2} aria-hidden />
              </button>
            )}
            <div className="flex flex-1 items-center justify-end gap-3">
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
                {submitting
                  ? editing
                    ? "Saving…"
                    : "Adding…"
                  : editing
                    ? "Save"
                    : "Add event"}
              </button>
            </div>
          </div>
        </div>

        {/* In-app keyboard: slides up over the footer when the Title is tapped. */}
        {kbOpen && (
          <div className="absolute inset-x-0 bottom-0 z-20">
            <OnScreenKeyboard
              onInsert={(t) => setDraft((d) => reconcile({ ...d, title: d.title + t }))}
              onBackspace={() =>
                setDraft((d) => reconcile({ ...d, title: d.title.slice(0, -1) }))
              }
              onDone={() => setKbOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
