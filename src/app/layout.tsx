import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { KioskGuards } from "@/components/common/KioskGuards";
import { appConfig } from "@/lib/config";

// Characterful display face for dates and headings; clean face for everything
// else (spec §7). Loaded via next/font so there are no external font requests
// at runtime — important for a device that may briefly lose network.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom is an accidental-touch hazard on a wall (Phase 0 #14).
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f4efe4",
};

export const metadata: Metadata = {
  applicationName: appConfig.appName,
  title: appConfig.appName,
  description: "The household wall display.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  // PWA / kiosk hints.
  appleWebApp: { capable: true, title: appConfig.appName, statusBarStyle: "default" },
  other: { "mobile-web-app-capable": "yes" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${inter.variable} antialiased`}>
        <KioskGuards />
        {children}
      </body>
    </html>
  );
}
