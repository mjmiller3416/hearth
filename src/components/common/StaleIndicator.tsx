import { Clock3 } from "lucide-react";

// Quiet "as of H:MM" stamp. Renders nothing until data is actually stale, so a
// healthy view shows no chrome at all (spec §6.2 — "a small timestamp, not a
// red banner"). Used everywhere via <ViewFrame />.

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StaleIndicator({
  isStale,
  lastUpdated,
}: {
  isStale: boolean;
  lastUpdated: number | null;
}) {
  if (!isStale || lastUpdated == null) return null;

  return (
    <span
      className="inline-flex items-center gap-2 text-stamp text-ink-faint"
      role="status"
      aria-live="polite"
    >
      <Clock3 className="size-5" aria-hidden />
      as of {formatTime(lastUpdated)}
    </span>
  );
}
