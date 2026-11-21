import { getMembers } from "@/lib/calendar/config";
import { getAdultId, getTadaMembers, getMemberKeyForTadaId } from "@/lib/tada/config";
import { getMemberKeyForChild, getScheduleKids } from "@/lib/tandem/config";
import type { TandemChild } from "@/lib/tandem/types";

// The household as the whole app sees it: the MEMBERS list, plus what each
// connected app calls each person. SERVER-ONLY (reads env through the config
// modules); the (protected) layout hands the result to the client once, so a
// view can go from "Lincoln" to his Tada! id or his Tandem lane without asking.
//
// This is what lets one "who's looking" choice (the lens) mean the same person
// on the calendar, the school week, the chore list and the allowance card.

export interface HouseholdMember {
  /** The shared MEMBERS key, e.g. "lincoln". */
  key: string;
  name: string;
  /** Palette slug, resolving to var(--color-<slug>). */
  color: string;
  /** A kid has a Tada! kid role or a Tandem school lane; everyone else is an adult. */
  role: "adult" | "kid";
  /** This person's Tada! user id, when the wall may act as them. */
  tadaId: string | null;
  /** This person's Tandem lane, when they have a school week. */
  tandemChild: TandemChild | null;
  /** True for the adult whose cleaning session the wall runs (HEARTH_ADULT_ID). */
  cleans: boolean;
}

export interface Household {
  members: HouseholdMember[];
}

export function getHousehold(): Household {
  const tada = getTadaMembers().map((m) => ({ ...m, key: getMemberKeyForTadaId(m.id) }));
  const lanes = getScheduleKids().map((k) => ({
    child: k.child,
    key: getMemberKeyForChild(k.child),
  }));
  const adultId = getAdultId();

  const members = getMembers().map((m): HouseholdMember => {
    const t = tada.find((x) => x.key === m.key) ?? null;
    const lane = lanes.find((x) => x.key === m.key) ?? null;
    return {
      key: m.key,
      name: m.name,
      color: m.color,
      role: t?.role === "kid" || lane ? "kid" : "adult",
      tadaId: t?.id ?? null,
      tandemChild: lane?.child ?? null,
      cleans: t !== null && t.id === adultId,
    };
  });
  return { members };
}

/** The kids' MEMBERS keys (allowance balances are kept per kid). */
export function getKidKeys(): string[] {
  return getHousehold()
    .members.filter((m) => m.role === "kid")
    .map((m) => m.key);
}
