import type { ReactNode } from "react";
import { StaleIndicator } from "@/components/common/StaleIndicator";

// Shared wrapper for every view: consistent padding, a confident title, and a
// fixed slot (top-right) for per-view actions and the stale stamp. Later phases
// only supply `title` and `children` (spec Phase 0 #10).
export function ViewFrame({
  title,
  children,
  actions,
  filters,
  titleHidden = false,
  isStale = false,
  lastUpdated = null,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  /** Optional controls that sit on the title row, between the title and actions
   *  (e.g. the calendar's member filter chips — Phase 2 #1). Scrolls if wide. */
  filters?: ReactNode;
  /**
   * Hide the visible title but keep it for assistive tech (the calendar drops
   * "August 2026" so the row is just tags-left / controls-right — Phase 2). The
   * filters then align to the left where the title used to sit.
   */
  titleHidden?: boolean;
  isStale?: boolean;
  lastUpdated?: number | null;
}) {
  return (
    <section className="flex h-full flex-col px-10 pb-8 pt-7">
      <header className="mb-6 flex items-center justify-between gap-6">
        {titleHidden ? (
          <h1 className="sr-only">{title}</h1>
        ) : (
          <h1 className="shrink-0 font-display text-heading leading-none text-ink">
            {title}
          </h1>
        )}
        {filters && (
          <div className="flex min-w-0 flex-1 items-center overflow-x-auto">
            {filters}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-6">
          {actions}
          <StaleIndicator isStale={isStale} lastUpdated={lastUpdated} />
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
