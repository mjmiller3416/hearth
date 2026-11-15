// Configuration for Hearth's MCP server and its OAuth 2.1 authorization server
// (the ChatGPT connector). Server-side only.
//
//   HEARTH_MCP_ENABLED   Kill switch. "0", "false" or "off" turns every MCP and
//                        OAuth route (and the .well-known documents) into a 404.
//                        Default on.
//   HEARTH_MCP_SECRET    HMAC key for every client id, code and token (at least
//                        32 characters). Hearth has no database, so nothing is
//                        stored: rotating this secret revokes every connection.
//   HEARTH_MCP_PASSWORD  The connect password asked for on the consent page. A
//                        browser that already holds the wall's device cookie
//                        skips it. Unset → only such a browser can connect.
//   HEARTH_PUBLIC_URL    The public origin (https://…). Required in production:
//                        behind Railway's proxy the request's own host is the
//                        container's bind address, so it can't be trusted.

const OFF = new Set(["0", "false", "off", "no"]);

/** True unless the kill switch is set. */
export function isMcpEnabled(): boolean {
  const raw = process.env.HEARTH_MCP_ENABLED?.trim().toLowerCase();
  return !raw || !OFF.has(raw);
}

/** The signing secret, or null when it's missing or too short to be safe. */
export function getMcpSecret(): string | null {
  const raw = process.env.HEARTH_MCP_SECRET?.trim();
  return raw && raw.length >= 32 ? raw : null;
}

/** The connect password, or null when none is configured. */
export function getConnectPassword(): string | null {
  return process.env.HEARTH_MCP_PASSWORD?.trim() || null;
}

/**
 * The public origin with no trailing slash, e.g. "https://hearth.example".
 * From HEARTH_PUBLIC_URL; outside production it falls back to the request's
 * own origin so `next dev` works without it. Null when it can't be known.
 */
export function getPublicOrigin(req: Request): string | null {
  const configured = process.env.HEARTH_PUBLIC_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      return null;
    }
  }
  if (process.env.NODE_ENV === "production") return null;
  return new URL(req.url).origin;
}

/** The MCP endpoint's URL — the OAuth `resource` and the access token audience. */
export function resourceUrl(origin: string): string {
  return `${origin}/api/mcp`;
}

export interface McpContext {
  origin: string;
  secret: string;
}

/**
 * Everything the connector's routes need, or the response to send instead:
 * 404 when the kill switch is off, 503 when the secret or origin is missing.
 */
export function mcpContext(req: Request): McpContext | Response {
  if (!isMcpEnabled()) return new Response("Not found", { status: 404 });
  const secret = getMcpSecret();
  const origin = getPublicOrigin(req);
  if (!secret || !origin) {
    return new Response("The ChatGPT connector isn't set up on this Hearth.", {
      status: 503,
    });
  }
  return { origin, secret };
}

/** The OAuth scope Hearth grants: everything the wall can do. */
export const MCP_SCOPE = "mcp";
