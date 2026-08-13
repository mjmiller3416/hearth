import { ViewFrame } from "@/components/layout/ViewFrame";
import { Placeholder } from "@/components/common/Placeholder";
import { requireAuthorizedPage } from "@/lib/auth";

export default async function RecipesPage() {
  await requireAuthorizedPage();
  return (
    <ViewFrame title="Recipes">
      <Placeholder label="Recipes" note="Saved recipes arrive in Phase 4." />
    </ViewFrame>
  );
}
