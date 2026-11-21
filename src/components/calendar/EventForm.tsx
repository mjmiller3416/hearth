"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hourglass,
  Minus,
  Plus,
  Repeat,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import type { CalendarEvent, EditEventBody, Member } from "@/lib/calendar/types";
import { OnScreenKeyboard } from "@/components/common/OnScreenKeyboard";
import { useTimeZone } from "@/components/common/TimeZone";
import { Avatar, FamilyAvatar } from "@/components/ui/Avatar";
import { Button, ChoicePills, Toggle } from "@/components/ui/Button";
import { Sheet, SheetBody, SheetFooter, SheetHeader } from "@/components/ui/Sheet";
import { useTouchWall } from "@/hooks/useTouchWall";
import {
  addDaysToParts,
  addOneHour,
  buildBody,
  buildEditBody,
  dateLabel,
  dateStr,
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

// Add or edit one event (spec §4.1). One form, two ways to fill it in:
//
//   phone / laptop  real inputs: the keyboard for the title and the system's
//                   own date and time pickers, which nobody has to learn.
//   the wall        no native input ever focuses (the OS keyboard would cover
//                   half the display), so the title opens the in-app keyboard
//                   and dates and times step with large buttons.
//
// There is no calendar picker: who an event is for decides where it is written
// (spec D3). "Family" is the default. The RRULE is built server-side. On submit
// the event lands on screen at once; on failure the form stays open with every
// field intact and the server's message inline.

const REPEAT_OPTIONS: { value: RepeatChoice; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const REPEAT_END_OPTIONS: { value: RepeatEndMode; label: string }[] = [
  { value: "never", label: "Forever" },
  { value: "count", label: "After…" },
  { value: "until", label: "Until…" },
];

const REMINDER_OPTIONS: { value: ReminderChoice; label: string }[] = [
  { value: "none", label: "None" },
  { value: "at", label: "At time" },
  { value: "10", label: "10 min" },
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" },
  { value: "1440", label: "1 day" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const timeStr = (t: TimeParts) => `${pad2(t.h)}:${pad2(t.min)}`;

function parseDate(value: string): DateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

function parseTime(value: string): TimeParts | null {
  const m = /^(\d{2}):(\d{2})/.exec(value);
  return m ? { h: Number(m[1]), min: Number(m[2]) } : null;
}

// ── Layout pieces ───────────────────────────────────────────────────────────

/** A labeled field. `inline` puts a small control (a switch) on the label's row. */
function Field({
  icon,
  label,
  children,
  inline = false,
  hint,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  inline?: boolean;
  hint?: string;
}) {
  const heading = (
    <span className="flex items-center gap-2 text-small font-semibold uppercase tracking-[0.08em] text-fg-soft">
      <span className="text-fg-faint" aria-hidden>
        {icon}
      </span>
      {label}
    </span>
  );
  return (
    <section className="border-t border-line py-4 first:border-t-0 first:pt-0">
      {inline ? (
        <div className="flex items-center justify-between gap-4">
          {heading}
          {children}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {heading}
          {children}
        </div>
      )}
      {hint && <p className="mt-2 text-tiny text-fg-faint">{hint}</p>}
    </section>
  );
}

const WELL =
  "min-h-12 rounded-2xl bg-fill px-4 text-body text-fg ring-1 ring-inset ring-line outline-none focus:ring-2 focus:ring-accent";

/** A round stepper button for the wall's date and time editors. */
function Step({
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
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-raised text-fg ring-1 ring-inset ring-line-strong active:scale-95 active:bg-fill-2"
    >
      {children}
    </button>
  );
}

/** Wall date stepper: ‹ value ›. */
function DateStepper({ value, onChange }: { value: DateParts; onChange: (v: DateParts) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-fill p-2 ring-1 ring-inset ring-line">
      <Step onClick={() => onChange(addDaysToParts(value, -1))} label="Previous day">
        <ChevronLeft className="size-6" strokeWidth={2.5} aria-hidden />
      </Step>
      <span className="whitespace-nowrap text-lead text-fg">{dateLabel(value)}</span>
      <Step onClick={() => onChange(addDaysToParts(value, 1))} label="Next day">
        <ChevronRight className="size-6" strokeWidth={2.5} aria-hidden />
      </Step>
    </div>
  );
}

/** Wall time stepper: hour − + · value · minute − +. */
function TimeStepper({ value, onChange }: { value: TimeParts; onChange: (v: TimeParts) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-fill p-2 ring-1 ring-inset ring-line">
      <div className="flex items-center gap-1.5">
        <Step onClick={() => onChange(stepHour(value, -1))} label="Hour down">
          <Minus className="size-5" strokeWidth={2.5} aria-hidden />
        </Step>
        <Step onClick={() => onChange(stepHour(value, 1))} label="Hour up">
          <Plus className="size-5" strokeWidth={2.5} aria-hidden />
        </Step>
      </div>
      <span className="whitespace-nowrap text-lead tabular-nums text-fg">{timeLabel(value)}</span>
      <div className="flex items-center gap-1.5">
        <Step onClick={() => onChange(stepMinute(value, -1))} label="Minute down">
          <Minus className="size-5" strokeWidth={2.5} aria-hidden />
        </Step>
        <Step onClick={() => onChange(stepMinute(value, 1))} label="Minute up">
          <Plus className="size-5" strokeWidth={2.5} aria-hidden />
        </Step>
      </div>
    </div>
  );
}

/** A wall field showing a value; tapping it opens its stepper beneath. */
function ValuePill({
  active,
  onClick,
  children,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={active}
      onClick={onClick}
      className={`flex min-h-12 min-w-0 items-center gap-2 rounded-2xl px-4 text-body text-fg ring-inset ${
        active ? "bg-fill-2 ring-2 ring-accent" : "bg-fill ring-1 ring-line"
      } ${className}`}
    >
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      <ChevronDown
        className={`size-5 shrink-0 text-fg-faint transition-transform ${active ? "rotate-180" : ""}`}
        strokeWidth={2}
        aria-hidden
      />
    </button>
  );
}

/** One date + time pair (Starts or Ends), in the right form for this screen. */
function WhenField({
  label,
  icon,
  isWall,
  allDay,
  date,
  time,
  onDate,
  onTime,
}: {
  label: string;
  icon: ReactNode;
  isWall: boolean;
  allDay: boolean;
  date: DateParts;
  time: TimeParts;
  onDate: (v: DateParts) => void;
  onTime: (v: TimeParts) => void;
}) {
  const [open, setOpen] = useState<"date" | "time" | null>(null);

  if (!isWall) {
    return (
      <Field icon={icon} label={label}>
        <div className="flex gap-2">
          <input
            type="date"
            aria-label={`${label} date`}
            value={dateStr(date)}
            onChange={(e) => {
              const v = parseDate(e.target.value);
              if (v) onDate(v);
            }}
            className={`${WELL} min-w-0 flex-[3]`}
          />
          {!allDay && (
            <input
              type="time"
              aria-label={`${label} time`}
              step={300}
              value={timeStr(time)}
              onChange={(e) => {
                const v = parseTime(e.target.value);
                if (v) onTime(v);
              }}
              className={`${WELL} min-w-0 flex-[2]`}
            />
          )}
        </div>
      </Field>
    );
  }

  return (
    <Field icon={icon} label={label}>
      <div className="flex gap-2">
        <ValuePill
          active={open === "date"}
          onClick={() => setOpen(open === "date" ? null : "date")}
          className={allDay ? "flex-1" : "flex-[3]"}
        >
          {dateLabel(date)}
        </ValuePill>
        {!allDay && (
          <ValuePill
            active={open === "time"}
            onClick={() => setOpen(open === "time" ? null : "time")}
            className="flex-[2]"
          >
            {timeLabel(time)}
          </ValuePill>
        )}
      </div>
      {open === "date" && <DateStepper value={date} onChange={onDate} />}
      {open === "time" && !allDay && <TimeStepper value={time} onChange={onTime} />}
    </Field>
  );
}

// ── The form ────────────────────────────────────────────────────────────────

export function EventForm({
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
  /** When present, the form edits this event instead of creating a new one. */
  initialEvent?: CalendarEvent;
  onClose: () => void;
  onCreated: (event: CalendarEvent) => void;
  onEdited?: (event: CalendarEvent, oldEvent: CalendarEvent) => void;
  onDeleted?: (event: CalendarEvent) => void;
}) {
  const timeZone = useTimeZone();
  const isWall = useTouchWall();
  const allKeys = members.map((m) => m.key);
  const editing = Boolean(initialEvent);
  const recurring = initialEvent?.recurring ?? false;
  // Any event being edited can be deleted: a Hearth event by its group id, or a
  // phone-made event by its real calendar + event id (never a synthetic id).
  const deletable = Boolean(
    initialEvent &&
      (initialEvent.hearthGroupId ||
        (initialEvent.calendarId && !initialEvent.id.startsWith("hearth:"))),
  );

  const [draft, setDraft] = useState<EventDraft>(() =>
    initialEvent ? draftFromEvent(initialEvent, allKeys, timeZone) : defaultDraft(initialDate, now),
  );
  const [remOpen, setRemOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kbOpen, setKbOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 5000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const patch = (p: Partial<EventDraft>) => setDraft((d) => reconcile({ ...d, ...p }));

  // Changing the START of a NEW timed event carries the end to start + 1 hour,
  // so the end doesn't drift when the start moves. Editing keeps the end.
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

  // Repeat and countdown are mutually exclusive (D10): each clears the other.
  const repeatsOn = draft.repeat !== "none";
  const setRepeat = (v: RepeatChoice) => patch({ repeat: v, countdown: v === "none" ? draft.countdown : false });
  const setCountdown = (on: boolean) => patch({ countdown: on, repeat: on ? "none" : draft.repeat });

  const canSubmit = !submitting && !recurring && draft.title.trim().length > 0;

  async function submit() {
    if (!canSubmit) return;
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
          editing && target ? buildEditBody(draft, allKeys, target) : buildBody(draft, allKeys),
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? (editing ? "Couldn't save the event." : "Couldn't add the event."));
        setSubmitting(false); // keep the form open, fields intact
        return;
      }

      const event = json.event as CalendarEvent;
      if (editing && initialEvent) onEdited?.(event, initialEvent);
      else onCreated(event);

      const failures: { memberKey?: string }[] = Array.isArray(json.failures) ? json.failures : [];
      if (failures.length > 0) {
        // Saved, but some people's calendars aren't shared with Hearth yet:
        // stay open so the note is seen. The event already shows.
        const names = failures
          .map((f) => members.find((m) => m.key === f.memberKey)?.name ?? f.memberKey ?? "someone")
          .join(", ");
        setError(`Saved, but ${names} can't see it yet. Share their calendar with Hearth.`);
        setSubmitting(false);
        return;
      }
      onClose();
    } catch {
      setError("Couldn't reach the server. Try again.");
      setSubmitting(false);
    }
  }

  const reminderLabel = REMINDER_OPTIONS.find((o) => o.value === draft.reminder)?.label ?? "None";

  return (
    <Sheet label={editing ? "Edit event" : "New event"} onClose={kbOpen ? () => setKbOpen(false) : onClose}>
      <SheetHeader title={editing ? "Edit event" : "New event"} onClose={onClose} />

      <SheetBody>
        {recurring && (
          <p className="mb-4 rounded-2xl bg-fill px-4 py-3 text-body text-fg-soft ring-1 ring-inset ring-line">
            This event repeats. Change it in Google Calendar; you can delete the whole
            series here.
          </p>
        )}

        <section className="pb-4">
          {isWall ? (
            <button
              type="button"
              onClick={() => setKbOpen(true)}
              aria-label="Event title"
              className={`flex w-full items-center text-left ${WELL} ${kbOpen ? "ring-2 ring-accent" : ""}`}
            >
              {draft.title ? (
                <span className="text-fg">{draft.title}</span>
              ) : (
                <span className="text-fg-faint">What&rsquo;s happening?</span>
              )}
              {kbOpen && <span className="ml-0.5 h-6 w-0.5 animate-pulse bg-accent" aria-hidden />}
            </button>
          ) : (
            <input
              type="text"
              autoFocus={!editing}
              value={draft.title}
              enterKeyHint="done"
              autoCapitalize="sentences"
              onChange={(e) => patch({ title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="What's happening?"
              aria-label="Event title"
              className={`w-full ${WELL} text-lead placeholder:text-fg-faint`}
            />
          )}
        </section>

        <Field icon={<Users className="size-4" strokeWidth={2.25} />} label="Who">
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            {/* Family = everyone, and the default. Tapping a person clears it;
                clearing everyone restores it, so an event is never for no one. */}
            <PersonPick
              label="Family"
              selected={draft.memberKeys.length === 0}
              onClick={() => patch({ memberKeys: [] })}
              avatar={<FamilyAvatar size="lg" />}
            />
            {members.map((m) => (
              <PersonPick
                key={m.key}
                label={m.name}
                selected={draft.memberKeys.includes(m.key)}
                onClick={() => toggleMember(m.key)}
                avatar={<Avatar name={m.name} color={m.color} size="lg" />}
              />
            ))}
          </div>
        </Field>

        <Field icon={<Sun className="size-4" strokeWidth={2.25} />} label="All day" inline>
          <Toggle on={draft.allDay} onChange={(on) => patch({ allDay: on })} label="All-day event" />
        </Field>

        <WhenField
          label="Starts"
          icon={<Clock className="size-4" strokeWidth={2.25} />}
          isWall={isWall}
          allDay={draft.allDay}
          date={draft.startDate}
          time={draft.startTime}
          onDate={(v) => patchStart({ startDate: v })}
          onTime={(v) => patchStart({ startTime: v })}
        />
        <WhenField
          label="Ends"
          icon={<CalendarDays className="size-4" strokeWidth={2.25} />}
          isWall={isWall}
          allDay={draft.allDay}
          date={draft.endDate}
          time={draft.endTime}
          onDate={(v) => patch({ endDate: v })}
          onTime={(v) => patch({ endTime: v })}
        />

        {!editing && (
          <Field icon={<Repeat className="size-4" strokeWidth={2.25} />} label="Repeats" inline={!repeatsOn}>
            {repeatsOn ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <ChoicePills label="How often" options={REPEAT_OPTIONS} value={draft.repeat} onChange={setRepeat} />
                  <Toggle on onChange={() => setRepeat("none")} label="Repeats" />
                </div>
                <ChoicePills
                  label="Until when"
                  options={REPEAT_END_OPTIONS}
                  value={draft.repeatEndMode}
                  onChange={(v) => patch({ repeatEndMode: v })}
                />
                {draft.repeatEndMode === "count" && (
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-fill p-2 pl-4 ring-1 ring-inset ring-line">
                    <span className="text-body text-fg">{draft.repeatCount} times</span>
                    <span className="flex items-center gap-1.5">
                      <Step
                        onClick={() => patch({ repeatCount: Math.max(1, draft.repeatCount - 1) })}
                        label="Fewer times"
                      >
                        <Minus className="size-5" strokeWidth={2.5} aria-hidden />
                      </Step>
                      <Step onClick={() => patch({ repeatCount: draft.repeatCount + 1 })} label="More times">
                        <Plus className="size-5" strokeWidth={2.5} aria-hidden />
                      </Step>
                    </span>
                  </div>
                )}
                {draft.repeatEndMode === "until" &&
                  (isWall ? (
                    <DateStepper value={draft.repeatUntil} onChange={(v) => patch({ repeatUntil: v })} />
                  ) : (
                    <input
                      type="date"
                      aria-label="Repeat until"
                      value={dateStr(draft.repeatUntil)}
                      onChange={(e) => {
                        const v = parseDate(e.target.value);
                        if (v) patch({ repeatUntil: v });
                      }}
                      className={WELL}
                    />
                  ))}
              </div>
            ) : (
              <Toggle on={false} onChange={() => setRepeat("weekly")} label="Repeats" />
            )}
          </Field>
        )}

        <Field
          icon={<Hourglass className="size-4" strokeWidth={2.25} />}
          label="Countdown"
          inline
          hint={
            repeatsOn
              ? "Off for repeating events."
              : "Counts down to it at the bottom of every screen."
          }
        >
          <Toggle on={draft.countdown} onChange={setCountdown} label="Show a countdown" disabled={repeatsOn} />
        </Field>

        {!editing && (
          <section className="border-t border-line py-4">
            <button
              type="button"
              aria-expanded={remOpen}
              onClick={() => setRemOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-4"
            >
              <span className="flex items-center gap-2 text-small font-semibold uppercase tracking-[0.08em] text-fg-soft">
                <Bell className="size-4 text-fg-faint" strokeWidth={2.25} aria-hidden />
                Reminder
              </span>
              <span className="flex items-center gap-1.5 text-body text-fg">
                {reminderLabel}
                <ChevronDown
                  className={`size-5 text-fg-faint transition-transform ${remOpen ? "rotate-180" : ""}`}
                  strokeWidth={2}
                  aria-hidden
                />
              </span>
            </button>
            {remOpen && (
              <div className="pt-3">
                <ChoicePills
                  label="Reminder"
                  options={REMINDER_OPTIONS}
                  value={draft.reminder}
                  onChange={(v) => patch({ reminder: v })}
                />
              </div>
            )}
          </section>
        )}
      </SheetBody>

      <SheetFooter>
        {deletable && (
          <Button
            variant={confirmDelete ? "danger" : "ghost"}
            aria-label={confirmDelete ? "Confirm delete" : "Delete event"}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              if (initialEvent) onDeleted?.(initialEvent);
              onClose();
            }}
          >
            <Trash2 className="size-5" strokeWidth={2} aria-hidden />
            {confirmDelete ? (recurring ? "Delete every repeat?" : "Really delete?") : "Delete"}
          </Button>
        )}
        <div className="flex min-w-0 flex-1 flex-col items-end gap-2">
          {error && (
            <p role="alert" className="text-right text-small text-bad">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={!canSubmit}>
              {submitting ? (editing ? "Saving…" : "Adding…") : editing ? "Save" : "Add event"}
            </Button>
          </div>
        </div>
      </SheetFooter>

      {/* The wall's keyboard: slides up over the footer when the title is tapped. */}
      {isWall && kbOpen && (
        <div className="absolute inset-x-0 bottom-0 z-20 animate-rise overflow-hidden rounded-t-[1.75rem] border-t border-line shadow-float">
          <OnScreenKeyboard
            onInsert={(t) => setDraft((d) => reconcile({ ...d, title: d.title + t }))}
            onBackspace={() => setDraft((d) => reconcile({ ...d, title: d.title.slice(0, -1) }))}
            onDone={() => setKbOpen(false)}
          />
        </div>
      )}
    </Sheet>
  );
}

function PersonPick({
  label,
  selected,
  onClick,
  avatar,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  avatar: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className="flex w-[4.25rem] flex-col items-center gap-1.5"
    >
      <span
        className={`rounded-full transition-all ${
          selected ? "ring-[3px] ring-accent ring-offset-2 ring-offset-paper" : "opacity-45"
        }`}
      >
        {avatar}
      </span>
      <span className={`text-tiny ${selected ? "font-semibold text-fg" : "text-fg-soft"}`}>{label}</span>
    </button>
  );
}
