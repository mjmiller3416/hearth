import { ScheduleView } from "@/components/schedule/ScheduleView";
import { requireAuthorizedPage } from "@/lib/auth";

// Lincoln's and Ollie's school week, read-only, from Tandem. The gate is the
// FIRST statement (src/lib/auth.ts, Phase 0.1). All view logic and polling live
// in the client component.
export default async function SchedulePage() {
  await requireAuthorizedPage();
  return <ScheduleView />;
}
