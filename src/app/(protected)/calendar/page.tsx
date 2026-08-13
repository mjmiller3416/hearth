import { ViewFrame } from "@/components/layout/ViewFrame";
import { Placeholder } from "@/components/common/Placeholder";
import { requireAuthorizedPage } from "@/lib/auth";

export default async function CalendarPage() {
  await requireAuthorizedPage();
  return (
    <ViewFrame title="Calendar">
      <Placeholder
        label="Calendar"
        note="The family calendar arrives in Phase 1."
      />
    </ViewFrame>
  );
}
