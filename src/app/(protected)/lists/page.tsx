import { ViewFrame } from "@/components/layout/ViewFrame";
import { Placeholder } from "@/components/common/Placeholder";
import { requireAuthorizedPage } from "@/lib/auth";

export default async function ListsPage() {
  await requireAuthorizedPage();
  return (
    <ViewFrame title="Lists">
      <Placeholder label="Lists" note="Tada! lists arrive in Phase 3." />
    </ViewFrame>
  );
}
