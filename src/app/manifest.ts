import type { MetadataRoute } from "next";
import { appConfig } from "@/lib/config";

// PWA manifest. Fullscreen on the wall's kiosk browser, a standalone app when
// added to a phone's home screen (browsers fall back from fullscreen to
// standalone), and free to rotate: the wall is landscape, a phone is not.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appConfig.appName,
    short_name: appConfig.appName,
    description: "The family hub.",
    start_url: appConfig.defaultRoute,
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    orientation: "any",
    background_color: "#f5f0e6",
    theme_color: "#f5f0e6",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
