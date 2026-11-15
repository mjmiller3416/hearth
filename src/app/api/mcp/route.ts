import { handleMcp, requireMcpAccess } from "@/lib/mcp/server";

// POST /api/mcp — Hearth's MCP server (Streamable HTTP, stateless, JSON), the
// URL pasted into ChatGPT as a custom connector. Tools: src/lib/mcp/tools.ts.
//
// SECURITY: authenticates with an OAuth 2.1 access token instead of the device
// cookie — the connector's one deliberate exception to "every handler calls
// requireDevice() first". `requireMcpAccess(req)` is the FIRST statement of
// every handler here (scripts/check-protected-guards.mjs enforces it); without
// a valid token it answers 401 with the discovery header ChatGPT follows.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireMcpAccess(req);
  if (denied) return denied;
  return handleMcp(req);
}

/** No server-initiated stream: stateless JSON only. */
export async function GET(req: Request) {
  const denied = await requireMcpAccess(req);
  if (denied) return denied;
  return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}

/** No sessions to end. */
export async function DELETE(req: Request) {
  const denied = await requireMcpAccess(req);
  if (denied) return denied;
  return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}
