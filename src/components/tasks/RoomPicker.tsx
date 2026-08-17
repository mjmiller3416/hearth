"use client";

import { Home } from "lucide-react";
import type { Room } from "@/lib/tada/types";

// The Clean session's room picker (Phase 2 #8). "Whole house" by default, or tap
// a room to scope the session to where Maryann is standing. Rooms are places, not
// people, so these pills stay neutral — saturation is reserved for members (spec
// §7). The active scope fills with ink so the current scope reads at a glance.
//
// Deliberately shows NO per-room due count or decay band: a count on the picker
// would leak the backlog the Clean view exists to hide (spec D4).

function Pill({
  active,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={[
        "flex shrink-0 items-center gap-2.5 rounded-full px-5 py-2.5 text-label font-medium transition-colors",
        active
          ? "bg-ink text-surface"
          : "bg-surface text-ink-soft shadow-[inset_0_0_0_1px_var(--color-hairline)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function RoomPicker({
  rooms,
  activeRoomId,
  onSelect,
}: {
  rooms: Room[];
  /** null = whole house. */
  activeRoomId: string | null;
  onSelect: (roomId: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto">
      <Pill
        active={activeRoomId === null}
        ariaLabel="Whole house"
        onClick={() => onSelect(null)}
      >
        <Home className="size-5" strokeWidth={2} aria-hidden />
        Whole house
      </Pill>
      {rooms.map((room) => (
        <Pill
          key={room.id}
          active={room.id === activeRoomId}
          ariaLabel={room.name}
          onClick={() => onSelect(room.id)}
        >
          {room.name}
        </Pill>
      ))}
    </div>
  );
}
