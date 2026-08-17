// Shared Tada! types for Phase 2 (Clean & Chores). Deliberately free of any
// server-only import so both the route handlers and the client views can import
// them.
//
// Tada! owns the decay math and picks the task (spec D4). Hearth renders the
// *result* and never the reasoning: these shapes carry NO decay ratio, decay
// band, priority number, streak, badge, or star. That is not an oversight — it
// is the load-bearing constraint of this phase enforced at the data layer, so a
// future component literally cannot render "what's left" or "how dirty" (D4,
// checklist item 18). The score exists in Tada!; it is dropped here on purpose.

/**
 * One household member the wall may act as (spec §6.3). `id` is the member's
 * Tada! user id — attribution, not authentication; the device token carries the
 * real authority (§5.3). `color` is a Hearth palette slug resolving to
 * `var(--color-<slug>)`, sourced from the shared MEMBERS list so task columns
 * and calendar chips share one color system (spec §7).
 */
export interface TadaMember {
  /** The member's Tada! user id — the acting-member id sent on a completion. */
  id: string;
  name: string;
  /** Palette slug → var(--color-<slug>). */
  color: string;
  role: "adult" | "kid";
}

/**
 * The single task Tada! surfaces for the Clean session (spec D4, checklist #3).
 * One task, never a queue. `room` is the room name for display, or null for a
 * whole-house pick. No score — Hearth shows the task, not why it was chosen.
 */
export interface SessionTask {
  id: string;
  name: string;
  room: string | null;
}

/**
 * A room the Clean session can be scoped to (checklist #4). Name only — no decay
 * band or due count, which would leak a backlog signal onto the picker.
 */
export interface Room {
  id: string;
  name: string;
}

/**
 * One entry in Clean's done-today celebration (checklist #5, #11). Name, room,
 * and time — and nothing that could read as a total or a fraction (D4). The
 * `completionId` is carried only so a just-landed completion can be undone
 * (Q5); it is not rendered.
 */
export interface Completion {
  completionId: string;
  taskName: string;
  room: string | null;
  /** ISO 8601 instant the task was completed. */
  completedAt: string;
}

/**
 * One chore in a kid's column (checklist #6, #12). `done` splits the column into
 * outstanding (tappable) and completed rows. No score, no streak.
 */
export interface KidChore {
  id: string;
  name: string;
  done: boolean;
  /** Present on a completed chore, so the row can offer Undo (Q5). */
  completionId?: string;
}

/** One kid's column in the Chores view: the kid plus their chores for today. */
export interface KidChores {
  kid: TadaMember;
  chores: KidChore[];
}

// ── Route payloads (server → client) ────────────────────────────────────────

/**
 * GET /api/tasks/rooms. The Clean view's context: the rooms to scope by and the
 * adult whose session this is (Maryann, HEARTH_ADULT_ID) — the acting member for
 * every completion made here. `configured` is false when Tada! isn't wired yet,
 * so the view renders a calm "not connected" state rather than an error (§6.2).
 */
export interface RoomsPayload {
  rooms: Room[];
  adult: TadaMember | null;
  configured: boolean;
}

/** GET /api/tasks/next?room=<id>. The one session task, or null when caught up. */
export interface NextTaskPayload {
  task: SessionTask | null;
}

/** GET /api/tasks/done-today. Maryann's completions today, reverse-chronological. */
export interface DoneTodayPayload {
  completions: Completion[];
}

/** GET /api/tasks/kids. One column per kid. `configured` as in RoomsPayload. */
export interface ChoresPayload {
  kids: KidChores[];
  configured: boolean;
}

// ── Write contracts (client → server) ───────────────────────────────────────

/**
 * POST /api/tasks/complete. `memberId` is the acting member — Maryann for the
 * Clean session, the column's kid for Chores. The server validates it against
 * the acting-member allowlist before writing (checklist #7), then completes with
 * `source="hearth"`.
 */
export interface CompleteBody {
  taskId: string;
  memberId: string;
}

/** The completion id, returned so the write can be undone within the day (Q5). */
export interface CompleteResult {
  completionId: string;
}

/** POST /api/tasks/undo. Reverses a completion made from the wall (Q5). */
export interface UndoBody {
  completionId: string;
  memberId: string;
}
