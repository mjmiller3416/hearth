"use client";

import { useEffect } from "react";

// Route-level error boundary. A wall showing a stack trace is worse than one
// showing yesterday's data (spec §6.2). This renders a quiet neutral state and
// silently retries — never a raw error, never a required tap to recover. The
// real "keep last good data" behavior lives in useUpstream; this is the
// backstop for render-time failures.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log for server-side diagnostics; nothing surfaces to the screen.
    console.error(error);
    const id = setTimeout(() => reset(), 5000);
    return () => clearTimeout(id);
  }, [error, reset]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-ground text-center">
      <p className="font-display text-display text-ink-soft">One moment…</p>
      <p className="text-body text-ink-faint">Reconnecting.</p>
    </div>
  );
}
