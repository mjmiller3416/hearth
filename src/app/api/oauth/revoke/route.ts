import { mcpContext } from "@/lib/mcp/config";
import { authenticateClient, readParams } from "@/lib/mcp/oauth";
import { clientHash, readAnyToken, revokeFamily } from "@/lib/mcp/tokens";

// POST /api/oauth/revoke — token revocation (RFC 7009). Revokes the whole
// connection the token belongs to, in this process only (no database). The
// durable "disconnect everyone" is rotating HEARTH_MCP_SECRET.
//
// PUBLIC on purpose: it authenticates the client, and can only take access away.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = mcpContext(req);
  if (ctx instanceof Response) return ctx;

  const params = await readParams(req);
  const auth = authenticateClient(req, params, ctx.secret);
  if (!auth.ok) return auth.response;

  const info = readAnyToken(ctx.secret, params.token);
  if (info && info.cid === clientHash(auth.clientId)) revokeFamily(info.fam);
  // RFC 7009 §2.2: answer 200 whether or not the token was valid.
  return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
}
