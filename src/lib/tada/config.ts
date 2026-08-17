import type { TadaMember } from "./types";
import { getMemberByKey } from "@/lib/calendar/config";

// Hearth's Tada! people-and-attribution configuration (Phase 2). Server-side
// only — it reads environment variables and resolves colors from the shared
// MEMBERS list, so it must never be imported into a client component (the
// resolved members it produces are handed to the client through route payloads).
//
// The wall writes task completions as different people (spec §6.3): Maryann in
// her Clean session, each kid in their Chores column. The acting member is
// *attribution, not authentication* — the device token (TADA_DEVICE_TOKEN)
// carries the real authority; the member id only says whom to credit. Every
// completion is validated against the allowlist below before it is written, so a
// crafted request can't complete as an arbitrary Tada! user (checklist #7).
//
//   TADA_MEMBERS     JSON array of { memberKey, tadaUserId, role }. The set of
//                    people the wall may act as. `memberKey` links to the shared
//                    MEMBERS list for name + color (one color system across the
//                    app, spec §7); `tadaUserId` is that person's Tada! user id;
//                    `role` is "adult" or "kid".
//
//   HEARTH_ADULT_ID  The Tada! user id whose session the Clean view is — Maryann.
//                    Every Clean completion is attributed to this id, and
//                    done-today shows this id's completions (spec §5.3, checklist
//                    #5, #9). Must match a role:"adult" entry in TADA_MEMBERS.
//
// Malformed config is an operator error: log once and degrade to empty so the
// wall stays calm (spec §6.2), never crash.

interface TadaMemberConfig {
  memberKey: string;
  tadaUserId: string;
  role: "adult" | "kid";
}

// Zero-config fallback so local development and the mock work without any env
// set. Never reached in a real deploy, which always sets TADA_MEMBERS. The
// member keys mirror the calendar's FALLBACK_MEMBERS so colors resolve locally.
const FALLBACK_TADA_MEMBERS: TadaMemberConfig[] = [
  { memberKey: "maryann", tadaUserId: "u-maryann", role: "adult" },
  { memberKey: "lincoln", tadaUserId: "u-lincoln", role: "kid" },
  { memberKey: "ollie", tadaUserId: "u-ollie", role: "kid" },
];
const FALLBACK_ADULT_ID = "u-maryann";

let membersCache: TadaMember[] | null = null;
let membersByIdCache: Map<string, TadaMember> | null = null;
let membersWarned = false;
let colorWarned = false;

/** Resolve a member key to its shared name + color; degrade, never throw. */
function resolve(cfg: TadaMemberConfig): TadaMember {
  const shared = getMemberByKey(cfg.memberKey);
  if (!shared && !colorWarned) {
    console.error(
      `[tada] TADA_MEMBERS references memberKey "${cfg.memberKey}" absent from MEMBERS; ` +
        `it will render without a color. Add it to MEMBERS.`,
    );
    colorWarned = true;
  }
  return {
    id: cfg.tadaUserId,
    name: shared?.name ?? cfg.memberKey,
    color: shared?.color ?? cfg.memberKey,
    role: cfg.role,
  };
}

function parseConfig(): TadaMemberConfig[] {
  const raw = process.env.TADA_MEMBERS;
  if (!raw) return FALLBACK_TADA_MEMBERS;
  try {
    const parsed = JSON.parse(raw) as Array<{
      memberKey?: string;
      tadaUserId?: string;
      role?: string;
    }>;
    return parsed
      .filter(
        (m): m is TadaMemberConfig =>
          Boolean(m.memberKey) &&
          Boolean(m.tadaUserId) &&
          (m.role === "adult" || m.role === "kid"),
      )
      .map((m) => ({
        memberKey: m.memberKey,
        tadaUserId: m.tadaUserId,
        role: m.role,
      }));
  } catch (err) {
    if (!membersWarned) {
      console.error("[tada] TADA_MEMBERS is not valid JSON:", err);
      membersWarned = true;
    }
    return [];
  }
}

/** Every member the wall may act as, in config order (adults then kids). */
export function getTadaMembers(): TadaMember[] {
  if (membersCache) return membersCache;
  membersCache = parseConfig().map(resolve);
  return membersCache;
}

function membersById(): Map<string, TadaMember> {
  if (!membersByIdCache) {
    membersByIdCache = new Map(getTadaMembers().map((m) => [m.id, m]));
  }
  return membersByIdCache;
}

/**
 * The acting-member allowlist gate (checklist #7). True only when the id names a
 * configured member — the wall may complete as the kids and Maryann, nobody
 * else. Sourced from config, never hardcoded in a component (manual setup #3).
 */
export function isAllowedMember(id: string): boolean {
  return membersById().has(id);
}

/** The kids, for the Chores columns (checklist #12). */
export function getKids(): TadaMember[] {
  return getTadaMembers().filter((m) => m.role === "kid");
}

/** The Tada! user id whose session the Clean view is (Maryann). */
export function getAdultId(): string {
  return process.env.HEARTH_ADULT_ID?.trim() || FALLBACK_ADULT_ID;
}

/** The adult member behind the Clean session, resolved for display, or null. */
export function getAdultMember(): TadaMember | null {
  return membersById().get(getAdultId()) ?? null;
}

/** True when the Tada! API base URL and device token are both configured. */
export function hasTadaCredentials(): boolean {
  return Boolean(process.env.TADA_API_URL && process.env.TADA_DEVICE_TOKEN);
}
