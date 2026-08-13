import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";

// Device authorization. There is no user login: the wall is authorized once by
// visiting
//   /setup?token=<HEARTH_DEVICE_TOKEN>
// which sets the long-lived httpOnly cookie this module verifies.
//
// SECURITY (Phase 0.1): authorization lives HERE, not in middleware/proxy.
// Middleware path matching and the App Router's actual route resolution can
// disagree about what a path is — crafted `.rsc` and segment-prefetch URLs
// resolve to the same page without matching the intended rule
// (CVE-2026-44575 / CVE-2026-45109). So every protected surface verifies for
// itself instead of trusting a gate upstream of the route:
//   - protected pages, via the (protected) layout server component, whose check
//     runs during RSC render and therefore also covers the .rsc and
//     segment-prefetch variants of the same route;
//   - every route handler under app/api/, via requireDevice() as its first
//     statement, before any body parsing.

export const DEVICE_COOKIE = "hearth_device";

// ~400 days: the practical browser cap for a persistent cookie. Effectively
// "forever" for a device that lives on a wall.
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

/**
 * Constant-time token comparison. Guards for unequal lengths first — both
 * because `timingSafeEqual` throws on mismatched buffer lengths, and because a
 * missing value must fail cleanly rather than error. Returns false whenever
 * either side is missing or empty.
 */
export function tokensMatch(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * True when the request carries a device cookie matching HEARTH_DEVICE_TOKEN.
 * Reads the cookie during the current server render/request, so it resolves
 * identically for a page navigation and for its `.rsc` / segment-prefetch
 * variants. Returns false when either the cookie or the env token is absent.
 */
export async function isAuthorizedDevice(): Promise<boolean> {
  const expected = process.env.HEARTH_DEVICE_TOKEN;
  const store = await cookies();
  const presented = store.get(DEVICE_COOKIE)?.value;
  return tokensMatch(presented, expected);
}

/**
 * Page gate. Must be `await`ed as the FIRST statement of every protected page
 * server component — before it returns any protected JSX:
 *
 *   export default async function CalendarPage() {
 *     await requireAuthorizedPage();
 *     return <ViewFrame …>…</ViewFrame>;
 *   }
 *
 * SECURITY (Phase 0.1, load-bearing): the (protected) layout gate is NOT enough
 * on its own. A layout `redirect()` stops the layout's own chrome from
 * rendering, but Next renders each page as an independent segment, so on a
 * full-document request the page's RSC flight is still serialized into the 307
 * redirect document — leaking the rendered page to an unauthenticated client.
 * Gating inside the page means the protected JSX is never reached, so there is
 * nothing to serialize. Keep BOTH gates: the layout keeps the pure
 * `.rsc`/segment-prefetch surface empty; this keeps the full-document body empty.
 */
export async function requireAuthorizedPage(): Promise<void> {
  if (!(await isAuthorizedDevice())) redirect("/setup");
}

/**
 * Route-handler gate. Returns a bare 401 `Response` when the device is not
 * authorized, or `null` when it is. Call as the first statement in every
 * handler under app/api/, before reading the request body:
 *
 *   const denied = await requireDevice();
 *   if (denied) return denied;
 */
export async function requireDevice(): Promise<Response | null> {
  if (await isAuthorizedDevice()) return null;
  return new Response("Unauthorized", { status: 401 });
}
