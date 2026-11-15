import { MCP_SCOPE, resourceUrl } from "./config";
import { clientSecretFor, readClient, safeEqual, sha256, type ClientInfo } from "./tokens";

// Shared pieces of Hearth's OAuth 2.1 authorization server: the discovery
// documents, redirect-URI and resource rules, client authentication and PKCE.
// The routes are src/app/api/oauth/* and src/app/.well-known/*.

const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };

/** A JSON response that is never cached (token endpoint rules, RFC 6749 §5.1). */
export function jsonNoStore(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/** An RFC 6749 error response. */
export function oauthError(
  error: string,
  description: string,
  status = 400,
  headers: Record<string, string> = {},
) {
  return jsonNoStore({ error, error_description: description }, status, headers);
}

/** A public discovery document (cacheable briefly, readable cross-origin). */
export function discoveryJson(body: unknown) {
  return Response.json(body, {
    headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
  });
}

/** RFC 9728 protected resource metadata. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Hearth",
  };
}

/** RFC 8414 authorization server metadata. No OIDC on purpose. */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    scopes_supported: [MCP_SCOPE],
    authorization_response_iss_parameter_supported: true,
  };
}

const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Whether a redirect URI may be registered: https on ChatGPT's hosts, or plain
 * http on localhost / 127.0.0.1 for local tests. No fragments, no credentials.
 */
export function isAllowedRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 512) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return CHATGPT_HOSTS.has(url.hostname) && !url.port;
  if (url.protocol === "http:") return LOCAL_HOSTS.has(url.hostname);
  return false;
}

/** A `resource` parameter is fine when absent or equal to the MCP URL (one trailing slash tolerated). */
export function resourceMatches(resource: string | null | undefined, origin: string): boolean {
  if (!resource) return true;
  const want = resourceUrl(origin);
  return resource === want || resource === `${want}/`;
}

/** PKCE S256: base64url(SHA-256(verifier)) equals the challenge. */
export function pkceMatches(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return safeEqual(sha256(verifier), challenge);
}

/** Read a form-encoded or JSON request body into a flat string map. */
export async function readParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  const out: Record<string, string> = {};
  try {
    if (type.includes("application/json")) {
      const body = (await req.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(body ?? {})) {
        if (typeof v === "string") out[k] = v;
      }
    } else {
      const form = new URLSearchParams(await req.text());
      for (const [k, v] of form) out[k] = v;
    }
  } catch {
    // An unreadable body is an empty one; the caller reports what's missing.
  }
  return out;
}

export type ClientAuth =
  | { ok: true; clientId: string; client: ClientInfo }
  | { ok: false; response: Response };

/**
 * Authenticate the client at the token or revocation endpoint: HTTP Basic
 * (client_secret_basic), body credentials (client_secret_post), or client_id
 * alone for a public client (none). Secrets compare in constant time.
 */
export function authenticateClient(
  req: Request,
  params: Record<string, string>,
  secret: string,
): ClientAuth {
  let clientId = params.client_id ?? "";
  let presented: string | undefined = params.client_secret;
  let usedBasic = false;

  const header = req.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("basic ")) {
    usedBasic = true;
    try {
      const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      if (idx < 0) throw new Error("no colon");
      clientId = decodeURIComponent(decoded.slice(0, idx));
      presented = decodeURIComponent(decoded.slice(idx + 1));
    } catch {
      return { ok: false, response: invalidClient(true) };
    }
  }

  const client = readClient(secret, clientId);
  if (!client) return { ok: false, response: invalidClient(usedBasic) };

  if (client.am !== "none") {
    if (!presented || !safeEqual(presented, clientSecretFor(secret, clientId))) {
      return { ok: false, response: invalidClient(usedBasic) };
    }
  }
  return { ok: true, clientId, client };
}

function invalidClient(basic: boolean): Response {
  return oauthError(
    "invalid_client",
    "Client authentication failed.",
    401,
    basic ? { "www-authenticate": 'Basic realm="hearth"' } : {},
  );
}

/** The caller's IP for rate limiting (first X-Forwarded-For hop behind Railway). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}
