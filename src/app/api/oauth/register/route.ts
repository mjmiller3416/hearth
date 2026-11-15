import { mcpContext } from "@/lib/mcp/config";
import { isAllowedRedirectUri, jsonNoStore, oauthError } from "@/lib/mcp/oauth";
import {
  clientSecretFor,
  issueClientId,
  nowS,
  type AuthMethod,
  type ClientInfo,
} from "@/lib/mcp/tokens";

// POST /api/oauth/register — Dynamic Client Registration (RFC 7591), which is
// how ChatGPT registers itself. Nothing is stored: the client id IS the signed
// client record (redirect URIs + auth method), and a confidential client's
// secret is derived from it. Clients never expire.
//
// PUBLIC on purpose: registering grants nothing. A client still needs the
// connect password (or the wall's device cookie) on the consent page, and may
// only send codes to ChatGPT's own redirect hosts (or localhost for tests).
export const dynamic = "force-dynamic";

const METHODS = new Set<AuthMethod>(["none", "client_secret_post", "client_secret_basic"]);
const GRANTS = new Set(["authorization_code", "refresh_token"]);

export async function POST(req: Request) {
  const ctx = mcpContext(req);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
  } catch {
    return oauthError("invalid_client_metadata", "The request body must be a JSON object.");
  }

  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 5) {
    return oauthError("invalid_redirect_uri", "Give one to five redirect_uris.");
  }
  for (const uri of uris) {
    if (!isAllowedRedirectUri(uri)) {
      return oauthError(
        "invalid_redirect_uri",
        "Redirect URIs must be https on chatgpt.com or chat.openai.com (or http on localhost).",
      );
    }
  }

  const method = (body.token_endpoint_auth_method ?? "client_secret_basic") as AuthMethod;
  if (!METHODS.has(method)) {
    return oauthError("invalid_client_metadata", "Unsupported token_endpoint_auth_method.");
  }

  const grants = body.grant_types ?? ["authorization_code", "refresh_token"];
  if (!Array.isArray(grants) || !grants.every((g) => GRANTS.has(g as string))) {
    return oauthError("invalid_client_metadata", "Only authorization_code and refresh_token.");
  }
  const responses = body.response_types ?? ["code"];
  if (!Array.isArray(responses) || !responses.every((r) => r === "code")) {
    return oauthError("invalid_client_metadata", "Only the code response type is supported.");
  }

  const name =
    typeof body.client_name === "string" ? body.client_name.trim().slice(0, 100) : undefined;
  const info: ClientInfo = { ru: uris as string[], am: method, iat: nowS() };
  if (name) info.n = name;
  const clientId = issueClientId(ctx.secret, info);

  return jsonNoStore(
    {
      client_id: clientId,
      ...(method !== "none" ? { client_secret: clientSecretFor(ctx.secret, clientId) } : {}),
      client_id_issued_at: info.iat,
      ...(method !== "none" ? { client_secret_expires_at: 0 } : {}),
      client_name: name,
      redirect_uris: info.ru,
      token_endpoint_auth_method: method,
      grant_types: grants,
      response_types: ["code"],
      scope: "mcp",
    },
    201,
  );
}
