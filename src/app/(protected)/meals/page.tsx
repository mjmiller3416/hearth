import { ViewFrame } from "@/components/layout/ViewFrame";
import { Placeholder } from "@/components/common/Placeholder";
import { requireAuthorizedPage } from "@/lib/auth";

export default async function MealsPage() {
  await requireAuthorizedPage();
  return (
    <ViewFrame title="Meals">
      <Placeholder label="Meals" note="The week’s meal plan arrives in Phase 4." />
    </ViewFrame>
  );
}
