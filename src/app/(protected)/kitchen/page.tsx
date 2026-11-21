import { KitchenView } from "@/components/kitchen/KitchenView";
import { requireAuthorizedPage } from "@/lib/auth";

// Kitchen: the meal plan and the shopping list (spec §4.5–4.6). `?tab=shopping`
// opens a phone on the list (the old /shopping address redirects here). The
// auth guard MUST stay the first statement (Phase 0.1).
export default async function KitchenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuthorizedPage();
  const { tab } = await searchParams;
  return <KitchenView initialTab={tab === "shopping" ? "shopping" : "meals"} />;
}
