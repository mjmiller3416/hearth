import { ShoppingView } from "@/components/shopping/ShoppingView";
import { requireAuthorizedPage } from "@/lib/auth";

// The household shopping list (Phase 4, spec §4.6, D6), from Enchanted Spoon,
// with an "add an item" field. The gate is the FIRST statement
// (src/lib/auth.ts, Phase 0.1). All view logic and polling live in the client
// component.
export default async function ShoppingPage() {
  await requireAuthorizedPage();
  return <ShoppingView />;
}
