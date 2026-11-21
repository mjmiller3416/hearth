"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { HouseholdMember } from "@/lib/household";
import { setPref, usePref } from "@/lib/prefs";

// The household and the lens.
//
// The lens is the app's one "who's looking" choice. Nobody selected is the
// shared view: everything for everyone, the right thing for a wall across the
// room. Pick a person and every screen narrows to them: their events, their
// school day, their chores, their allowance. A phone remembers its lens, so a
// kid's phone opens on that kid's day; a shared screen forgets it when left
// alone (IdleHome).
//
// The lens is attribution, not authentication (spec §6.3): the household trusts
// whoever is holding the device, exactly as it does for checking off a chore.

interface HouseholdValue {
  members: HouseholdMember[];
  /** The selected person, or null for everyone. */
  lens: HouseholdMember | null;
  setLens: (key: string | null) => void;
  /** Look a member up by MEMBERS key. */
  byKey: (key: string) => HouseholdMember | undefined;
}

const HouseholdContext = createContext<HouseholdValue>({
  members: [],
  lens: null,
  setLens: () => {},
  byKey: () => undefined,
});

export function HouseholdProvider({
  members,
  children,
}: {
  members: HouseholdMember[];
  children: ReactNode;
}) {
  const stored = usePref("lens");
  const setLens = useCallback((key: string | null) => setPref("lens", key), []);

  const value = useMemo<HouseholdValue>(() => {
    const map = new Map(members.map((m) => [m.key, m]));
    return {
      members,
      // A stored key that no longer names a member is simply "everyone".
      lens: stored ? map.get(stored) ?? null : null,
      setLens,
      byKey: (key) => map.get(key),
    };
  }, [members, stored, setLens]);

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdValue {
  return useContext(HouseholdContext);
}
