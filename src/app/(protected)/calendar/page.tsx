import { CalendarView } from "@/components/calendar/CalendarView";
import { requireAuthorizedPage } from "@/lib/auth";

// Calendar — the one view this household already lives on (spec §4.1), and the
// app's default route. The auth guard MUST stay the first statement (Phase 0.1,
// load-bearing): it runs before any protected JSX is reached, so an
// unauthenticated full-document request has nothing to serialize. All the
// calendar's own logic lives client-side in <CalendarView />, which fetches the
// self-authorizing /api/calendar handler.
export default async function CalendarPage() {
  await requireAuthorizedPage();
  return <CalendarView />;
}
