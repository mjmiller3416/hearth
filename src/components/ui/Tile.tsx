"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, Clock3, PlugZap, RefreshCw, type LucideIcon } from "lucide-react";
import { useTimeZone } from "@/components/common/TimeZone";
import type { UpstreamState } from "@/hooks/useUpstream";

// The tile every piece of household information sits in, plus the three states
// every integration shares. A tile has a tone (its color); the text inside it
// uses the contextual tokens (text-fg, bg-fill, ...), so the same content reads
// correctly on any tone, including paper (see globals.css).
//
// A source that is still loading, not set up, or not answering looks the same
// on every screen and never takes its neighbors down with it (spec §6.2).

export type TileTone = "glass" | "ocean" | "sky" | "sun" | "grape" | "leaf" | "paper";

const TONES: Record<TileTone, string> = {
  glass: "tile-glass",
  ocean: "tile-ocean",
  sky: "tile-sky",
  sun: "tile-sun",
  grape: "tile-grape",
  leaf: "tile-leaf",
  paper: "tile-paper paper",
};

export function Tile({
  tone = "glass",
  title,
  icon: Icon,
  href,
  action,
  stamp,
  watermark: Watermark,
  children,
  className = "",
  bodyClassName = "",
}: {
  tone?: TileTone;
  title?: ReactNode;
  icon?: LucideIcon;
  /** Makes the title a link to the full view. */
  href?: string;
  /** A control on the right of the title row. */
  action?: ReactNode;
  /** A stale "as of" stamp (see <AsOf>). */
  stamp?: ReactNode;
  /** A big faint icon in the corner, for character. */
  watermark?: LucideIcon;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const heading = (
    <span className="flex min-w-0 items-center gap-2.5">
      {Icon && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-fill-2">
          <Icon className="size-[1.15rem]" strokeWidth={2.25} aria-hidden />
        </span>
      )}
      <span className="truncate font-display text-lead font-medium leading-none">{title}</span>
      {href && <ChevronRight className="size-5 shrink-0 text-fg-faint" strokeWidth={2.5} aria-hidden />}
    </span>
  );
  return (
    <section className={`tile flex min-h-0 flex-col ${TONES[tone]} ${className}`}>
      {Watermark && <Watermark className="watermark" strokeWidth={1.5} aria-hidden />}
      {title && (
        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-1 pt-4 wide:px-6 wide:pt-5">
          {href ? (
            <Link href={href} className="-my-2 flex min-w-0 items-center py-2 text-fg">
              {heading}
            </Link>
          ) : (
            <h2 className="flex min-w-0 items-center text-fg">{heading}</h2>
          )}
          <span className="flex shrink-0 items-center gap-3">
            {stamp}
            {action}
          </span>
        </header>
      )}
      <div className={`min-h-0 flex-1 px-5 pb-5 pt-3 wide:px-6 ${bodyClassName}`}>{children}</div>
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
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-tiny text-fg-soft"
      role="status"
    >
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
          className="h-11 rounded-2xl bg-fill [animation:hearth-shimmer_1.6s_ease-in-out_infinite]"
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
  // Compact (a tile on Home): one quiet row, so a source that's down or empty
  // takes a line, not the screen.
  if (compact) {
    return (
      <div className="flex items-center gap-3 py-1.5">
        {Icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fill text-fg-soft">
            <Icon className="size-5" strokeWidth={2} aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-body leading-snug text-fg">{title}</p>
          {children && <p className="text-small text-fg-soft">{children}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
      {Icon && (
        <span className="mb-2 flex size-16 items-center justify-center rounded-full bg-fill text-fg">
          <Icon className="size-8" strokeWidth={1.75} aria-hidden />
        </span>
      )}
      <p className="font-display text-big text-fg">{title}</p>
      {children && <p className="max-w-[28rem] text-body text-fg-soft">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
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
          className="min-h-10 rounded-full bg-fill-2 px-4 text-small font-semibold text-fg active:scale-95"
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
