import { HomeView } from "@/components/home/HomeView";
import { requireAuthorizedPage } from "@/lib/auth";

// Home (the Today destination): the hub's home, and where every screen starts. The auth guard MUST
// stay the first statement (Phase 0.1): it runs before any protected JSX is
// reached, so an unauthenticated request has nothing to serialize.
export default async function TodayPage() {
  await requireAuthorizedPage();
  return <HomeView />;
}
