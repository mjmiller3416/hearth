import { NextResponse, type NextRequest } from "next/server";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
  tokensMatch,
} from "@/lib/auth";

// One-time device authorization (spec §6.3, Phase 0 #7).
//
//   GET /setup?token=<HEARTH_DEVICE_TOKEN>
//
// This is the ONLY unauthenticated surface. It lives in the (public) route
// group, outside the (protected) layout gate — placing it under the gate would
// redirect-loop, since an unauthorized device would be sent to /setup only to
// be gated again.
//
// If the token matches, set a long-lived httpOnly cookie and redirect into the
// app. From then on the device is authorized and never sees this again. With
// no/invalid token, show a quiet instruction page (401) — never echo the token.
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const expected = process.env.HEARTH_DEVICE_TOKEN;
  const presented = req.nextUrl.searchParams.get("token") ?? "";

  if (tokensMatch(presented, expected)) {
    const url = req.nextUrl.clone();
    url.pathname = "/calendar";
    url.search = "";
    const res = NextResponse.redirect(url);
    res.cookies.set(DEVICE_COOKIE, expected as string, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_COOKIE_MAX_AGE,
    });
    return res;
  }

  const configured = Boolean(expected);
  return new NextResponse(unauthorizedPage(configured), {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function unauthorizedPage(configured: boolean): string {
  const message = configured
    ? "This screen isn’t authorized yet. Open its URL with the device token appended as <code>?token=…</code> to pair it. You only do this once."
    : "The device token isn’t configured on the server. Set <code>HEARTH_DEVICE_TOKEN</code> in the environment, then open this URL with <code>?token=…</code>.";

  // Inline-styled: Tailwind doesn't apply to a raw Response, and this page must
  // render even if the app bundle is broken.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hearth · Setup</title>
    <style>
      html, body { margin: 0; height: 100%; }
      body {
        display: flex; align-items: center; justify-content: center;
        background: #f4efe4; color: #2b2620;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      .card { max-width: 34rem; padding: 2.5rem; text-align: center; }
      h1 { font-size: 2rem; margin: 0 0 0.75rem; font-weight: 600; }
      p { font-size: 1.15rem; line-height: 1.6; color: #6f675a; margin: 0; }
      code {
        background: #efe8d9; padding: 0.1em 0.35em; border-radius: 0.3rem;
        font-size: 0.95em;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Hearth</h1>
      <p>${message}</p>
    </div>
  </body>
</html>`;
}
