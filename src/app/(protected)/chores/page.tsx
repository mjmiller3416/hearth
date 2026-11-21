import { ChoresView } from "@/components/tasks/ChoresView";
import { requireAuthorizedPage } from "@/lib/auth";

// Chores: the kids' checklists and Maryann's cleaning session (spec §4.2–4.3).
// `?view=clean` opens on the session (the old /clean address redirects here).
// The auth guard MUST stay the first statement (Phase 0.1).
export default async function ChoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuthorizedPage();
  const { view } = await searchParams;
  return <ChoresView initialMode={view === "clean" ? "clean" : view === "kids" ? "kids" : null} />;
}
