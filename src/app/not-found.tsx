import Link from "next/link";
import { appConfig } from "@/lib/config";

// Quiet 404. On a wall there is no "back button" mental model, so this just
// offers a calm way back to the resting view.
export default function NotFound() {
  return (
    <div className="scene flex h-dvh flex-col items-center justify-center gap-5 text-center text-fg">
      <p className="font-display text-huge font-medium">Nothing here</p>
      <Link
        href={appConfig.defaultRoute}
        className="rounded-full bg-accent px-6 py-3 text-body font-semibold text-on-accent"
      >
        Back home
      </Link>
    </div>
  );
}
