import { mcpContext } from "@/lib/mcp/config";
import { authorizationServerMetadata, discoveryJson } from "@/lib/mcp/oauth";

// GET /.well-known/oauth-authorization-server — RFC 8414 metadata. There is
// deliberately no openid-configuration: ChatGPT asks for every OIDC scope it
// sees advertised. PUBLIC on purpose (discovery carries no household data).
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const ctx = mcpContext(req);
  if (ctx instanceof Response) return ctx;
  return discoveryJson(authorizationServerMetadata(ctx.origin));
}
