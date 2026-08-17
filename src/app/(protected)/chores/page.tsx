import { ChoresView } from "@/components/tasks/ChoresView";
import { requireAuthorizedPage } from "@/lib/auth";

// The kids' chores checklist (Phase 2, spec §4.3, D5). The gate is the FIRST
// statement — see src/lib/auth.ts (Phase 0.1). All view logic and polling live in
// the client component.
export default async function ChoresPage() {
  await requireAuthorizedPage();
  return <ChoresView />;
}
