import { mcpContext } from "@/lib/mcp/config";
import { discoveryJson, protectedResourceMetadata } from "@/lib/mcp/oauth";

// GET /.well-known/oauth-protected-resource — RFC 9728 metadata for the MCP
// endpoint, the first thing ChatGPT reads after its unauthenticated 401.
//
// PUBLIC on purpose: discovery documents carry no household data. One of the
// connector's narrow exceptions to "every handler calls requireDevice() first"
// (README → Security; enforced by scripts/check-protected-guards.mjs).
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const ctx = mcpContext(req);
  if (ctx instanceof Response) return ctx;
  return discoveryJson(protectedResourceMetadata(ctx.origin));
}
