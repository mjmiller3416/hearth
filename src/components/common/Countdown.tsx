"use client";

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { CalendarEvent } from "@/lib/calendar/types";

// The one countdown event the app chrome shows — the calendar's soonest
// upcoming countdown (D10), lifted out of the view so the main header can
// render it live. The calendar owns the data (it is the only view that fetches
// events): it publishes its pick here while mounted and clears it on unmount;
// the header only reads. Two contexts so the calendar, which only writes, never
// re-renders when the value changes.

type Setter = Dispatch<SetStateAction<CalendarEvent | null>>;

const CountdownEventContext = createContext<CalendarEvent | null>(null);
const CountdownSetterContext = createContext<Setter>(() => {});

export function CountdownProvider({ children }: { children: ReactNode }) {
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  return (
    <CountdownSetterContext.Provider value={setEvent}>
      <CountdownEventContext.Provider value={event}>
        {children}
      </CountdownEventContext.Provider>
    </CountdownSetterContext.Provider>
  );
}

/** The event currently counting down in the header, or null. */
export function useCountdownEvent(): CalendarEvent | null {
  return useContext(CountdownEventContext);
}

/** The calendar's write handle. Stable across renders (a React state setter). */
export function useSetCountdownEvent(): Setter {
  return useContext(CountdownSetterContext);
}
