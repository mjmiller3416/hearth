"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, Clock3, PlugZap, RefreshCw, type LucideIcon } from "lucide-react";
import { useTimeZone } from "@/components/common/TimeZone";
import type { UpstreamState } from "@/hooks/useUpstream";

// The card every piece of household information sits in, plus the three states
// every integration shares. A source that is still loading, not set up, or not
// answering looks the same on every screen and never takes its neighbors down
// with it (spec §6.2): the rest of the page keeps working.

export function Card({
  title,
  icon: Icon,
  href,
  action,
  stamp,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  /** Makes the title a link to the full view. */
  href?: string;
  /** A control on the right of the title row. */
  action?: ReactNode;
  /** A stale "as of" stamp (see <AsOf>). */
  stamp?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const heading = (
    <span className="flex min-w-0 items-center gap-2.5">
      {Icon && <Icon className="size-5 shrink-0 text-ink-faint" strokeWidth={2} aria-hidden />}
      <span className="truncate text-label font-semibold uppercase tracking-[0.08em] text-ink-soft">
        {title}
      </span>
      {href && <ChevronRight className="size-4 shrink-0 text-ink-faint" strokeWidth={2.5} aria-hidden />}
    </span>
  );
  return (
    <section
      className={`flex min-h-0 flex-col rounded-[1.5rem] bg-surface shadow-card ring-1 ring-hairline/70 ${className}`}
    >
      {title && (
        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-1 pt-4 wide:px-6 wide:pt-5">
          {href ? (
            <Link href={href} className="-my-2 flex min-w-0 items-center py-2">
              {heading}
            </Link>
          ) : (
            <h2 className="flex min-w-0 items-center">{heading}</h2>
          )}
          <span className="flex shrink-0 items-center gap-3">
            {stamp}
            {action}
          </span>
        </header>
      )}
      <div className={`min-h-0 flex-1 px-5 pb-5 pt-2 wide:px-6 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** Quiet "as of 8:14" stamp, shown only once a source has gone stale. */
export function AsOf({
  isStale,
  lastUpdated,
}: {
  isStale: boolean;
  lastUpdated: number | null;
}) {
  const timeZone = useTimeZone();
  if (!isStale || lastUpdated == null) return null;
  const time = new Date(lastUpdated).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
  return (
    <span className="inline-flex items-center gap-1.5 text-stamp text-ink-faint" role="status">
      <Clock3 className="size-4" aria-hidden />
      as of {time}
    </span>
  );
}

/** Placeholder rows while a source loads for the first time. */
export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 py-1" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-11 rounded-2xl bg-surface-2 [animation:hearth-shimmer_1.6s_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 120}ms`, width: `${92 - i * 14}%` }}
        />
      ))}
    </div>
  );
}

/** A centered message: an empty list, a rest state, a calm notice. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  compact = false,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  // Compact (a card on Today): one quiet row, so a source that's down or empty
  // takes a line, not the screen.
  if (compact) {
    return (
      <div className="flex items-center gap-3 py-2">
        {Icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
            <Icon className="size-5" strokeWidth={1.75} aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-body leading-snug text-ink-soft">{title}</p>
          {children && <p className="text-label text-ink-faint">{children}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
      {Icon && (
        <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
          <Icon className="size-6" strokeWidth={1.75} aria-hidden />
        </span>
      )}
      <p className="font-display text-title text-ink-soft">{title}</p>
      {children && <p className="max-w-[28rem] text-label text-ink-faint">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A source that isn't set up on this Hearth yet. Never an error (spec §6.2). */
export function NotConnected({
  app,
  what,
  compact = false,
}: {
  /** The app's name, e.g. "Tada!". */
  app: string;
  /** What would show here, e.g. "The kids' chores". */
  what: string;
  compact?: boolean;
}) {
  return (
    <EmptyState icon={PlugZap} title={`${app} isn't connected`} compact={compact}>
      {compact ? (
        <>{what} will show here once it is.</>
      ) : (
        <>{what} will show here once it is. See Settings for what&rsquo;s connected.</>
      )}
    </EmptyState>
  );
}

/** A source that has never answered. It keeps retrying; this just says so. */
export function LoadError({
  app,
  onRetry,
  compact = false,
}: {
  app: string;
  onRetry: () => void;
  compact?: boolean;
}) {
  return (
    <EmptyState
      icon={RefreshCw}
      title={`Can't reach ${app} right now`}
      compact={compact}
      action={
        <button
          type="button"
          onClick={onRetry}
          className="min-h-10 rounded-full bg-surface-2 px-4 text-label font-semibold text-ink ring-1 ring-inset ring-hairline-strong"
        >
          Try again
        </button>
      }
    >
      {compact ? "Hearth keeps trying." : "Hearth keeps trying every minute. Everything else still works."}
    </EmptyState>
  );
}

/**
 * Renders the right one of loading / not connected / unreachable / the content,
 * for a source polled with useUpstream. `configured` comes from the payload.
 */
export function SourceGate<T>({
  state,
  configured,
  app,
  what,
  rows,
  compact,
  children,
}: {
  state: UpstreamState<T>;
  configured: boolean;
  app: string;
  what: string;
  rows?: number;
  compact?: boolean;
  children: ReactNode;
}) {
  if (state.failed) return <LoadError app={app} onRetry={() => void state.refetch()} compact={compact} />;
  if (state.isLoading) return <Loading rows={rows} />;
  if (!configured) return <NotConnected app={app} what={what} compact={compact} />;
  return <>{children}</>;
}
