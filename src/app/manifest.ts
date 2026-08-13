import type { MetadataRoute } from "next";
import { appConfig } from "@/lib/config";

// PWA manifest (Phase 0 #12). display: fullscreen so the kiosk browser shows no
// chrome; the app is only ever the whole screen on a wall.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appConfig.appName,
    short_name: appConfig.appName,
    description: "The household wall display.",
    start_url: appConfig.defaultRoute,
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#f4efe4",
    theme_color: "#f4efe4",
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
