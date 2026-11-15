import { mcpContext } from "@/lib/mcp/config";
import { discoveryJson, protectedResourceMetadata } from "@/lib/mcp/oauth";

// GET /.well-known/oauth-protected-resource/api/mcp — the same RFC 9728
// document at its path-suffixed address (RFC 9728 §3.1), which some clients
// try first. PUBLIC on purpose (see the sibling route).
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const ctx = mcpContext(req);
  if (ctx instanceof Response) return ctx;
  return discoveryJson(protectedResourceMetadata(ctx.origin));
}
