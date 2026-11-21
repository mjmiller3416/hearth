"use client";

import { Check, Home, RotateCcw, Sparkles } from "lucide-react";
import type { Completion, Room } from "@/lib/tada/types";
import type { CleanSession } from "@/hooks/useHub";
import { colorVar } from "@/lib/calendar/palette";
import { useTextOn } from "@/components/common/ColorProvider";
import { useTimeZone } from "@/components/common/TimeZone";
import { Button } from "@/components/ui/Button";

// The cleaning session's pieces (spec §4.2, D4): the room picker, the ONE task
// with its Done target, and done-today.
//
// D4 is the load-bearing rule here and it survives the redesign untouched: the
// session shows the single task Tada! picked and nothing about what's left. No
// queue, no count, no "up next", no progress. If a change to these components
// makes the amount of undone work visible, that change is wrong.

/** "Whole house" or one room. Rooms are places, so the pills stay neutral. */
export function RoomPicker({
  rooms,
  activeRoomId,
  onSelect,
}: {
  rooms: Room[];
  activeRoomId: string | null;
  onSelect: (roomId: string | null) => void;
}) {
  const pill = (active: boolean) =>
    `flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-label font-semibold leading-none transition-colors ${
      active ? "bg-ink text-on-ink" : "bg-surface text-ink-soft ring-1 ring-inset ring-hairline-strong"
    }`;
  return (
    <div className="scroll-strip -mx-4 flex items-center gap-2 px-4 wide:mx-0 wide:px-0" role="group" aria-label="Room">
      <button
        type="button"
        aria-pressed={activeRoomId === null}
        onClick={() => onSelect(null)}
        className={pill(activeRoomId === null)}
      >
        <Home className="size-4" strokeWidth={2.25} aria-hidden />
        Whole house
      </button>
      {rooms.map((room) => (
        <button
          key={room.id}
          type="button"
          aria-pressed={room.id === activeRoomId}
          onClick={() => onSelect(room.id)}
          className={pill(room.id === activeRoomId)}
        >
          {room.name}
        </button>
      ))}
    </div>
  );
}

/**
 * The session itself: the one task, large and alone, with a single Done
 * target; then a brief "Nice." with Undo; or a calm rest state. `compact` is the
 * Today card (the task on the left, Done on the right); the Chores page gives
 * it the room it deserves.
 */
export function CleanTask({
  session,
  compact = false,
}: {
  session: CleanSession;
  compact?: boolean;
}) {
  const textOn = useTextOn();
  const { task, justDone, adult, roomName, error } = session;
  const color = adult?.color ?? null;
  const fill = color ? `var(${colorVar(color)})` : "var(--color-ink)";
  const onFill = color ? (textOn(color) === "dark" ? "#27221c" : "#ffffff") : "var(--color-on-ink)";
  // Keyed so each swap cross-fades in (spec §7).
  const key = justDone ? `done-${justDone.task.id}` : task ? `task-${task.id}` : `rest-${session.roomId ?? "all"}`;

  if (compact) {
    return (
      <div key={key} className="animate-fade">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            {justDone ? (
              <>
                <p className="text-stamp font-semibold uppercase tracking-[0.1em] text-ink-faint">Nice.</p>
                <p className="font-display text-title leading-tight text-ink-soft line-through">
                  {justDone.task.name}
                </p>
              </>
            ) : task ? (
              <>
                {task.room && (
                  <p className="text-stamp font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    {task.room}
                  </p>
                )}
                <h3 className="text-balance font-display text-title leading-tight text-ink">{task.name}</h3>
              </>
            ) : (
              <p className="flex items-center gap-2.5 font-display text-title leading-tight text-ink">
                <Sparkles className="size-6 shrink-0 text-ink-faint" strokeWidth={1.75} aria-hidden />
                All caught up.
              </p>
            )}
          </div>
          {justDone ? (
            <Button onClick={session.undo} disabled={!justDone.canUndo}>
              <RotateCcw className="size-4" strokeWidth={2.25} aria-hidden />
              Undo
            </Button>
          ) : task ? (
            <button
              type="button"
              onClick={session.complete}
              disabled={!adult}
              aria-label={`Done: ${task.name}`}
              className="flex size-14 shrink-0 items-center justify-center rounded-full shadow-card transition-transform active:scale-90 disabled:opacity-50"
              style={{ backgroundColor: fill, color: onFill }}
            >
              <Check className="size-7" strokeWidth={3} aria-hidden />
            </button>
          ) : null}
        </div>
        {error && (
          <p className="pt-2 text-label text-bad" role="status">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      key={key}
      className="flex h-full animate-fade flex-col items-center justify-center gap-7 py-6 text-center"
    >
      {justDone ? (
        <>
          <span
            className="flex size-24 items-center justify-center rounded-full wide:size-32"
            style={{ backgroundColor: fill, color: onFill }}
          >
            <Check className="size-12 wide:size-16" strokeWidth={2.75} aria-hidden />
          </span>
          <div>
            <p className="font-display text-title text-ink">Nice.</p>
            <p className="mt-1 text-balance text-body text-ink-soft">{justDone.task.name}</p>
          </div>
          <Button onClick={session.undo} disabled={!justDone.canUndo}>
            <RotateCcw className="size-4" strokeWidth={2.25} aria-hidden />
            Undo
          </Button>
        </>
      ) : task ? (
        <>
          <div>
            {task.room && (
              <p className="mb-1 text-label font-semibold uppercase tracking-[0.08em] text-ink-faint">
                {task.room}
              </p>
            )}
            <h3 className="text-balance font-display text-heading leading-tight text-ink wide:text-date">
              {task.name}
            </h3>
          </div>
          {/* Disabled when the acting adult can't be resolved (HEARTH_ADULT_ID
              missing from TADA_MEMBERS): better visibly off than a dead tap. */}
          <button
            type="button"
            onClick={session.complete}
            disabled={!adult}
            aria-label={`Done: ${task.name}`}
            className="group flex flex-col items-center gap-2 disabled:opacity-50"
          >
            <span
              className="flex size-24 items-center justify-center rounded-full shadow-pop transition-transform group-active:scale-95 wide:size-32"
              style={{ backgroundColor: fill, color: onFill }}
            >
              <Check className="size-12 wide:size-16" strokeWidth={2.75} aria-hidden />
            </span>
            <span className="text-label font-semibold text-ink-soft">Done</span>
          </button>
        </>
      ) : (
        <>
          <Sparkles className="size-14 text-ink-faint" strokeWidth={1.5} aria-hidden />
          <p className="text-balance font-display text-heading leading-tight text-ink">
            {roomName ? `All caught up in the ${roomName}.` : "All caught up."}
          </p>
        </>
      )}
      {error && (
        <p className="text-label text-bad" role="status">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * What's been finished today, newest first. A celebration, never a tally: no
 * total, no denominator, no progress bar (D4).
 */
export function DoneToday({
  completions,
  color,
}: {
  completions: Completion[];
  color: string | null;
}) {
  const timeZone = useTimeZone();
  const textOn = useTextOn();
  if (completions.length === 0) {
    return <p className="text-body text-ink-faint">Nothing yet today. The first one lands here.</p>;
  }
  return (
    <ul className="flex min-h-0 flex-col divide-y divide-hairline overflow-y-auto">
      {completions.map((c) => (
        <li key={c.completionId} className="flex items-center gap-3 py-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: color ? `var(${colorVar(color)})` : "var(--color-ink-soft)",
              color: color && textOn(color) === "dark" ? "#27221c" : "#ffffff",
            }}
            aria-hidden
          >
            <Check className="size-4" strokeWidth={3} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body text-ink">{c.taskName}</span>
            {c.room && <span className="block text-stamp text-ink-faint">{c.room}</span>}
          </span>
          <span className="shrink-0 text-stamp tabular-nums text-ink-faint">
            {new Date(c.completedAt).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
              timeZone,
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}
