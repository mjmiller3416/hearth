import { ViewFrame } from "@/components/layout/ViewFrame";
import { Placeholder } from "@/components/common/Placeholder";
import { requireAuthorizedPage } from "@/lib/auth";

export default async function TasksPage() {
  await requireAuthorizedPage();
  return (
    <ViewFrame title="Tasks">
      <Placeholder label="Tasks" note="Tada! tasks arrive in Phase 2." />
    </ViewFrame>
  );
}
