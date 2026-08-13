import type { NextConfig } from "next";

// Baseline security headers. Hearth holds all upstream credentials server-side
// (route handlers only) and never ships them to the browser, so the browser is
// treated as untrusted: a wall-mounted tablet that guests walk past.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Screen Wake Lock is used to keep the display awake; everything else off.
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Standalone output for the Railway Docker deploy.
  output: "standalone",

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
