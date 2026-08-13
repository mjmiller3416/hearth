// Railway health check (Phase 0 #15). Public (see middleware allowlist), cheap,
// and always 200 while the process is up.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
