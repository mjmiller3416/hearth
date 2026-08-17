import { CleanView } from "@/components/tasks/CleanView";
import { requireAuthorizedPage } from "@/lib/auth";

// Maryann's guided cleaning session (Phase 2, spec §4.2, D4). The gate is the
// FIRST statement — see src/lib/auth.ts (Phase 0.1). All view logic and polling
// live in the client component.
export default async function CleanPage() {
  await requireAuthorizedPage();
  return <CleanView />;
}
