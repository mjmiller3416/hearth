import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PreviewHarness } from "@/components/dev/PreviewHarness";

// Dev-only wall preview harness — visit /dev/preview while running `next dev`.
//
// Deliberately OUTSIDE the (protected) route group: the harness page itself is a
// developer tool, not household data, so it does not carry the requireAuthorizedPage
// gate (and the build-time auth check only scans (protected)/). The app it loads
// in its iframe *is* gated as usual — if this browser hasn't been authorized the
// frame will show /setup, which is correct.
//
// In a production build this route 404s, so it never ships to the wall. The check
// runs on the server; `notFound()` short-circuits before the client harness renders.
export const metadata: Metadata = {
  title: "Wall Preview — Hearth (dev)",
  robots: { index: false, follow: false },
};

export default function DevPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewHarness />;
}
