import { CalendarView } from "@/components/calendar/CalendarView";
import { requireAuthorizedPage } from "@/lib/auth";

// Calendar (spec §4.1). The auth guard MUST stay the first statement (Phase
// 0.1, load-bearing): it runs before any protected JSX is reached. All the
// calendar's own logic lives client-side in <CalendarView />, which fetches the
// self-authorizing /api/calendar handler.
export default async function CalendarPage() {
  await requireAuthorizedPage();
  return <CalendarView />;
}
