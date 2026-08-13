import type { ReactNode } from "react";
import { StaleIndicator } from "@/components/common/StaleIndicator";

// Shared wrapper for every view: consistent padding, a confident title, and a
// fixed slot (top-right) for per-view actions and the stale stamp. Later phases
// only supply `title` and `children` (spec Phase 0 #10).
export function ViewFrame({
  title,
  children,
  actions,
  isStale = false,
  lastUpdated = null,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  isStale?: boolean;
  lastUpdated?: number | null;
}) {
  return (
    <section className="flex h-full flex-col px-10 pb-8 pt-7">
      <header className="mb-6 flex items-center justify-between gap-6">
        <h1 className="font-display text-heading leading-none text-ink">
          {title}
        </h1>
        <div className="flex items-center gap-6">
          {actions}
          <StaleIndicator isStale={isStale} lastUpdated={lastUpdated} />
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
