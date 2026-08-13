import Link from "next/link";
import { appConfig } from "@/lib/config";

// Quiet 404. On a wall there is no "back button" mental model, so this just
// offers a calm way back to the resting view.
export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-ground text-center text-ink">
      <p className="font-display text-display text-ink-soft">Nothing here</p>
      <Link href={appConfig.defaultRoute} className="text-body text-ink-faint underline">
        Back to Calendar
      </Link>
    </div>
  );
}
