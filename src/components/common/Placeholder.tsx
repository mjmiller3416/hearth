// Quiet placeholder for the Phase 0 shell. Each view renders one until its own
// phase fills it with real content.

export function Placeholder({ label, note }: { label: string; note: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-display text-ink-soft">{label}</p>
      <p className="text-body text-ink-faint">{note}</p>
    </div>
  );
}
