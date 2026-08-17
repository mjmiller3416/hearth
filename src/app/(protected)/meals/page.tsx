import { MealsView } from "@/components/meals/MealsView";
import { requireAuthorizedPage } from "@/lib/auth";

// The week's meal plan (Phase 4, spec §4.5, D6) — read-only, from Enchanted
// Spoon. The gate is the FIRST statement (src/lib/auth.ts, Phase 0.1). All view
// logic and polling live in the client component.
export default async function MealsPage() {
  await requireAuthorizedPage();
  return <MealsView />;
}
