"use client";

import { CalendarDays, ChevronLeft, Clock, Pencil, Repeat, Timer, Users } from "lucide-react";
import type { CalendarEvent, Member } from "@/lib/calendar/types";
import { colorVar, EVERYONE_COLOR } from "@/lib/calendar/palette";
import { eventClockRange, eventDateLabel } from "@/lib/calendar/dates";
import { countdownDays, countdownLabel } from "@/lib/calendar/event";
import { useTimeZone } from "@/components/common/TimeZone";
import { useTextOn } from "@/components/common/ColorProvider";

// The expanded view of one event (Phase 2 #11). Reached by tapping a row in the
// day list, or opened directly when a day holds a single event. Reads full: the
// title, when, who it's about, and any countdown/repeat state — then an Edit
// button into the existing edit panel and a Back control.
//
// There is deliberately NO "Add" button here (#6): viewing an event is a
// reading context; adding is the FAB's job. A stray tap while reading must never
// start a new event.

// Who the event is about: the tagged members, or "Everyone" for a whole-family /
// shared event. Returns the members to draw as avatars plus a family flag.
function assignees(
  event: CalendarEvent,
  members: Member[],
): { family: boolean; people: Member[] } {
  const everyone =
    event.colors.includes(EVERYONE_COLOR) ||
    (members.length > 0 && event.memberKeys.length === members.length);
  if (everyone) return { family: true, people: [] };
  const keys =
    event.memberKeys.length > 0
      ? event.memberKeys
      : event.defaultMemberKey
        ? [event.defaultMemberKey]
        : [];
  const people = keys
    .map((k) => members.find((m) => m.key === k))
    .filter((m): m is Member => Boolean(m));
  return { family: false, people };
}

function Avatar({ member }: { member: Member }) {
  const textOn = useTextOn();
  const dark = textOn(member.color) === "dark";
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`flex size-11 items-center justify-center rounded-full font-display text-[1.5rem] leading-none ${
          dark ? "text-ink" : "text-white"
        }`}
        style={{ backgroundColor: `var(${colorVar(member.color)})` }}
        aria-hidden
      >
        {member.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="text-body text-ink">{member.name}</span>
    </span>
  );
}

function InfoRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ground text-ink-soft">
        {icon}
      </span>
      <div className="min-w-0 text-body text-ink">{children}</div>
    </div>
  );
}

export function EventDetail({
  event,
  members,
  now,
  onBack,
  onEdit,
  showBack,
}: {
  event: CalendarEvent;
  members: Member[];
  now: Date;
  onBack: () => void;
  onEdit: (event: CalendarEvent) => void;
  /** Hide the Back control when detail is the panel's only screen (single-event day). */
  showBack: boolean;
}) {
  const timeZone = useTimeZone();
  const { family, people } = assignees(event, members);
  const bandColor = event.colors[0] ?? "neutral";

  return (
    <div className="flex flex-col">
      {/* Header: back, a color dot, the title, and the edit affordance. */}
      <div className="mb-6 flex items-start gap-4">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to the day"
            className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ground-2"
          >
            <ChevronLeft className="size-8" strokeWidth={2} aria-hidden />
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className="mt-2 size-5 shrink-0 rounded-full"
            style={{ backgroundColor: `var(${colorVar(bandColor)})` }}
            aria-hidden
          />
          <h2 className="min-w-0 font-display text-display leading-tight text-ink">
            {event.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => onEdit(event)}
          aria-label={`Edit ${event.title}`}
          className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-5 text-label font-medium text-surface transition-colors hover:bg-ink/90"
        >
          <Pencil className="size-5" strokeWidth={2.25} aria-hidden />
          Edit
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <InfoRow icon={<CalendarDays className="size-6" strokeWidth={2} aria-hidden />}>
          {eventDateLabel(event, timeZone)}
        </InfoRow>
        <InfoRow icon={<Clock className="size-6" strokeWidth={2} aria-hidden />}>
          {eventClockRange(event, timeZone)}
        </InfoRow>

        <InfoRow icon={<Users className="size-6" strokeWidth={2} aria-hidden />}>
          {family ? (
            <span className="flex items-center gap-2.5">
              <span
                className="flex size-11 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: `var(${colorVar(EVERYONE_COLOR)})` }}
                aria-hidden
              >
                <Users className="size-6" strokeWidth={2.25} aria-hidden />
              </span>
              <span className="text-body text-ink">Everyone</span>
            </span>
          ) : people.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {people.map((m) => (
                <Avatar key={m.key} member={m} />
              ))}
            </div>
          ) : (
            <span className="text-ink-soft">No one assigned</span>
          )}
        </InfoRow>

        {event.countdown && (
          <InfoRow icon={<Timer className="size-6" strokeWidth={2} aria-hidden />}>
            Countdown · {countdownLabel(countdownDays(event, now))}
          </InfoRow>
        )}
        {event.recurring && (
          <InfoRow icon={<Repeat className="size-6" strokeWidth={2} aria-hidden />}>
            Repeats · edit the series on your phone
          </InfoRow>
        )}
      </div>
    </div>
  );
}
