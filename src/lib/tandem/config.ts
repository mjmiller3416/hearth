import { getMemberByKey } from "@/lib/calendar/config";
import type { ScheduleKid, TandemChild } from "./types";

// Hearth's Tandem configuration (Schedule view). Server-side only: it reads
// environment variables and must never be imported into a client component.
//
// Tandem is a separate Railway project whose backend has no public URL, so Hearth
// calls Tandem's FRONTEND origin, whose /api/* proxy forwards to the backend.
// Tandem authenticates Hearth with a shared secret in the `X-API-Key` header (its
// HEARTH_API_KEY). The secret lives in `TANDEM_API_KEY` here, and its value must
// equal Tandem's HEARTH_API_KEY. It is sent server-to-server only and never
// reaches the browser (spec §3.2).

/** True when the Tandem base URL and API key are both configured. */
export function hasTandemCredentials(): boolean {
  return Boolean(process.env.TANDEM_API_URL && process.env.TANDEM_API_KEY);
}

// Tandem's child keys → Hearth MEMBERS keys. Tandem calls Lincoln "link".
const LANES: { child: TandemChild; memberKey: string; fallbackName: string }[] = [
  { child: "link", memberKey: "lincoln", fallbackName: "Lincoln" },
  { child: "ollie", memberKey: "ollie", fallbackName: "Ollie" },
];

/** The two lanes, in Tandem's order, named and colored from MEMBERS. */
export function getScheduleKids(): ScheduleKid[] {
  return LANES.map(({ child, memberKey, fallbackName }) => {
    const member = getMemberByKey(memberKey);
    return {
      child,
      name: member?.name ?? fallbackName,
      color: member?.color ?? memberKey,
    };
  });
}
