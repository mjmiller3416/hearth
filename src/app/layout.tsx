import type { Metadata, Viewport } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import "./globals.css";
import { KioskGuards } from "@/components/common/KioskGuards";
import { appConfig, NIGHT_END, NIGHT_START } from "@/lib/config";

// A clean geometric face for the clock, titles and big numerals; a friendly,
// very legible face for everything else. Loaded via next/font so there are no
// external font requests at runtime: a wall that briefly loses its network
// keeps its type.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Sets <html data-theme> before the first paint, from this device's stored
// choice, what kind of screen it is and (for a shared screen on Auto) the hour.
// It mirrors resolveTheme() in ScreenKeepers, which takes over after hydration
// and keeps it right (using the household's timezone; this uses the device's
// own clock, which is close enough for one paint). Plain ES5 on purpose: it
// runs before anything else loads.
const THEME_SCRIPT = `(function(){try{var s=localStorage,c=s.getItem("hearth.theme"),f=s.getItem("hearth.device"),k=false;if(c==="dark")k=true;else if(c!=="light"){var w=f==="wall"||(f!=="personal"&&innerWidth>=900&&(matchMedia("(pointer: coarse)").matches||navigator.maxTouchPoints>0)&&!matchMedia("(any-pointer: fine)").matches);if(w){var d=new Date(),t=d.getHours()*60+d.getMinutes(),a=${toMinutes(NIGHT_START)},b=${toMinutes(NIGHT_END)};k=a>b?(t>=a||t<b):(t>=a&&t<b)}else k=matchMedia("(prefers-color-scheme: dark)").matches}document.documentElement.dataset.theme=k?"dark":"light"}catch(e){}})()`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom is an accidental-touch hazard on a wall (Phase 0 #14).
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2f7ff0",
};

export const metadata: Metadata = {
  applicationName: appConfig.appName,
  title: appConfig.appName,
  description: "The family hub.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  // Home-screen app on a phone, kiosk on the wall.
  appleWebApp: { capable: true, title: appConfig.appName, statusBarStyle: "default" },
  other: { "mobile-web-app-capable": "yes" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme is set before first paint by the inline script, so the
    // attribute legitimately differs from the server render.
    // The font variables go on <html>: the theme's --font-display / --font-body
    // are defined at :root and reference them, so they must resolve there. (On
    // <body> they were out of reach, and the app fell back to system fonts.)
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${dmSans.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        <KioskGuards />
        {children}
      </body>
    </html>
  );
}
