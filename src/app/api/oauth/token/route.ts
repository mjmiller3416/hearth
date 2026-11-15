import { mcpContext, MCP_SCOPE, resourceUrl } from "@/lib/mcp/config";
import {
  authenticateClient,
  jsonNoStore,
  oauthError,
  pkceMatches,
  readParams,
  resourceMatches,
} from "@/lib/mcp/oauth";
import {
  clientHash,
  consumeCode,
  consumeRefresh,
  issueTokens,
  readCode,
  readRefreshToken,
} from "@/lib/mcp/tokens";

// POST /api/oauth/token — the token endpoint (authorization_code with PKCE S256,
// and refresh_token with rotation). Tokens are signed, not stored: access 1 h,
// refresh 90 days from last use. A rotated refresh token is refused within this
// process but becomes usable again after a restart until it expires — the price
// of having no database (see CLAUDE.md → MCP).
//
// PUBLIC on purpose: this endpoint authenticates the client itself, and a code
// or refresh token is the credential.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = mcpContext(req);
  if (ctx instanceof Response) return ctx;

  const params = await readParams(req);
  const auth = authenticateClient(req, params, ctx.secret);
  if (!auth.ok) return auth.response;
  const cid = clientHash(auth.clientId);

  if (!resourceMatches(params.resource, ctx.origin)) {
    return oauthError("invalid_target", "That resource isn't served here.");
  }

  if (params.grant_type === "authorization_code") {
    const code = readCode(ctx.secret, params.code);
    if (!code || code.cid !== cid) {
      return oauthError("invalid_grant", "The code is invalid or expired.");
    }
    if (code.ru !== params.redirect_uri) {
      return oauthError("invalid_grant", "redirect_uri doesn't match the authorization request.");
    }
    if (!pkceMatches(params.code_verifier, code.cc)) {
      return oauthError("invalid_grant", "PKCE verification failed.");
    }
    if (!consumeCode(code)) {
      return oauthError("invalid_grant", "The code was already used.");
    }
    return jsonNoStore(
      issueTokens(ctx.secret, { cid, fam: code.jti, scope: MCP_SCOPE, aud: code.res }),
    );
  }

  if (params.grant_type === "refresh_token") {
    const refresh = readRefreshToken(ctx.secret, params.refresh_token);
    if (!refresh || refresh.cid !== cid || refresh.aud !== resourceUrl(ctx.origin)) {
      return oauthError("invalid_grant", "The refresh token is invalid or expired.");
    }
    if (!consumeRefresh(refresh)) {
      return oauthError("invalid_grant", "The refresh token was already used.");
    }
    return jsonNoStore(
      issueTokens(ctx.secret, { cid, fam: refresh.fam, scope: MCP_SCOPE, aud: refresh.aud }),
    );
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}
