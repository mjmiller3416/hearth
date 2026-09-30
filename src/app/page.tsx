import { redirect } from "next/navigation";
import { connection } from "next/server";
import { appConfig } from "@/lib/config";
import { resolveTimeZone } from "@/lib/calendar/recurrence";
import { currentSlot } from "@/lib/viewSchedule";

// `/` forwards to whichever view the timed schedule (VIEW_SCHEDULE) says is due
// right now, by the household clock; with no schedule, the resting Calendar.
// `connection()` keeps this per-request — otherwise the build would prerender
// the redirect with the build's time baked in.
export default async function Home() {
  await connection();
  redirect(currentSlot(new Date(), resolveTimeZone())?.href ?? appConfig.defaultRoute);
}
