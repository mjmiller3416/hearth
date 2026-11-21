import { SchoolView } from "@/components/schedule/SchoolView";
import { requireAuthorizedPage } from "@/lib/auth";

// School: Lincoln's and Ollie's Monday–Friday week from Tandem, read-only. The
// auth guard MUST stay the first statement (Phase 0.1).
export default async function SchoolPage() {
  await requireAuthorizedPage();
  return <SchoolView />;
}
